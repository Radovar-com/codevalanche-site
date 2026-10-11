begin;
alter table public.codevalanche_operation_jobs add column accepted_policy_version bigint not null default 1;
create unique index codevalanche_one_pending_operation on public.codevalanche_operation_jobs(user_id) where state='pending';
create function public.codevalanche_request_operation(p_actor_id uuid,p_user_id uuid,p_operation_id uuid,p_action text,p_reason_code text,p_reason text,p_until timestamptz default null,p_limits jsonb default null)
returns table(operation_id uuid,state text)
language plpgsql security definer set search_path='' as $$
declare v_role text;v_target_role text;v_params jsonb;v_job public.codevalanche_operation_jobs;v_policy public.codevalanche_account_state;v_owners bigint;
begin
 perform pg_advisory_xact_lock(61101003);
 select role into v_role from public.codevalanche_admin_memberships where user_id=p_actor_id and active;
 if v_role is null or v_role not in ('owner','accounts_admin') then raise exception 'administrator_required'; end if;
 if exists(select 1 from public.codevalanche_account_state where user_id=p_actor_id and (blocked or status<>'active')) then raise exception 'account_forbidden'; end if;
 if p_actor_id=p_user_id then raise exception 'account_forbidden'; end if;
 if p_action not in ('admin.account.suspend','admin.account.reactivate','admin.limits.update','admin.sessions.revoke') or p_reason_code!~'^[a-z0-9_.-]{1,64}$' or length(trim(p_reason)) not between 1 and 1000 then raise exception 'invalid_fields'; end if;
 v_params:=jsonb_build_object('until',p_until,'limits',p_limits);
 select * into v_job from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id;
 if found then
  if v_job.actor_id<>p_actor_id or v_job.user_id<>p_user_id or v_job.action<>p_action or v_job.reason_code<>p_reason_code or v_job.reason<>trim(p_reason) or v_job.parameters<>v_params then raise exception 'operation_conflict'; end if;
  return query select v_job.operation_id,v_job.state;return;
 end if;
 if p_until is not null and p_until<=now() then raise exception 'invalid_fields';end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'not_found'; end if;
 select role into v_target_role from public.codevalanche_admin_memberships where user_id=p_user_id and active;
 if v_target_role='owner' and v_role<>'owner' then raise exception 'account_forbidden'; end if;
 if v_target_role='owner' and p_action='admin.account.suspend' then
  select count(*) into v_owners from public.codevalanche_admin_memberships m left join public.codevalanche_account_state a on a.user_id=m.user_id where m.active and m.role='owner' and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false);
  if v_owners<=1 then raise exception 'last_owner_protected'; end if;
 end if;
 if exists(select 1 from public.codevalanche_operation_jobs j where j.user_id=p_user_id and j.state='pending') then raise exception 'operation_conflict'; end if;
 insert into public.codevalanche_account_state(user_id) values(p_user_id) on conflict do nothing;
 select * into v_policy from public.codevalanche_account_state where user_id=p_user_id for update;
 if v_policy.status in ('deletion_pending','deleted') then raise exception 'account_deletion_pending'; end if;
 if p_action='admin.account.suspend' then
  update public.codevalanche_account_state set status='suspended',blocked=true,suspended_until=p_until,suspension_generation=suspension_generation+1,policy_version=policy_version+1,updated_at=now() where user_id=p_user_id;
 elsif p_action='admin.limits.update' then
  if p_limits is null or jsonb_typeof(p_limits->'enabled')<>'boolean' or (p_limits->>'maxHosts')::int not between 0 and 10000 or (p_limits->>'maxControllers')::int not between 0 and 10000 or (p_limits->>'maxConcurrentRuns')::int not between 0 and 10000 then raise exception 'invalid_fields'; end if;
  update public.codevalanche_account_state set remote_enabled=(p_limits->>'enabled')::boolean,max_hosts=(p_limits->>'maxHosts')::int,max_controllers=(p_limits->>'maxControllers')::int,max_concurrent_runs=(p_limits->>'maxConcurrentRuns')::int,policy_version=policy_version+1,updated_at=now() where user_id=p_user_id;
 elsif p_action='admin.sessions.revoke' then
  update public.codevalanche_account_state set policy_version=policy_version+1,updated_at=now() where user_id=p_user_id;
 end if;
 if p_action in ('admin.account.suspend','admin.sessions.revoke') then insert into public.codevalanche_revoked_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=p_user_id on conflict do nothing; end if;
 select * into v_policy from public.codevalanche_account_state where user_id=p_user_id;
 insert into public.codevalanche_operation_jobs(operation_id,actor_id,user_id,action,reason_code,reason,parameters,accepted_policy_version,accepted_suspension_generation) values(p_operation_id,p_actor_id,p_user_id,p_action,p_reason_code,trim(p_reason),v_params,v_policy.policy_version,v_policy.suspension_generation);
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code) values(p_operation_id,p_actor_id,p_user_id,p_action,'pending',p_reason_code);
 return query select p_operation_id,'pending'::text;
end $$;
create function public.codevalanche_claim_operation(p_operation_id uuid,p_lease_id uuid)
returns setof public.codevalanche_operation_jobs language plpgsql security definer set search_path='' as $$
begin
 update public.codevalanche_operation_jobs j set state='failed',error_code='operation_superseded',lease_id=null,lease_until=null where j.operation_id=p_operation_id and j.state='pending' and j.provider_state not in ('inflight','unknown') and not exists(select 1 from public.codevalanche_account_state a where a.user_id=j.user_id and a.policy_version=j.accepted_policy_version and a.suspension_generation=j.accepted_suspension_generation);
 return query update public.codevalanche_operation_jobs j set lease_id=p_lease_id,lease_until=now()+interval '30 seconds',attempts=attempts+1,updated_at=now() where j.operation_id=p_operation_id and j.state='pending' and (j.lease_until is null or j.lease_until<now()) returning j.*;
 if not found then return query select * from public.codevalanche_operation_jobs where operation_id=p_operation_id and state in ('completed','failed');end if;
end $$;
create function public.codevalanche_settle_operation(p_operation_id uuid,p_lease_id uuid,p_success boolean)
returns table(operation_id uuid,state text) language plpgsql security definer set search_path='' as $$
declare v_job public.codevalanche_operation_jobs;v_state text;
begin
 perform pg_advisory_xact_lock(61101003);
 select * into v_job from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id and j.lease_id=p_lease_id and j.state='pending' and j.lease_until>now() for update;
 if not found then raise exception 'operation_conflict'; end if;
 if not exists(select 1 from public.codevalanche_account_state where user_id=v_job.user_id and policy_version=v_job.accepted_policy_version) then p_success:=false;end if;
 if v_job.provider_state in ('inflight','unknown') then p_success:=false;end if;
 v_state:=case when p_success then 'completed' when v_job.provider_state in ('inflight','unknown') then 'pending' when v_job.attempts>=8 then 'failed' else 'pending' end;
 if p_success and v_job.action='admin.account.reactivate' then
  update public.codevalanche_account_state set status='active',blocked=false,suspended_until=null,policy_version=policy_version+1,updated_at=now() where user_id=v_job.user_id and status='suspended';
 end if;
 update public.codevalanche_operation_jobs j set state=v_state,lease_id=null,lease_until=null,error_code=case when p_success then null when v_job.provider_state in ('inflight','unknown') then 'provider_result_unknown' else 'provider_reconciliation_pending' end,completed_at=case when p_success then now() else null end,updated_at=now() where j.operation_id=p_operation_id;
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code) values(v_job.operation_id,v_job.actor_id,v_job.user_id,v_job.action,v_state,v_job.reason_code);
 return query select p_operation_id,v_state;
end $$;
revoke all on function public.codevalanche_request_operation(uuid,uuid,uuid,text,text,text,timestamptz,jsonb),public.codevalanche_claim_operation(uuid,uuid),public.codevalanche_settle_operation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.codevalanche_request_operation(uuid,uuid,uuid,text,text,text,timestamptz,jsonb),public.codevalanche_claim_operation(uuid,uuid),public.codevalanche_settle_operation(uuid,uuid,boolean) to service_role;
commit;
