begin;
-- Shared operator inbox acknowledgement does not alter the email delivery state.
create function public.codevalanche_acknowledge_notification(
 p_actor_id uuid,p_session_id uuid,p_mfa_verified_at timestamptz,p_notification_id uuid,p_operation_id uuid
) returns table(operation_id uuid,state text,notification_id uuid,inbox_state text)
language plpgsql security definer set search_path='' as $$
declare v_role text;v_evidence record;v_notice public.codevalanche_notification_outbox;
 v_existing public.codevalanche_operation_jobs;v_parameters jsonb;
begin
 if p_actor_id is null or p_session_id is null or p_mfa_verified_at is null or not isfinite(p_mfa_verified_at)
 or p_notification_id is null or p_operation_id is null then raise exception 'invalid_fields';end if;
 perform pg_advisory_xact_lock(hashtextextended('codevalanche-operation:'||p_operation_id::text,0));
 select m.role into v_role from public.codevalanche_admin_memberships m where m.user_id=p_actor_id and m.active for share;
 if v_role is null or v_role not in ('owner','accounts_admin') then raise exception 'administrator_required';end if;
 perform 1 from auth.users u where u.id=p_actor_id and u.email_confirmed_at is not null for share;
 if not found then raise exception 'account_forbidden';end if;
 perform 1 from public.codevalanche_account_state a where a.user_id=p_actor_id for share;
 v_parameters:=jsonb_build_object('notificationId',p_notification_id);
 select * into v_existing from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id;
 if v_existing.operation_id is null then
  select * into v_notice from public.codevalanche_notification_outbox n where n.id=p_notification_id for update;
  if not found then raise exception 'not_found';end if;
 end if;
 -- Recheck only after every potentially blocking operation/role/notice lock.
 select * into v_evidence from public.codevalanche_credential_evidence(p_actor_id,p_session_id);
 if v_evidence.qualified is distinct from true or v_evidence.session_active is distinct from true
 or v_evidence.recovery_only is distinct from false or v_evidence.current_status is distinct from 'active'
 or v_evidence.blocked is distinct from false or coalesce(v_evidence.verified_factor_count,0)<1
 or p_mfa_verified_at>clock_timestamp() or p_mfa_verified_at<clock_timestamp()-interval '5 minutes'
 or (v_evidence.credential_changed_at is not null and p_mfa_verified_at<=v_evidence.credential_changed_at)
 then raise exception 'account_forbidden';end if;
 if v_existing.operation_id is not null then
  if v_existing.actor_id<>p_actor_id or v_existing.action<>'admin.notifications.ack'
  or v_existing.parameters<>v_parameters or v_existing.state<>'completed' then raise exception 'operation_conflict';end if;
  return query select p_operation_id,'completed'::text,p_notification_id,'acknowledged'::text;return;
 end if;
 update public.codevalanche_notification_outbox n set inbox_state='acknowledged' where n.id=p_notification_id;
 insert into public.codevalanche_operation_jobs(operation_id,actor_id,user_id,action,reason_code,reason,parameters,state,completed_at)
 values(p_operation_id,p_actor_id,v_notice.user_id,'admin.notifications.ack','notification_ack','Operator inbox acknowledgement',v_parameters,'completed',now());
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code)
 values(p_operation_id,p_actor_id,v_notice.user_id,'admin.notifications.ack','completed','notification_ack');
 return query select p_operation_id,'completed'::text,p_notification_id,'acknowledged'::text;
end $$;
revoke all on function public.codevalanche_acknowledge_notification(uuid,uuid,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.codevalanche_acknowledge_notification(uuid,uuid,timestamptz,uuid,uuid) to service_role;
commit;
