begin;
alter table public.codevalanche_feedback add column status text not null default 'open' check(status in ('open','triaged','resolved'));
-- Capture provider-created sessions transactionally; no browser-reported login success.
create function public.codevalanche_session_security_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.codevalanche_security_events(source,source_event_id,occurred_at,user_id,session_id,event_name,outcome,coverage)
 values('provider_audit','session:'||new.id::text,new.created_at,new.user_id,new.id,'login_succeeded','success','{"session":true,"ip":false}') on conflict do nothing;return new;
end $$;
create trigger codevalanche_session_security after insert on auth.sessions for each row execute function public.codevalanche_session_security_event();
revoke all on function public.codevalanche_session_security_event() from public,anon,authenticated,service_role;
create function public.codevalanche_read_provider_audit(p_after timestamptz default null,p_after_id uuid default null,p_limit integer default 100)
returns table(id uuid,created_at timestamptz,action text,user_id text,session_id text) language plpgsql stable security definer set search_path='' as $$
begin
 if to_regclass('auth.audit_log_entries') is null then return;end if;
 return query execute 'select id,created_at,(payload->>''action'')::text,(payload->>''actor_id'')::text,(payload->>''session_id'')::text from auth.audit_log_entries where ($1 is null or (created_at,id)>($1,$2)) order by created_at,id limit $3' using p_after,coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid),greatest(1,least(p_limit,100));
end $$;
revoke all on function public.codevalanche_read_provider_audit(timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.codevalanche_read_provider_audit(timestamptz,uuid,integer) to service_role;
-- Erasure cleanup of optional attributed analytics must occur before Auth deletion.
create function public.codevalanche_erase_optional_data() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.auth_delete_started_at is not null and old.auth_delete_started_at is null then
  delete from public.codevalanche_analytics_v2 where user_id=new.user_id;
  delete from public.codevalanche_notification_outbox where user_id=new.user_id;
 end if;return new;
end $$;
create trigger codevalanche_erasure_optional_data after update of auth_delete_started_at on public.codevalanche_account_erasure_jobs for each row execute function public.codevalanche_erase_optional_data();
revoke all on function public.codevalanche_erase_optional_data() from public,anon,authenticated,service_role;
create function public.codevalanche_feedback_update(p_actor_id uuid,p_feedback_id uuid,p_status text,p_operation_id uuid,p_reason_code text,p_reason text)
returns table(operation_id uuid,state text) language plpgsql security definer set search_path='' as $$
declare v_role text;v_user uuid;v_existing public.codevalanche_operation_jobs;v_params jsonb;
begin
 select role into v_role from public.codevalanche_admin_memberships where user_id=p_actor_id and active;
 if v_role is null or v_role not in ('owner','accounts_admin') then raise exception 'administrator_required';end if;
 if exists(select 1 from public.codevalanche_account_state where user_id=p_actor_id and (blocked or status<>'active')) then raise exception 'account_forbidden';end if;
 if p_status not in ('open','triaged','resolved') or p_reason_code!~'^[a-z0-9_.-]{1,64}$' or length(trim(p_reason)) not between 1 and 1000 then raise exception 'invalid_fields';end if;
 select user_id into v_user from public.codevalanche_feedback where id=p_feedback_id for update;if not found then raise exception 'not_found';end if;
 v_params:=jsonb_build_object('feedbackId',p_feedback_id,'status',p_status);
 select * into v_existing from public.codevalanche_operation_jobs j where j.operation_id=p_operation_id;
 if found then if v_existing.actor_id<>p_actor_id or v_existing.action<>'admin.feedback.update' or v_existing.parameters<>v_params or v_existing.reason_code<>p_reason_code or v_existing.reason<>trim(p_reason) then raise exception 'operation_conflict';end if;return query select p_operation_id,'completed'::text;return;end if;
 update public.codevalanche_feedback set status=p_status where id=p_feedback_id;
 insert into public.codevalanche_operation_jobs(operation_id,actor_id,user_id,action,reason_code,reason,parameters,state,completed_at) values(p_operation_id,p_actor_id,v_user,'admin.feedback.update',p_reason_code,trim(p_reason),v_params,'completed',now());
 insert into public.codevalanche_admin_audit(operation_id,actor_id,user_id,action,outcome,reason_code) values(p_operation_id,p_actor_id,v_user,'admin.feedback.update','completed',p_reason_code);
 return query select p_operation_id,'completed'::text;
end $$;
revoke all on function public.codevalanche_feedback_update(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.codevalanche_feedback_update(uuid,uuid,text,uuid,text,text) to service_role;
commit;
