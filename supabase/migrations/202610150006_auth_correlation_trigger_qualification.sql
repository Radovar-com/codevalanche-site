begin;
-- Column-specific UPDATE triggers do not protect every Auth mutation.
-- Tighten only qualification; preserve applied022 and all installed trigger DDL.
create or replace function public.codevalanche_auth_correlation_qualified() returns boolean language sql stable security definer set search_path='' as $$
 with recursive execution_roles as (
  select oid from pg_catalog.pg_roles where rolname in ('supabase_auth_admin','anon','authenticated','service_role','authenticator','codevalanche_operation_worker')
 ), reachable_roles(oid) as (
  select oid from execution_roles
  union
  select m.roleid from pg_catalog.pg_auth_members m join reachable_roles r on r.oid=m.member where m.set_option
 ), expected_triggers as (
  select t.* from pg_catalog.pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal and t.tgqual is null and t.tgnargs=0 and t.tgattr=''::pg_catalog.int2vector
   and ((t.tgname='codevalanche_auth_operation_guard' and t.tgfoid=pg_catalog.to_regprocedure('public.codevalanche_auth_operation_guard()') and t.tgtype=19 and not t.tgdeferrable)
    or (t.tgname='codevalanche_auth_operation_commit' and t.tgfoid=pg_catalog.to_regprocedure('public.codevalanche_auth_operation_commit()') and t.tgtype=17 and t.tgdeferrable and t.tginitdeferred))
 )
 select coalesce((select qualified from public.codevalanche_auth_correlation_config where singleton),false)
 and (select count(*)=3 from pg_catalog.pg_attribute where attrelid='auth.users'::regclass and not attisdropped and ((attname='raw_app_meta_data' and atttypid='jsonb'::regtype) or (attname='banned_until' and atttypid='timestamptz'::regtype) or (attname='id' and atttypid='uuid'::regtype)))
 and (
  (select count(*)=2 from expected_triggers where tgenabled='A')
  or (
   -- Hosted Auth owns its table. Normal triggers protect only origin/local execution;
   -- never describe this branch as ALWAYS or accept a replica-capable Auth principal.
   (select count(*)=2 from expected_triggers where tgenabled='O')
   and pg_catalog.current_setting('session_replication_role') in ('origin','local')
   and (select pg_catalog.pg_get_userbyid(relowner)='supabase_auth_admin' from pg_catalog.pg_class where oid='auth.users'::regclass)
   and (select count(*)=6 from execution_roles)
   and not exists(select 1 from reachable_roles r join pg_catalog.pg_roles p on p.oid=r.oid where p.rolsuper or pg_catalog.has_parameter_privilege(p.oid,'session_replication_role','SET'))
   and not exists(select 1 from pg_catalog.pg_auth_members where member=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin'))
   and not exists(
    select 1 from pg_catalog.pg_db_role_setting s cross join lateral pg_catalog.unnest(s.setconfig) c(setting)
    where (s.setdatabase=0 or s.setdatabase=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database()))
     and (s.setrole=0 or s.setrole in (select oid from reachable_roles))
     and c.setting like 'session_replication_role=%' and c.setting not in ('session_replication_role=origin','session_replication_role=local')
   )
  )
 )
$$;
commit;
