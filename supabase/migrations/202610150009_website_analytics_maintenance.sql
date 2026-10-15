begin;
-- Deliberately installs neither pg_cron nor a job. An operator qualifies the
-- extension and opts in separately after reviewing this migration.
create table public.wa_maintenance_state(
 singleton boolean primary key default true check(singleton),
 status text not null check(status in ('never_run','succeeded','failed')),
 last_attempt_at timestamptz,last_success_at timestamptz,
 error_code text check(error_code is null or error_code ~ '^[0-9A-Z]{5}$')
);
insert into public.wa_maintenance_state(singleton,status) values(true,'never_run');
alter table public.wa_maintenance_state enable row level security;
revoke all on public.wa_maintenance_state from public,anon,authenticated,service_role;
grant select on public.wa_maintenance_state to service_role;
comment on table public.wa_maintenance_state is 'Last completed maintenance attempt, not source/event freshness. Failed/canceled work never advances last_success_at. A cancellation rolls back the entire call and is observable in scheduler failure details. No error messages, identities or event payloads.';

create function public.wa_run_website_analytics_maintenance()
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare v_now timestamptz:=clock_timestamp();v_result jsonb;v_error text;
begin
 -- Share the legacy prune lock, including callers using the older server-only
 -- entrypoint. Never queue another expensive refresh behind an existing run.
 if not pg_try_advisory_xact_lock(hashtextextended('wa_retention_rollups',0)) then
  return jsonb_build_object('status','skipped_busy');
 end if;
 begin
  -- 003 refreshes before deletion and invokes profile + D retention. 007 adds
  -- provider-session receipts. No second D call or alternative metric producer.
  v_result:=public.wa_prune_website_analytics(v_now);
 exception when others then
  -- PL/pgSQL OTHERS excludes query_canceled/assert_failure. Those must escape
  -- and be marked failed by the scheduler, without committing false success.
  get stacked diagnostics v_error=returned_sqlstate;
  update public.wa_maintenance_state set status='failed',last_attempt_at=v_now,error_code=v_error where singleton;
  return jsonb_build_object('status','failed','errorCode',v_error);
 end;
 update public.wa_maintenance_state set status='succeeded',last_attempt_at=v_now,last_success_at=clock_timestamp(),error_code=null where singleton;
 return jsonb_build_object('status','succeeded','cutoffAt',v_now,'retention',v_result);
end $$;
revoke all on function public.wa_run_website_analytics_maintenance() from public,anon,authenticated;
grant execute on function public.wa_run_website_analytics_maintenance() to service_role;

-- SECURITY INVOKER and owner-only EXECUTE: no service/API caller can install,
-- edit or delete jobs. The job role is the configuring database owner, not a
-- caller-controlled parameter. pg_cron executes local SQL without API keys.
create function public.wa_configure_website_analytics_maintenance(p_enabled boolean default false)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
 v_name constant text:='owned-website-analytics-maintenance-v1';
 v_schedule constant text:='17 2 * * *';
 v_command constant text:='SET statement_timeout = ''5min''; SET lock_timeout = ''5s''; SELECT public.wa_run_website_analytics_maintenance();';
 v_count bigint;v_job record;v_id bigint;v_zone text;
begin
 if p_enabled is null then raise exception 'invalid_fields';end if;
 if to_regclass('cron.job') is null or to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('cron.unschedule(bigint)') is null or to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null then raise exception 'maintenance_cron_unavailable';end if;
 v_zone:=current_setting('cron.timezone',true);
 if v_zone is null or v_zone not in ('UTC','GMT','Etc/UTC','Etc/GMT') then raise exception 'maintenance_cron_timezone_unqualified';end if;
 perform pg_advisory_xact_lock(hashtextextended('wa_maintenance_schedule',0));
 execute 'select count(*) from cron.job where jobname=$1' into v_count using v_name;
 if v_count>1 then raise exception 'maintenance_job_conflict';end if;
 if v_count=1 then
  execute 'select jobid,command,database,username,nodename,nodeport from cron.job where jobname=$1' into v_job using v_name;
  if v_job.command is distinct from v_command or v_job.database is distinct from current_database() or v_job.username is distinct from current_user or v_job.nodename is distinct from coalesce(nullif(current_setting('cron.host',true),''),'localhost') or v_job.nodeport is distinct from current_setting('port')::integer then raise exception 'maintenance_job_conflict';end if;
  v_id:=v_job.jobid;
 end if;
 if not p_enabled then
  if v_id is not null then execute 'select cron.unschedule($1)' using v_id;end if;
  return jsonb_build_object('active',false,'jobName',v_name);
 end if;
 if v_id is null then
  execute 'select cron.schedule($1,$2,$3)' into v_id using v_name,v_schedule,v_command;
 else
  execute 'select cron.alter_job($1,schedule:=$2,active:=true)' using v_id,v_schedule;
 end if;
 return jsonb_build_object('active',true,'jobName',v_name,'jobId',v_id,'schedule',v_schedule,'scheduleTimeZone','UTC');
end $$;
revoke all on function public.wa_configure_website_analytics_maintenance(boolean) from public,anon,authenticated,service_role;
commit;
