begin;
create table public.codevalanche_security_events(
 event_id uuid primary key default gen_random_uuid(),source text not null check(source in ('password_hook','provider_audit','application_api','credential_trigger')),
 source_event_id text,occurred_at timestamptz not null,received_at timestamptz not null default now(),user_id uuid,session_id uuid,
 event_name text not null,outcome text not null,reason_code text,ip inet,coverage jsonb not null default '{}',unique(source,source_event_id)
);
create table public.codevalanche_provider_event_cursor(source text primary key,cursor text,watermark timestamptz,provider_audit_enabled boolean not null default false,password_hook_enabled boolean not null default false,updated_at timestamptz not null default now());
alter table public.codevalanche_security_events enable row level security;
alter table public.codevalanche_provider_event_cursor enable row level security;
revoke all on public.codevalanche_security_events,public.codevalanche_provider_event_cursor from public,anon,authenticated;
grant select,insert on public.codevalanche_security_events to service_role;
grant select on public.codevalanche_provider_event_cursor to service_role;
create function public.codevalanche_password_verification_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if jsonb_typeof(event->'valid') is distinct from 'boolean' then return jsonb_build_object('decision','continue');end if;
 begin v_user:=(event->>'user_id')::uuid;exception when invalid_text_representation then v_user:=null;end;
 insert into public.codevalanche_security_events(source,occurred_at,user_id,event_name,outcome,coverage)
 values('password_hook',now(),v_user,case when (event->>'valid')::boolean then 'password_valid' else 'password_invalid' end,case when (event->>'valid')::boolean then 'password_verified' else 'password_refused' end,'{"session":false,"ip":false,"unknownEmail":false}');
 -- Reporting only. No provider rejection, account-wide lockout, ban, or victim logout.
 return jsonb_build_object('decision','continue');
end $$;
revoke all on function public.codevalanche_password_verification_hook(jsonb) from public,anon,authenticated,service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.codevalanche_password_verification_hook(jsonb) to supabase_auth_admin;
create function public.codevalanche_import_security_events(p_events jsonb,p_cursor text) returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>100 or length(p_cursor)>200 then raise exception 'invalid_fields';end if;
 insert into public.codevalanche_security_events(event_id,source,source_event_id,occurred_at,received_at,user_id,session_id,event_name,outcome,reason_code,coverage)
 select (e->>'eventId')::uuid,'provider_audit',e->>'sourceEventId',(e->>'occurredAt')::timestamptz,now(),(e->>'userId')::uuid,(e->>'sessionId')::uuid,e->>'eventName',e->>'outcome',null,e->'coverage' from jsonb_array_elements(p_events) e on conflict(source,source_event_id) do nothing;
 get diagnostics v_count=row_count;
 insert into public.codevalanche_provider_event_cursor(source,cursor,watermark,provider_audit_enabled) values('provider_audit',p_cursor,(select max((e->>'occurredAt')::timestamptz) from jsonb_array_elements(p_events) e),true)
 on conflict(source) do update set cursor=excluded.cursor,watermark=greatest(codevalanche_provider_event_cursor.watermark,excluded.watermark),updated_at=now();
 return v_count;
end $$;
create function public.codevalanche_retention_sweep() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_security integer;v_audit integer;
begin
 update public.codevalanche_security_events set ip=null where occurred_at<now()-interval '7 days' and ip is not null;
 delete from public.codevalanche_security_events where occurred_at<now()-interval '90 days';get diagnostics v_security=row_count;
 delete from public.codevalanche_admin_audit where occurred_at<now()-interval '365 days';get diagnostics v_audit=row_count;
 delete from public.codevalanche_credential_events where occurred_at<now()-interval '90 days';
 return jsonb_build_object('securityDeleted',v_security,'auditDeleted',v_audit);
end $$;
revoke all on function public.codevalanche_import_security_events(jsonb,text),public.codevalanche_retention_sweep() from public,anon,authenticated;
grant execute on function public.codevalanche_import_security_events(jsonb,text),public.codevalanche_retention_sweep() to service_role;
commit;
