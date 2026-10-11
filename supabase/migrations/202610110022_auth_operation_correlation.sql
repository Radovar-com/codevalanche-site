begin;
create table public.codevalanche_auth_correlation_config(singleton boolean primary key default true check(singleton),qualified boolean not null default false);
insert into public.codevalanche_auth_correlation_config values(true,false);
create table public.codevalanche_auth_operation_attempts(
 attempt_id uuid primary key,operation_id uuid not null references public.codevalanche_operation_jobs(operation_id) on delete cascade,user_id uuid not null,
 binding jsonb not null,expected_ban_until timestamptz,state text not null default 'prepared' check(state in ('prepared','committed','fenced')),
 created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz
);
alter table public.codevalanche_operation_jobs add column provider_receipt_required boolean not null default false;
alter table public.codevalanche_auth_correlation_config enable row level security;
alter table public.codevalanche_auth_operation_attempts enable row level security;
revoke all on public.codevalanche_auth_correlation_config,public.codevalanche_auth_operation_attempts from public,anon,authenticated,service_role;
create function public.codevalanche_auth_correlation_qualified() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select qualified from public.codevalanche_auth_correlation_config where singleton),false)
 and (select count(*)=3 from pg_catalog.pg_attribute where attrelid='auth.users'::regclass and not attisdropped and ((attname='raw_app_meta_data' and atttypid='jsonb'::regtype) or (attname='banned_until' and atttypid='timestamptz'::regtype) or (attname='id' and atttypid='uuid'::regtype)))
 and (select count(*)=2 from pg_catalog.pg_trigger where tgrelid='auth.users'::regclass and tgname in ('codevalanche_auth_operation_guard','codevalanche_auth_operation_commit') and tgenabled='A')
$$;
-- This is an application-enforced transaction protocol, not provider idempotency.
create function public.codevalanche_auth_operation_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v_binding jsonb;v_attempt public.codevalanche_auth_operation_attempts;v_job public.codevalanche_operation_jobs;v_policy public.codevalanche_account_state;
begin
 v_binding:=to_jsonb(new)->'raw_app_meta_data'->'codevalanche_operation_v1';
 if v_binding is null or v_binding='null'::jsonb then return new;end if;
 if not public.codevalanche_auth_correlation_qualified() then raise exception 'worker_not_configured';end if;
 perform pg_advisory_xact_lock(61101003);
 select * into v_attempt from public.codevalanche_auth_operation_attempts where attempt_id=(v_binding->>'attemptId')::uuid for update;
 if not found or v_attempt.binding is distinct from v_binding or v_attempt.user_id<>new.id or v_attempt.state<>'prepared' then raise exception 'operation_conflict';end if;
 select * into v_job from public.codevalanche_operation_jobs where operation_id=v_attempt.operation_id for update;
 select * into v_policy from public.codevalanche_account_state where user_id=new.id for update;
 if v_job.state<>'pending' or not v_job.provider_receipt_required or v_job.provider_attempt_id<>v_attempt.attempt_id or v_job.provider_state not in ('inflight','unknown') or v_policy.user_id is null or v_policy.policy_version<>v_job.accepted_policy_version or v_policy.suspension_generation<>v_job.accepted_suspension_generation or v_policy.status<>'suspended' or not exists(select 1 from public.codevalanche_admin_memberships m where m.user_id=v_job.actor_id and m.active and m.role in ('owner','accounts_admin')) or exists(select 1 from public.codevalanche_account_state a where a.user_id=v_job.actor_id and (a.blocked or a.status<>'active')) then raise exception 'operation_conflict';end if;
 if v_job.action='admin.account.suspend' and v_attempt.expected_ban_until<=clock_timestamp() then raise exception 'operation_conflict';end if;
 if v_job.action='admin.account.suspend' and (not v_policy.blocked or v_policy.suspended_until is distinct from (v_job.parameters->>'until')::timestamptz) then raise exception 'operation_conflict';end if;
 -- Canonical absolute deadline avoids a delayed relative ban extending an old timed intent.
 new.banned_until:=v_attempt.expected_ban_until;
 return new;
end $$;
create function public.codevalanche_auth_operation_commit() returns trigger language plpgsql security definer set search_path='' as $$
declare v_binding jsonb;v_attempt public.codevalanche_auth_operation_attempts;v_actual timestamptz;
begin
 v_binding:=to_jsonb(new)->'raw_app_meta_data'->'codevalanche_operation_v1';
 if v_binding is null or v_binding='null'::jsonb then return null;end if;
 if not public.codevalanche_auth_correlation_qualified() then raise exception 'worker_not_configured';end if;
 select * into v_attempt from public.codevalanche_auth_operation_attempts where attempt_id=(v_binding->>'attemptId')::uuid for update;
 if v_attempt.state='committed' and v_attempt.binding=v_binding then return null;end if;
 if v_attempt.state<>'prepared' or v_attempt.binding is distinct from v_binding then raise exception 'operation_conflict';end if;
 select u.banned_until into v_actual from auth.users u where u.id=v_attempt.user_id;
 if not found or v_actual is distinct from v_attempt.expected_ban_until then raise exception 'operation_conflict';end if;
 update public.codevalanche_auth_operation_attempts set state='committed',resolved_at=clock_timestamp() where attempt_id=v_attempt.attempt_id;
 -- Same transaction: no committed Auth mutation without its immutable receipt, and vice versa.
 update public.codevalanche_operation_jobs set provider_state='confirmed',provider_completed_at=clock_timestamp(),error_code=null where operation_id=v_attempt.operation_id and provider_attempt_id=v_attempt.attempt_id;
 update auth.users set raw_app_meta_data=raw_app_meta_data-'codevalanche_operation_v1' where id=v_attempt.user_id;
 return null;
end $$;
create trigger codevalanche_auth_operation_guard before update on auth.users for each row execute function public.codevalanche_auth_operation_guard();
create constraint trigger codevalanche_auth_operation_commit after update on auth.users deferrable initially deferred for each row execute function public.codevalanche_auth_operation_commit();
alter table auth.users enable always trigger codevalanche_auth_operation_guard;
alter table auth.users enable always trigger codevalanche_auth_operation_commit;
create function public.codevalanche_prepare_correlated_operation(p_operation_id uuid,p_lease_id uuid)
returns table(allowed boolean,decision text,binding jsonb) language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_operation_jobs;v_attempt public.codevalanche_auth_operation_attempts;v_prepare record;v_binding jsonb;v_deadline timestamptz;
begin
 perform pg_advisory_xact_lock(61101003);
 if not public.codevalanche_auth_correlation_qualified() then raise exception 'worker_not_configured';end if;
 select * into v_job from public.codevalanche_operation_jobs where operation_id=p_operation_id and state='pending' and lease_id=p_lease_id and lease_until>clock_timestamp() for update;
 if not found then raise exception 'operation_conflict';end if;
 if v_job.provider_state in ('inflight','unknown') and not v_job.provider_receipt_required then
  -- Legacy unmarked requests cannot be retrospectively fenced or promoted by a user read.
  return query select false,'indeterminate'::text,null::jsonb;return;
 end if;
 if v_job.provider_receipt_required and v_job.provider_state in ('inflight','unknown') then
  select * into v_attempt from public.codevalanche_auth_operation_attempts where attempt_id=v_job.provider_attempt_id for update;
  if not found then raise exception 'operation_conflict';end if;
  if v_attempt.state='committed' then update public.codevalanche_operation_jobs set provider_state='confirmed' where operation_id=p_operation_id;
  elsif v_attempt.state='prepared' then
   if v_attempt.attempt_id=p_lease_id then raise exception 'operation_conflict';end if;
   -- Under the same locks used by the Auth guard: an old transaction either already committed
   -- its receipt, or this fence prevents it from committing now or later. No time-based inference.
   update public.codevalanche_auth_operation_attempts set state='fenced',resolved_at=clock_timestamp() where attempt_id=v_attempt.attempt_id;
   update public.codevalanche_operation_jobs set provider_state='rejected' where operation_id=p_operation_id;
  end if;
 end if;
 select * into v_prepare from public.codevalanche_prepare_operation_provider(p_operation_id,p_lease_id);
 if not v_prepare.allowed then return query select false,v_prepare.decision,null::jsonb;return;end if;
 select * into v_job from public.codevalanche_operation_jobs where operation_id=p_operation_id;
 v_deadline:=case when v_job.action='admin.account.reactivate' then null else coalesce((v_job.parameters->>'until')::timestamptz,clock_timestamp()+interval '100 years') end;
 v_binding:=jsonb_build_object('operationId',v_job.operation_id,'attemptId',p_lease_id,'userId',v_job.user_id,'action',v_job.action,'policyVersion',v_job.accepted_policy_version,'suspensionGeneration',v_job.accepted_suspension_generation,'until',v_job.parameters->'until','banUntil',v_deadline);
 insert into public.codevalanche_auth_operation_attempts(attempt_id,operation_id,user_id,binding,expected_ban_until) values(p_lease_id,p_operation_id,v_job.user_id,v_binding,v_deadline);
 update public.codevalanche_operation_jobs set provider_receipt_required=true where operation_id=p_operation_id;
 return query select true,'prepared'::text,v_binding;
end $$;
create function public.codevalanche_read_operation_receipt(p_operation_id uuid,p_attempt_id uuid)
returns table(decision text,current_binding boolean) language sql stable security definer set search_path='' as $$
 select a.state,exists(select 1 from public.codevalanche_account_state s where s.user_id=j.user_id and s.policy_version=j.accepted_policy_version and s.suspension_generation=j.accepted_suspension_generation and s.status='suspended')
 from public.codevalanche_auth_operation_attempts a join public.codevalanche_operation_jobs j using(operation_id,user_id)
 where a.operation_id=p_operation_id and a.attempt_id=p_attempt_id and j.provider_attempt_id=p_attempt_id and j.provider_receipt_required
$$;
-- A worker's boolean cannot fabricate a correlated Auth commit receipt.
alter function public.codevalanche_record_operation_provider(uuid,uuid,boolean,boolean) rename to codevalanche_record_legacy_operation_provider;
revoke all on function public.codevalanche_record_legacy_operation_provider(uuid,uuid,boolean,boolean) from public,anon,authenticated,service_role,codevalanche_operation_worker;
create function public.codevalanche_record_operation_provider(p_operation_id uuid,p_attempt_id uuid,p_confirmed boolean,p_rejected boolean default false)
returns setof public.codevalanche_operation_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_operation_jobs;
begin
 select * into v_job from public.codevalanche_operation_jobs where operation_id=p_operation_id for update;
 if v_job.provider_receipt_required then
  if v_job.provider_attempt_id<>p_attempt_id then raise exception 'operation_conflict';end if;
  if p_confirmed or p_rejected then raise exception 'operation_conflict';end if;
  if exists(select 1 from public.codevalanche_auth_operation_attempts where attempt_id=p_attempt_id and state='committed') then return next v_job;return;end if;
 end if;
 return query select * from public.codevalanche_record_legacy_operation_provider(p_operation_id,p_attempt_id,p_confirmed,p_rejected);
end $$;
revoke all on function public.codevalanche_auth_correlation_qualified(),public.codevalanche_auth_operation_guard(),public.codevalanche_auth_operation_commit(),public.codevalanche_prepare_correlated_operation(uuid,uuid),public.codevalanche_read_operation_receipt(uuid,uuid),public.codevalanche_record_operation_provider(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.codevalanche_prepare_correlated_operation(uuid,uuid),public.codevalanche_read_operation_receipt(uuid,uuid),public.codevalanche_record_operation_provider(uuid,uuid,boolean,boolean) to codevalanche_operation_worker,service_role;
create or replace function public.codevalanche_settle_operation(p_operation_id uuid,p_lease_id uuid,p_success boolean)
returns table(operation_id uuid,state text) language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_operation_jobs;v_state text;v_superseded boolean:=false;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id and j.lease_id=p_lease_id and j.state='pending' and j.lease_until>now() for update;
 if not found then raise exception 'operation_conflict'; end if;
 if not exists(select 1 from public.codevalanche_account_state where user_id=v_job.user_id and policy_version=v_job.accepted_policy_version and suspension_generation=v_job.accepted_suspension_generation and status not in ('deletion_pending','deleted')) or not exists(select 1 from public.codevalanche_admin_memberships where user_id=v_job.actor_id and active and role in ('owner','accounts_admin')) or exists(select 1 from public.codevalanche_account_state where user_id=v_job.actor_id and (blocked or status<>'active')) then p_success:=false;v_superseded:=true;end if;
 if v_job.provider_receipt_required and not exists(select 1 from public.codevalanche_auth_operation_attempts a where a.attempt_id=v_job.provider_attempt_id and a.operation_id=v_job.operation_id and a.user_id=v_job.user_id and (a.state='committed' or (v_job.provider_state='not_needed' and a.state='fenced'))) then p_success:=false;end if;
 if v_job.provider_state in ('inflight','unknown') then p_success:=false;end if;
 v_state:=case when v_superseded and v_job.provider_state not in ('inflight','unknown') then 'failed' when p_success then 'completed' when v_job.provider_state in ('inflight','unknown') then 'pending' when v_job.attempts>=8 then 'failed' else 'pending' end;
 if p_success and v_job.action='admin.account.reactivate' then
  update public.codevalanche_account_state set status='active',blocked=false,suspended_until=null,policy_version=policy_version+1,updated_at=now() where user_id=v_job.user_id and status='suspended';
 end if;
 update public.codevalanche_operation_jobs j set state=v_state,lease_id=null,lease_until=null,error_code=case when v_superseded then 'operation_superseded' when p_success then null when v_job.provider_state in ('inflight','unknown') then 'provider_result_unknown' else 'provider_reconciliation_pending' end,completed_at=case when p_success then now() else null end,updated_at=now() where j.operation_id=p_operation_id;
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code) values(v_job.operation_id,v_job.actor_id,v_job.user_id,v_job.action,v_state,v_job.reason_code);
 return query select p_operation_id,v_state;
end $$;
create function public.codevalanche_abort_unissued_operation(p_operation_id uuid,p_lease_id uuid)
returns table(decision text) language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_operation_jobs;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_operation_jobs where operation_id=p_operation_id and lease_id=p_lease_id and lease_until>clock_timestamp() and state='pending' and provider_state='inflight' and provider_attempt_id=p_lease_id for update;
 if not found or v_job.action<>'admin.account.suspend' or v_job.parameters->>'until' is null or (v_job.parameters->>'until')::timestamptz>clock_timestamp() then raise exception 'operation_conflict';end if;
 if v_job.provider_receipt_required then
  if not public.codevalanche_auth_correlation_qualified() then raise exception 'worker_not_configured';end if;
  update public.codevalanche_auth_operation_attempts set state='fenced',resolved_at=clock_timestamp() where attempt_id=p_lease_id and operation_id=p_operation_id and state='prepared';
  if not found then raise exception 'operation_conflict';end if;
 end if;
 -- Only the current trusted worker can call this before invoking Auth. Unknown/old claims refuse.
 update public.codevalanche_operation_jobs set provider_state='not_needed',provider_completed_at=clock_timestamp(),error_code='expired_before_dispatch' where operation_id=p_operation_id;
 return query select 'not_issued'::text;
end $$;
revoke all on function public.codevalanche_abort_unissued_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.codevalanche_abort_unissued_operation(uuid,uuid) to codevalanche_operation_worker,service_role;
commit;
