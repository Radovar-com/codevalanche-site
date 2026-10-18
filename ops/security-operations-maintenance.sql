-- Do not include command text, user identity, SQL errors or provider log messages.
select jsonb_build_object(
 'jobs', (select coalesce(jsonb_agg(jsonb_build_object(
   'active',active,'schedule',schedule,
   'command_matches',command='SET statement_timeout = ''5min''; SET lock_timeout = ''5s''; SELECT public.wa_run_website_analytics_maintenance();',
   'database_matches',database=current_database(),
   'local_target',nodename in ('localhost','127.0.0.1','::1'))),'[]'::jsonb)
   from cron.job where jobname='owned-website-analytics-maintenance-v1'),
 'state', (select coalesce(jsonb_agg(jsonb_build_object(
   'status',status,'last_success_at',last_success_at)),'[]'::jsonb)
   from public.wa_maintenance_state),
 'runs', (select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
   select d.status,d.start_time,d.end_time from cron.job_run_details d
   join cron.job j using(jobid) where j.jobname='owned-website-analytics-maintenance-v1'
   order by d.start_time desc limit 5) r)
) as maintenance;
