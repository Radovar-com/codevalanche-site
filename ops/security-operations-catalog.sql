-- Metadata only: no user rows, tokens, settings values, function bodies or cron messages.
select current_setting('server_version') as server_version,
       to_regclass('supabase_migrations.schema_migrations') is not null as migrations_table_present,
       to_regclass('public.wa_maintenance_state') is not null as analytics_maintenance_present,
       to_regclass('cron.job') is not null as cron_present,
       (select count(*)::integer from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r') as public_table_count;
