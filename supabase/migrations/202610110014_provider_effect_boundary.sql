begin;
create function public.codevalanche_prepare_operation_provider(p_operation_id uuid,p_lease_id uuid)
returns table(allowed boolean,decision text) language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_operation_jobs;v_policy public.codevalanche_account_state;v_role text;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id and j.lease_id=p_lease_id and j.lease_until>now() and j.state='pending' for update;
 if not found then raise exception 'operation_conflict';end if;
 if v_job.provider_state in ('inflight','unknown') then update public.codevalanche_operation_jobs j set error_code='provider_result_unknown',provider_state='unknown',lease_id=null,lease_until=null where j.operation_id=p_operation_id;return query select false,'indeterminate'::text;return;end if;
 select * into v_policy from public.codevalanche_account_state where user_id=v_job.user_id for update;
 select role into v_role from public.codevalanche_admin_memberships where user_id=v_job.actor_id and active;
 if v_policy.user_id is null or v_policy.policy_version<>v_job.accepted_policy_version or v_policy.suspension_generation<>v_job.accepted_suspension_generation or v_role is null or v_role not in ('owner','accounts_admin') or exists(select 1 from public.codevalanche_account_state where user_id=v_job.actor_id and (blocked or status<>'active')) then
  update public.codevalanche_operation_jobs j set state='failed',error_code='operation_superseded',lease_id=null,lease_until=null where j.operation_id=p_operation_id;return query select false,'superseded'::text;return;
 end if;
 if v_job.provider_state='confirmed' then return query select false,'confirmed'::text;return;end if;
 if v_job.action='admin.account.suspend' and v_policy.suspended_until is not null and v_policy.suspended_until<=now() then update public.codevalanche_operation_jobs j set provider_state='not_needed' where j.operation_id=p_operation_id;return query select false,'expired'::text;return;end if;
 if v_job.action not in ('admin.account.suspend','admin.account.reactivate') then return query select false,'not_needed'::text;return;end if;
 update public.codevalanche_operation_jobs j set provider_state='inflight',provider_attempt_id=p_lease_id,provider_started_at=now(),provider_completed_at=null where j.operation_id=p_operation_id;
 return query select true,'prepared'::text;
end $$;
create function public.codevalanche_record_operation_provider(p_operation_id uuid,p_attempt_id uuid,p_confirmed boolean,p_rejected boolean default false)
returns setof public.codevalanche_operation_jobs language plpgsql security definer set search_path='' as $$
begin
 -- A late authenticated API result belongs to the recorded attempt even after worker lease loss.
 return query update public.codevalanche_operation_jobs j set provider_state=case when p_confirmed then 'confirmed' when p_rejected then 'rejected' else 'unknown' end,provider_completed_at=now(),error_code=case when p_confirmed then null when p_rejected then 'provider_rejected' else 'provider_result_unknown' end where j.operation_id=p_operation_id and j.provider_attempt_id=p_attempt_id and j.provider_state in ('inflight','unknown') returning j.*;
 if not found then raise exception 'operation_conflict';end if;
end $$;
revoke all on function public.codevalanche_prepare_operation_provider(uuid,uuid),public.codevalanche_record_operation_provider(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.codevalanche_prepare_operation_provider(uuid,uuid),public.codevalanche_record_operation_provider(uuid,uuid,boolean,boolean) to service_role,codevalanche_operation_worker;
commit;
