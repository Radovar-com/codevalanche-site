begin;
alter table public.codevalanche_account_erasure_jobs add column remote_generation bigint not null default 1 check(remote_generation>0),add column erasure_policy_version bigint,add column remote_authorization_id uuid not null default gen_random_uuid();
create function public.codevalanche_capture_erasure_policy() returns trigger language plpgsql security definer set search_path='' as $$
declare v_policy public.codevalanche_account_state;
begin
 if new.auth_delete_started_at is not null and old.auth_delete_started_at is null then
  select * into v_policy from public.codevalanche_account_state where user_id=new.user_id for update;
  if v_policy.user_id is null or v_policy.erasure_job_id is distinct from new.job_id or v_policy.status<>'deletion_pending' or v_policy.deletion_scheduled_for is distinct from new.due_at or new.due_at>now() or new.purge_started_at is null or new.lease_until<=now() then raise exception 'operation_conflict';end if;
  new.erasure_policy_version:=v_policy.policy_version;
 end if;return new;
end $$;
create trigger codevalanche_erasure_policy_binding before update of auth_delete_started_at on public.codevalanche_account_erasure_jobs for each row execute function public.codevalanche_capture_erasure_policy();
revoke all on function public.codevalanche_capture_erasure_policy() from public,anon,authenticated,service_role;
create role codevalanche_remote_erasure_authority nologin;
grant usage on schema public to codevalanche_remote_erasure_authority;
grant codevalanche_remote_erasure_authority to authenticator;
grant execute on function public.codevalanche_worker_capability() to codevalanche_remote_erasure_authority;
create function public.codevalanche_remote_erasure_authorize(p_operation_id uuid,p_job_id uuid,p_user_id uuid,p_generation bigint,p_policy_version bigint)
returns table(allowed boolean,due_at timestamptz,authorization_id uuid) language sql stable security definer set search_path='' as $$
 select true,j.due_at,j.remote_authorization_id from public.codevalanche_account_erasure_jobs j
 where j.job_id=p_job_id and j.operation_id=p_operation_id and j.user_id=p_user_id and j.remote_generation=p_generation and j.erasure_policy_version=p_policy_version
 and j.state='purging' and j.purge_started_at is not null and j.due_at<=now() and j.lease_id is not null and j.lease_until>now()
 and j.storage_cleaned_at is not null and j.auth_delete_started_at is not null and j.auth_deleted_at is not null
 and not exists(select 1 from auth.users u where u.id=j.user_id)
$$;
revoke all on function public.codevalanche_remote_erasure_authorize(uuid,uuid,uuid,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.codevalanche_remote_erasure_authorize(uuid,uuid,uuid,bigint,bigint) to codevalanche_remote_erasure_authority;
commit;
