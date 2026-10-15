begin;
-- Optional analytics must never hold the provider transaction behind an owned
-- analytics lock. Function-local timeout is automatically restored on return.
-- Each lock wait is bounded to100ms; both capture and best-effort health writes
-- contain lock timeout and query_canceled, including deferred COMMIT execution.
-- A failed health write may lose the marker, so coverage remains partial.
create or replace function public.wa_capture_provider_session() returns trigger language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare v_session uuid;v_observed timestamptz;v_inserted bigint;
begin
 -- Role is set by PostgreSQL, not request metadata/JWT/browser intent. Ordinary
 -- service/HTTP roles have no membership allowing SET ROLE supabase_auth_admin.
 if not (current_setting('role')='supabase_auth_admin' or (session_user='supabase_auth_admin' and current_setting('role')='none')) then return new;end if;
 if tg_table_schema<>'auth' or tg_op<>'INSERT' then return new;end if;
 if tg_table_name='sessions' then v_session:=new.id;elsif tg_table_name='mfa_amr_claims' then v_session:=new.session_id;else return new;end if;
 v_observed:=clock_timestamp();
 insert into public.wa_provider_session_receipts(session_id,user_id,occurred_at,observed_at,primary_method)
 select s.id,s.user_id,s.created_at,v_observed,'password' from auth.sessions s cross join public.wa_provider_session_source c
 where s.id=v_session and s.created_at>=c.installed_at and s.created_at<=v_observed
 and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='password')
 and not exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='recovery')
 on conflict(session_id) do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted>0 then update public.wa_provider_session_source set watermark=greatest(watermark,v_observed);end if;
 return new;
exception when query_canceled or others then
 -- Best effort analytics must not turn an ordinary provider authentication into
 -- failure. Failure state is also best effort if the store itself is unavailable.
 begin update public.wa_provider_session_source set qualified=false,capture_errors=capture_errors+1;exception when query_canceled or others then null;end;
 return new;
end $$;
create or replace function public.wa_provider_session_source_qualified() returns boolean language sql stable security definer set search_path='' as $$
 with recursive execution_roles as (
  select oid from pg_catalog.pg_roles where rolname in ('supabase_auth_admin','anon','authenticated','service_role','authenticator')
 ),reachable_roles(oid) as (
  select oid from execution_roles union select m.roleid from pg_catalog.pg_auth_members m join reachable_roles r on r.oid=m.member where m.set_option
 ),expected_triggers as (
  select t.* from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgqual is null and t.tgnargs=0 and t.tgattr=''::int2vector
  and t.tgtype=5 and t.tgdeferrable and t.tginitdeferred and t.tgfoid=pg_catalog.to_regprocedure('public.wa_capture_provider_session()')
  and ((t.tgrelid='auth.sessions'::regclass and t.tgname='wa_capture_provider_session') or (t.tgrelid='auth.mfa_amr_claims'::regclass and t.tgname='wa_capture_provider_session_amr'))
 )
 select coalesce((select qualified and capture_errors=0 and watermark is not null from public.wa_provider_session_source where singleton),false)
 and (select count(*)=6 from pg_catalog.pg_attribute where not attisdropped and (
  (attrelid='auth.sessions'::regclass and ((attname in ('id','user_id') and atttypid='uuid'::regtype) or (attname='created_at' and atttypid='timestamptz'::regtype)))
  or (attrelid='auth.mfa_amr_claims'::regclass and ((attname='session_id' and atttypid='uuid'::regtype) or (attname='authentication_method' and atttypid='text'::regtype) or (attname='created_at' and atttypid='timestamptz'::regtype)))
 ))
 and (select count(*)=2 from pg_catalog.pg_class where oid in ('auth.sessions'::regclass,'auth.mfa_amr_claims'::regclass) and pg_catalog.pg_get_userbyid(relowner)='supabase_auth_admin')
 and (select count(*)=2 from expected_triggers where tgenabled='O')
 and exists(select 1 from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.wa_capture_provider_session()') and prosecdef and proconfig=array['search_path=""','lock_timeout=100ms']::text[] and proowner not in (select oid from reachable_roles))
 and pg_catalog.current_setting('session_replication_role') in ('origin','local')
 and (select count(*)=5 from execution_roles)
 and not exists(select 1 from reachable_roles r join pg_catalog.pg_roles p on p.oid=r.oid where p.rolsuper or pg_catalog.has_parameter_privilege(p.oid,'session_replication_role','SET'))
 and not exists(select 1 from pg_catalog.pg_auth_members where member=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin') or roleid=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin'))
 and not exists(select 1 from pg_catalog.pg_db_role_setting s cross join lateral pg_catalog.unnest(s.setconfig) c(setting)
  where (s.setdatabase=0 or s.setdatabase=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())) and (s.setrole=0 or s.setrole in (select oid from reachable_roles))
  and c.setting like 'session_replication_role=%' and c.setting not in ('session_replication_role=origin','session_replication_role=local'))
$$;
-- Installing a stronger producer does not retroactively qualify old coverage.
update public.wa_provider_session_source set qualified=false;
commit;
