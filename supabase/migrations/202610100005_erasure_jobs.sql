begin;
create table public.codevalanche_account_erasure_jobs (
 job_id uuid primary key default gen_random_uuid(),operation_id uuid unique not null,user_id uuid not null,actor_id uuid not null,
 state text not null default 'queued' check(state in ('queued','purging','completed','cancelled','failed')),
 previous_status text not null,due_at timestamptz not null,created_at timestamptz not null default now(),purge_started_at timestamptz,
 storage_cleaned_at timestamptz,auth_delete_started_at timestamptz,auth_deleted_at timestamptz,completed_at timestamptz,
 lease_id uuid,lease_until timestamptz,attempts integer not null default 0
);
alter table public.codevalanche_account_state add column erasure_job_id uuid;
alter table public.codevalanche_account_erasure_jobs enable row level security;
revoke all on public.codevalanche_account_erasure_jobs from public,anon,authenticated;
grant select on public.codevalanche_account_erasure_jobs to service_role;
create function public.codevalanche_request_erasure(p_user_id uuid,p_actor_id uuid,p_operation_id uuid)
returns setof public.codevalanche_account_erasure_jobs language plpgsql security definer set search_path='' as $$
declare v_policy public.codevalanche_account_state;v_job public.codevalanche_account_erasure_jobs;v_role text;
begin
 perform pg_advisory_xact_lock(61101003);
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'not_found'; end if;
 if p_actor_id<>p_user_id then
  select role into v_role from public.codevalanche_admin_memberships where user_id=p_actor_id and active;
  if v_role is null or v_role not in ('owner','accounts_admin') then raise exception 'administrator_required';end if;
 end if;
 if exists(select 1 from public.codevalanche_admin_memberships where user_id=p_user_id and role='owner' and active) then
  if p_actor_id<>p_user_id and v_role<>'owner' then raise exception 'account_forbidden';end if;
  if (select count(*) from public.codevalanche_admin_memberships m left join public.codevalanche_account_state a on a.user_id=m.user_id where m.role='owner' and m.active and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false))<=1 then raise exception 'last_owner_protected';end if;
 end if;
 select * into v_job from public.codevalanche_account_erasure_jobs where operation_id=p_operation_id;
 if found then if v_job.user_id<>p_user_id or v_job.actor_id<>p_actor_id then raise exception 'operation_conflict';end if;return next v_job;return;end if;
 insert into public.codevalanche_account_state(user_id) values(p_user_id) on conflict do nothing;
 select * into v_policy from public.codevalanche_account_state where user_id=p_user_id for update;
 if v_policy.erasure_job_id is not null or exists(select 1 from public.codevalanche_operation_jobs where user_id=p_user_id and state='pending') then raise exception 'operation_conflict';end if;
 insert into public.codevalanche_account_erasure_jobs(operation_id,user_id,actor_id,previous_status,due_at) values(p_operation_id,p_user_id,p_actor_id,v_policy.status,now()+interval '30 days') returning * into v_job;
 update public.codevalanche_account_state set status='deletion_pending',erasure_job_id=v_job.job_id,deletion_requested_at=now(),deletion_scheduled_for=v_job.due_at,policy_version=policy_version+1 where user_id=p_user_id;
 insert into public.codevalanche_revoked_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=p_user_id on conflict do nothing;
 return next v_job;
end $$;
create function public.codevalanche_cancel_erasure(p_user_id uuid)
returns table(state text) language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_account_erasure_jobs;
begin
 perform pg_advisory_xact_lock(61101003);
 select j.* into v_job from public.codevalanche_account_erasure_jobs j join public.codevalanche_account_state a on a.erasure_job_id=j.job_id and a.user_id=j.user_id where j.user_id=p_user_id and j.state in ('queued','purging') for update of j;
 if not found then raise exception 'not_found';end if;
 if v_job.purge_started_at is not null then raise exception 'operation_conflict';end if;
 update public.codevalanche_account_erasure_jobs j set state='cancelled' where j.job_id=v_job.job_id;
 update public.codevalanche_account_state a set status=case when a.blocked then 'suspended' else v_job.previous_status end,erasure_job_id=null,deletion_requested_at=null,deletion_scheduled_for=null,policy_version=policy_version+1 where a.user_id=p_user_id;
 return query select 'cancelled'::text;
end $$;
create function public.codevalanche_erasure_storage(p_user_id uuid)
returns table(bucket_id text,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if to_regclass('storage.objects') is null then return;end if;
 if exists(select 1 from pg_catalog.pg_attribute where attrelid=to_regclass('storage.objects') and attname='owner_id' and not attisdropped) then
  return query execute 'select bucket_id::text,name::text from storage.objects where owner_id=$1::text order by bucket_id,name limit 100' using p_user_id;
 else raise exception 'storage_schema_unqualified';end if;
end $$;
create function public.codevalanche_erasure_inspect(p_job_id uuid)
returns table(state text,due_at timestamptz,storage_count bigint) language sql stable security definer set search_path='' as $$ select j.state,j.due_at,(select count(*) from public.codevalanche_erasure_storage(j.user_id)) from public.codevalanche_account_erasure_jobs j where j.job_id=p_job_id $$;
create function public.codevalanche_erasure_claim(p_job_id uuid,p_lease_id uuid)
returns table(decision text,user_id uuid,storage_cleaned_at timestamptz,auth_delete_started_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_account_erasure_jobs;v_policy public.codevalanche_account_state;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_account_erasure_jobs where job_id=p_job_id for update;
 if not found then return query select 'blocked'::text,null::uuid,null::timestamptz,null::timestamptz;return;end if;
 if v_job.state in ('cancelled','completed','failed') then return query select v_job.state,v_job.user_id,v_job.storage_cleaned_at,v_job.auth_delete_started_at;return;end if;
 select * into v_policy from public.codevalanche_account_state a where a.user_id=v_job.user_id;
 if exists(select 1 from public.codevalanche_admin_memberships m where m.user_id=v_job.user_id and m.active and m.role='owner') and (select count(*) from public.codevalanche_admin_memberships m left join public.codevalanche_account_state a on a.user_id=m.user_id where m.role='owner' and m.active and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false))<1 then return query select 'blocked'::text,v_job.user_id,v_job.storage_cleaned_at,v_job.auth_delete_started_at;return;end if;
 if v_job.auth_delete_started_at is null and (v_policy.user_id is null or v_policy.erasure_job_id is distinct from v_job.job_id or v_policy.status<>'deletion_pending' or v_policy.deletion_scheduled_for is distinct from v_job.due_at) then return query select 'blocked'::text,v_job.user_id,v_job.storage_cleaned_at,v_job.auth_delete_started_at;return;end if;
 if v_job.due_at>now() then return query select 'not_due'::text,v_job.user_id,v_job.storage_cleaned_at,v_job.auth_delete_started_at;return;end if;
 if v_job.lease_until>now() then return query select 'pending'::text,v_job.user_id,v_job.storage_cleaned_at,v_job.auth_delete_started_at;return;end if;
 update public.codevalanche_account_erasure_jobs j set state='purging',purge_started_at=coalesce(j.purge_started_at,now()),lease_id=p_lease_id,lease_until=now()+interval '60 seconds',attempts=attempts+1 where j.job_id=p_job_id;
 return query select 'claimed'::text,v_job.user_id,v_job.storage_cleaned_at,v_job.auth_delete_started_at;
end $$;
create function public.codevalanche_erasure_advance(p_job_id uuid,p_lease_id uuid,p_step text)
returns setof public.codevalanche_account_erasure_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_account_erasure_jobs;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_account_erasure_jobs j where j.job_id=p_job_id and j.lease_id=p_lease_id and j.lease_until>now() and j.state='purging' for update;
 if not found then raise exception 'operation_conflict';end if;
 if p_step='storage_cleaned' then
  if exists(select 1 from public.codevalanche_erasure_storage(v_job.user_id)) then raise exception 'operation_conflict';end if;
  update public.codevalanche_account_erasure_jobs set storage_cleaned_at=now() where job_id=p_job_id;
 elsif p_step='auth_delete_started' then
  if v_job.storage_cleaned_at is null then raise exception 'operation_conflict';end if;
  if exists(select 1 from public.codevalanche_admin_memberships where user_id=v_job.user_id and active and role='owner') and (select count(*) from public.codevalanche_admin_memberships m left join public.codevalanche_account_state a on a.user_id=m.user_id where m.role='owner' and m.active and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false))<1 then raise exception 'last_owner_protected';end if;
  delete from public.codevalanche_events where user_id=v_job.user_id;
  delete from public.codevalanche_admin_memberships where user_id=v_job.user_id;
  update public.codevalanche_account_erasure_jobs set auth_delete_started_at=coalesce(auth_delete_started_at,now()) where job_id=p_job_id;
 elsif p_step='auth_deleted' then
  if v_job.auth_delete_started_at is null or exists(select 1 from auth.users where id=v_job.user_id) then raise exception 'operation_conflict';end if;
  update public.codevalanche_account_erasure_jobs set auth_deleted_at=now() where job_id=p_job_id;
 elsif p_step='completed' then
  if v_job.auth_deleted_at is null or exists(select 1 from auth.users where id=v_job.user_id) then raise exception 'operation_conflict';end if;
  delete from public.codevalanche_account_state where user_id=v_job.user_id;
  delete from public.codevalanche_feedback where user_id=v_job.user_id;
  delete from public.codevalanche_events where user_id=v_job.user_id;
  delete from public.codevalanche_revoked_sessions where user_id=v_job.user_id;
  delete from public.codevalanche_credential_events where user_id=v_job.user_id;
  delete from public.codevalanche_rate_limits where bucket in ('account:'||v_job.user_id::text,'feedback:'||v_job.user_id::text);
  update public.codevalanche_account_erasure_jobs set state='completed',completed_at=now(),lease_id=null,lease_until=null where job_id=p_job_id;
 elsif p_step='heartbeat' then update public.codevalanche_account_erasure_jobs set lease_until=now()+interval '60 seconds' where job_id=p_job_id;
 elsif p_step='retry' then update public.codevalanche_account_erasure_jobs set lease_id=null,lease_until=null,state=case when attempts>=8 then 'failed' else 'purging' end where job_id=p_job_id;
 else raise exception 'invalid_fields';end if;
 return query select * from public.codevalanche_account_erasure_jobs where job_id=p_job_id;
end $$;
revoke all on function public.codevalanche_request_erasure(uuid,uuid,uuid),public.codevalanche_cancel_erasure(uuid),public.codevalanche_erasure_storage(uuid),public.codevalanche_erasure_inspect(uuid),public.codevalanche_erasure_claim(uuid,uuid),public.codevalanche_erasure_advance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.codevalanche_request_erasure(uuid,uuid,uuid),public.codevalanche_cancel_erasure(uuid),public.codevalanche_erasure_storage(uuid),public.codevalanche_erasure_inspect(uuid),public.codevalanche_erasure_claim(uuid,uuid),public.codevalanche_erasure_advance(uuid,uuid,text) to service_role;
commit;
