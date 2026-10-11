begin;
create function public.codevalanche_cancel_erasure_admin(p_actor_id uuid,p_user_id uuid,p_job_id uuid,p_operation_id uuid,p_reason_code text,p_reason text)
returns table(operation_id uuid,state text,job_id uuid,erasure_state text) language plpgsql security definer set search_path='' as $$
declare v_role text;v_job public.codevalanche_account_erasure_jobs;v_existing public.codevalanche_operation_jobs;v_params jsonb;
begin
 perform pg_advisory_xact_lock(61101003);
 select role into v_role from public.codevalanche_admin_memberships where user_id=p_actor_id and active;
 if v_role is null or v_role not in ('owner','accounts_admin') then raise exception 'administrator_required';end if;
 if p_actor_id=p_user_id or exists(select 1 from public.codevalanche_account_state where user_id=p_actor_id and (blocked or status<>'active')) then raise exception 'account_forbidden';end if;
 if p_reason_code!~'^[a-z0-9_.-]{1,64}$' or length(trim(p_reason)) not between 1 and 1000 then raise exception 'invalid_fields';end if;
 v_params:=jsonb_build_object('jobId',p_job_id);
 select * into v_existing from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id;
 if found then
  if v_existing.actor_id<>p_actor_id or v_existing.user_id<>p_user_id or v_existing.action<>'admin.deletion.cancel' or v_existing.parameters<>v_params or v_existing.reason_code<>p_reason_code or v_existing.reason<>trim(p_reason) then raise exception 'operation_conflict';end if;
  return query select p_operation_id,'completed'::text,p_job_id,'cancelled'::text;return;
 end if;
 if v_role<>'owner' and exists(select 1 from public.codevalanche_admin_memberships where user_id=p_user_id and role='owner') then raise exception 'account_forbidden';end if;
 select * into v_job from public.codevalanche_account_erasure_jobs e where e.job_id=p_job_id and e.user_id=p_user_id for update;
 if not found then raise exception 'not_found';end if;
 if v_job.purge_started_at is not null or v_job.state<>'queued' then raise exception 'operation_conflict';end if;
 perform public.codevalanche_cancel_erasure(p_user_id);
 insert into public.codevalanche_operation_jobs(operation_id,actor_id,user_id,action,reason_code,reason,parameters,state,completed_at) values(p_operation_id,p_actor_id,p_user_id,'admin.deletion.cancel',p_reason_code,trim(p_reason),v_params,'completed',now());
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code) values(p_operation_id,p_actor_id,p_user_id,'admin.deletion.cancel','completed',p_reason_code);
 return query select p_operation_id,'completed'::text,p_job_id,'cancelled'::text;
end $$;
revoke all on function public.codevalanche_cancel_erasure_admin(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.codevalanche_cancel_erasure_admin(uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
