-- Actual production metadata and effective privileges only; never application rows.
select jsonb_build_object(
 'observed_at',statement_timestamp(),
 'tables',(select jsonb_agg(jsonb_build_object(
   'table',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
   'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),
   'anon_update',has_table_privilege('anon',c.oid,'UPDATE'),
   'anon_delete',has_table_privilege('anon',c.oid,'DELETE'),
   'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
   'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
   'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),
   'authenticated_delete',has_table_privilege('authenticated',c.oid,'DELETE')
 ) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('codevalanche_account_state','codevalanche_revoked_sessions','codevalanche_feedback','codevalanche_events','codevalanche_rate_limits')),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('table',tablename,'roles',roles,'command',cmd,'qual',qual,'with_check',with_check) order by tablename,policyname),'[]'::jsonb)
   from pg_policies where schemaname='public' and tablename in ('codevalanche_account_state','codevalanche_revoked_sessions','codevalanche_feedback','codevalanche_events','codevalanche_rate_limits')),
 'functions',(select jsonb_agg(jsonb_build_object(
   'function',p.oid::regprocedure::text,'security_definer',p.prosecdef,
   'empty_search_path',coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""'],
   'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE'),
   'public_execute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0 and x.privilege_type='EXECUTE')
 ) order by p.proname) from pg_proc p where p.oid in ('public.codevalanche_sessions(uuid)'::regprocedure,'public.codevalanche_rate_limit(text,integer)'::regprocedure)),
 'client_roles',(select jsonb_agg(jsonb_build_object('role',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls) order by rolname) from pg_roles where rolname in ('anon','authenticated'))
) as authorization;
