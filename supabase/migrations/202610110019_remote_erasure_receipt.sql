begin;
alter table public.codevalanche_account_erasure_jobs add column remote_receipt_id uuid,add column remote_erased_at timestamptz;
create or replace function public.codevalanche_erasure_advance(p_job_id uuid,p_lease_id uuid,p_step text)
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
  if v_job.auth_deleted_at is null or v_job.remote_receipt_id is null or exists(select 1 from auth.users where id=v_job.user_id) then raise exception 'operation_conflict';end if;
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
create function public.codevalanche_record_remote_erasure(p_job_id uuid,p_lease_id uuid,p_receipt jsonb)
returns setof public.codevalanche_account_erasure_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_account_erasure_jobs;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_account_erasure_jobs j where j.job_id=p_job_id and j.lease_id=p_lease_id and j.lease_until>now() and j.state='purging' for update;
 if not found or v_job.auth_deleted_at is null or exists(select 1 from auth.users where id=v_job.user_id) then raise exception 'operation_conflict';end if;
 if (p_receipt->>'operationId')::uuid is distinct from v_job.operation_id or (p_receipt->>'jobId')::uuid is distinct from v_job.job_id or (p_receipt->>'userId')::uuid is distinct from v_job.user_id or (p_receipt->>'generation')::bigint is distinct from v_job.remote_generation or (p_receipt->>'policyVersion')::bigint is distinct from v_job.erasure_policy_version or p_receipt->>'state' is distinct from 'completed' or p_receipt->'metadataPurged' is distinct from 'true'::jsonb or p_receipt->'localFilesTouched' is distinct from 'false'::jsonb or (p_receipt->>'receiptId')::uuid is null then raise exception 'operation_conflict';end if;
 if v_job.remote_receipt_id is not null and v_job.remote_receipt_id<>(p_receipt->>'receiptId')::uuid then raise exception 'operation_conflict';end if;
 return query update public.codevalanche_account_erasure_jobs j set remote_receipt_id=(p_receipt->>'receiptId')::uuid,remote_erased_at=coalesce(j.remote_erased_at,now()) where j.job_id=p_job_id returning j.*;
end $$;
revoke all on function public.codevalanche_record_remote_erasure(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.codevalanche_record_remote_erasure(uuid,uuid,jsonb) to codevalanche_erasure_worker;
commit;