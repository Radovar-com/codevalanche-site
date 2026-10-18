select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'columns',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r'),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid)) order by c.relname,x.conname)
   from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'indexes',(select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) order by tablename,indexname) from pg_indexes where schemaname='public'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('codevalanche_sessions','codevalanche_rate_limit')),
 'table_grants',(select jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable) order by table_name,grantee,privilege_type) from information_schema.table_privileges where table_schema='public'),
 'function_grants',(select jsonb_agg(jsonb_build_object('name',routine_name,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable) order by routine_name,grantee,privilege_type) from information_schema.routine_privileges where routine_schema='public' and routine_name in ('codevalanche_sessions','codevalanche_rate_limit'))
) as schema;
