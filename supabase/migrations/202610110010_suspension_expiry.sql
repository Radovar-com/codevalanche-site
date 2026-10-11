begin;
create table public.codevalanche_suspension_expiry_jobs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,actor_id uuid not null,generation bigint not null,due_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','completed','superseded')),lease_id uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now(),attempts integer not null default 0,
 created_at timestamptz not null default now(),completed_at timestamptz,unique(user_id,generation)
);
alter table public.codevalanche_suspension_expiry_jobs enable row level security;
revoke all on public.codevalanche_suspension_expiry_jobs from public,anon,authenticated;
grant select on public.codevalanche_suspension_expiry_jobs to service_role;
create function public.codevalanche_enqueue_suspension_expiry() returns trigger language plpgsql security definer set search_path='' as $$
declare v_policy public.codevalanche_account_state;
begin
 if new.action='admin.account.suspend' then
  select * into v_policy from public.codevalanche_account_state where user_id=new.user_id;
  if v_policy.suspended_until is not null then insert into public.codevalanche_suspension_expiry_jobs(user_id,actor_id,generation,due_at) values(new.user_id,new.actor_id,v_policy.suspension_generation,v_policy.suspended_until) on conflict do nothing;end if;
 end if;return new;
end $$;
create trigger codevalanche_enqueue_suspension_expiry after insert on public.codevalanche_operation_jobs for each row execute function public.codevalanche_enqueue_suspension_expiry();
create function public.codevalanche_claim_suspension_expiry(p_user_id uuid,p_lease_id uuid)
returns setof public.codevalanche_suspension_expiry_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_suspension_expiry_jobs;v_policy public.codevalanche_account_state;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_policy from public.codevalanche_account_state where user_id=p_user_id;
 update public.codevalanche_suspension_expiry_jobs j set state='superseded',lease_id=null,lease_until=null where j.user_id=p_user_id and j.state='pending' and (v_policy.user_id is null or j.generation<>v_policy.suspension_generation or j.due_at is distinct from v_policy.suspended_until or v_policy.status not in ('suspended','deletion_pending'));
 if v_policy.status is distinct from 'suspended' or v_policy.suspended_until is null or v_policy.suspended_until>now() then return;end if;
 if exists(select 1 from public.codevalanche_operation_jobs j where j.user_id=p_user_id and j.accepted_suspension_generation=v_policy.suspension_generation and j.provider_state in ('inflight','unknown')) then return;end if;
 return query update public.codevalanche_suspension_expiry_jobs j set lease_id=p_lease_id,lease_until=now()+interval '30 seconds',attempts=j.attempts+1 where j.user_id=p_user_id and j.generation=v_policy.suspension_generation and j.state='pending' and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now()) returning j.*;
end $$;
create function public.codevalanche_settle_suspension_expiry(p_id uuid,p_lease_id uuid,p_provider_expired boolean)
returns setof public.codevalanche_suspension_expiry_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_suspension_expiry_jobs;v_policy public.codevalanche_account_state;v_state text;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_suspension_expiry_jobs where id=p_id and lease_id=p_lease_id and lease_until>now() and state='pending' for update;
 if not found then raise exception 'operation_conflict';end if;
 select * into v_policy from public.codevalanche_account_state where user_id=v_job.user_id for update;
 if v_policy.user_id is null or v_policy.status<>'suspended' or v_policy.suspension_generation<>v_job.generation or v_policy.suspended_until is distinct from v_job.due_at then v_state:='superseded';
 elsif p_provider_expired and v_job.due_at<=now() and not exists(select 1 from public.codevalanche_operation_jobs j where j.user_id=v_job.user_id and j.accepted_suspension_generation=v_job.generation and j.provider_state in ('inflight','unknown')) then
  update public.codevalanche_account_state set status='active',blocked=false,suspended_until=null,policy_version=policy_version+1,updated_at=now() where user_id=v_job.user_id;
  v_state:='completed';
 else v_state:='pending';end if;
 update public.codevalanche_suspension_expiry_jobs set state=v_state,lease_id=null,lease_until=null,next_attempt_at=now()+interval '15 seconds',completed_at=case when v_state='completed' then now() else null end where id=p_id;
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code) values(v_job.id,v_job.actor_id,v_job.user_id,'system.account.expire-suspension',case when v_state='completed' then 'completed' else 'pending' end,case when v_state='superseded' then 'superseded_suspension' else 'suspension_expired' end);
 return query select * from public.codevalanche_suspension_expiry_jobs where id=p_id;
end $$;
revoke all on function public.codevalanche_enqueue_suspension_expiry() from public,anon,authenticated,service_role;
revoke all on function public.codevalanche_claim_suspension_expiry(uuid,uuid),public.codevalanche_settle_suspension_expiry(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.codevalanche_claim_suspension_expiry(uuid,uuid),public.codevalanche_settle_suspension_expiry(uuid,uuid,boolean) to service_role;
commit;
