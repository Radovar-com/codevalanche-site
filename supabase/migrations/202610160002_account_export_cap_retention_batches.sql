-- Review fixes for 202610160001 (W7-FIX-SRV-ACCOUNT). Same signatures and
-- grants, so callers do not change.
--
-- 1. The export document has a byte cap: above it the database raises
--    'export_too_large' before sending anything, and the Edge Function answers
--    413 instead of running out of memory. The cap is 20 MiB; the setting
--    codevalanche.account_export_max_bytes can only LOWER it (tests, incidents).
-- 2. Account retention deletes in bounded batches (10,000 rows per table per
--    call) and returns more=true when a table still has expired rows, so a large
--    first backlog makes progress on every call instead of hitting
--    statement_timeout. The worker repeats the call while more=true (bounded).
--    Rate-limit rows go through the batched codevalanche_rate_limits_prune.
begin;

create or replace function public.codevalanche_account_export(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_limit constant integer := 50000;
 v_cap constant bigint := 20971520;
 v_max bigint := v_cap;
 v_setting text := current_setting('codevalanche.account_export_max_bytes', true);
 v_doc jsonb;
begin
 if p_user_id is null then raise exception 'invalid_fields'; end if;
 if v_setting ~ '^[0-9]{1,18}$' then v_max := least(v_cap, v_setting::bigint); end if;
 v_doc := jsonb_build_object(
  'accountState', (select to_jsonb(a) from public.codevalanche_account_state a where a.user_id = p_user_id),
  'profile', (select to_jsonb(p) from public.codevalanche_profiles p where p.user_id = p_user_id),
  'administratorMembership', (select to_jsonb(m) from public.codevalanche_admin_memberships m where m.user_id = p_user_id),
  'feedback', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select f.id, f.category, f.message, f.status, f.created_at from public.codevalanche_feedback f where f.user_id = p_user_id order by f.created_at limit v_limit) x), '[]'::jsonb),
  'events', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select e.id, e.event_name, e.platform, e.created_at from public.codevalanche_events e where e.user_id = p_user_id order by e.created_at limit v_limit) x), '[]'::jsonb),
  'activity', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (select a.* from public.codevalanche_analytics_v2 a where a.user_id = p_user_id order by a.occurred_at limit v_limit) x), '[]'::jsonb),
  'revokedSessions', coalesce((select jsonb_agg(to_jsonb(x) order by x.revoked_at) from (select r.session_id, r.revoked_at from public.codevalanche_revoked_sessions r where r.user_id = p_user_id order by r.revoked_at limit v_limit) x), '[]'::jsonb),
  'credentialEvents', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (select c.event_name, c.occurred_at from public.codevalanche_credential_events c where c.user_id = p_user_id order by c.occurred_at limit v_limit) x), '[]'::jsonb),
  'securityEvents', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (select s.source, s.occurred_at, s.session_id, s.event_name, s.outcome, s.reason_code, host(s.ip) as ip from public.codevalanche_security_events s where s.user_id = p_user_id order by s.occurred_at limit v_limit) x), '[]'::jsonb),
  'accountActions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select o.operation_id, o.action, o.reason_code, o.state, o.created_at, o.completed_at from public.codevalanche_operation_jobs o where o.user_id = p_user_id order by o.created_at limit v_limit) x), '[]'::jsonb),
  'deletionRequests', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select j.job_id, j.state, j.due_at, j.created_at, j.completed_at from public.codevalanche_account_erasure_jobs j where j.user_id = p_user_id order by j.created_at limit v_limit) x), '[]'::jsonb),
  'notifications', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select n.id, n.event_type, n.state, n.payload, n.created_at, n.delivered_at from public.codevalanche_notification_outbox n where n.user_id = p_user_id order by n.created_at limit v_limit) x), '[]'::jsonb),
  'projects', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select b.project_id, b.local_alias, b.created_at from public.codevalanche_project_bindings b where b.owner_user_id = p_user_id order by b.created_at limit v_limit) x), '[]'::jsonb),
  'runReceipts', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (select r.receipt_id, r.session_id, r.run_id, r.project_id, r.outcome, r.occurred_at from public.codevalanche_native_ledger_receipts r where r.user_id = p_user_id order by r.occurred_at limit v_limit) x), '[]'::jsonb),
  'websiteConsentBindings', coalesce((select jsonb_agg(to_jsonb(x)) from (select w.receipt_id, w.account_consent_generation from public.wa_receipt_account_bindings w where w.principal_id = p_user_id limit v_limit) x), '[]'::jsonb),
  'limitPerList', v_limit,
  'maxBytes', v_max
 );
 if octet_length(v_doc::text) > v_max then raise exception 'export_too_large'; end if;
 return v_doc;
end $$;
revoke all on function public.codevalanche_account_export(uuid) from public, anon, authenticated;
grant execute on function public.codevalanche_account_export(uuid) to service_role;

create or replace function public.codevalanche_account_retention(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_batch constant integer := 10000;
 v_events integer; v_feedback integer; v_revoked integer; v_operations integer; v_suspensions integer; v_limits integer;
begin
 if p_now is null or p_now > now() + interval '1 minute' then raise exception 'invalid_fields'; end if;
 delete from public.codevalanche_events e where e.ctid = any(array(
  select x.ctid from public.codevalanche_events x where x.created_at < p_now - interval '90 days' order by x.created_at limit v_batch));
 get diagnostics v_events = row_count;
 delete from public.codevalanche_feedback f where f.ctid = any(array(
  select x.ctid from public.codevalanche_feedback x where x.created_at < p_now - interval '730 days' order by x.created_at limit v_batch));
 get diagnostics v_feedback = row_count;
 delete from public.codevalanche_revoked_sessions r where r.ctid = any(array(
  select x.ctid from public.codevalanche_revoked_sessions x where x.revoked_at < p_now - interval '30 days'
   and not exists (select 1 from auth.sessions s where s.id = x.session_id) order by x.revoked_at limit v_batch));
 get diagnostics v_revoked = row_count;
 delete from public.codevalanche_operation_jobs o where o.ctid = any(array(
  select x.ctid from public.codevalanche_operation_jobs x where x.state in ('completed', 'failed')
   and coalesce(x.completed_at, x.updated_at) < p_now - interval '365 days' limit v_batch));
 get diagnostics v_operations = row_count;
 delete from public.codevalanche_suspension_expiry_jobs j where j.ctid = any(array(
  select x.ctid from public.codevalanche_suspension_expiry_jobs x where x.state in ('completed', 'superseded')
   and coalesce(x.completed_at, x.created_at) < p_now - interval '365 days' limit v_batch));
 get diagnostics v_suspensions = row_count;
 v_limits := public.codevalanche_rate_limits_prune(v_batch);
 return jsonb_build_object('eventsDeleted', v_events, 'feedbackDeleted', v_feedback, 'revokedSessionsDeleted', v_revoked,
  'operationJobsDeleted', v_operations, 'suspensionJobsDeleted', v_suspensions, 'rateLimitsDeleted', v_limits,
  'batch', v_batch,
  'more', greatest(v_events, v_feedback, v_revoked, v_operations, v_suspensions, v_limits) >= v_batch);
end $$;
revoke all on function public.codevalanche_account_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.codevalanche_account_retention(timestamptz) to service_role, codevalanche_retention_worker;

commit;
