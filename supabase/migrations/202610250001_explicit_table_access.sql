-- Explicit Data API access, independent of historical default privileges.
-- Keep application DML and RPC capabilities; do not expose private rows to visitors.
-- Scope this repair to application tables, leaving extensions and future tables alone.
begin;

do $access$
declare v_table text;
begin
 foreach v_table in array array[
  'codevalanche_account_erasure_jobs',
  'codevalanche_account_state',
  'codevalanche_admin_access_log',
  'codevalanche_admin_audit',
  'codevalanche_admin_memberships',
  'codevalanche_analytics_v2',
  'codevalanche_auth_correlation_config',
  'codevalanche_auth_operation_attempts',
  'codevalanche_credential_events',
  'codevalanche_download_counts',
  'codevalanche_events',
  'codevalanche_feedback',
  'codevalanche_mfa_recovery_codes',
  'codevalanche_native_ledger_producers',
  'codevalanche_native_ledger_receipts',
  'codevalanche_native_receipt_ownership',
  'codevalanche_notification_outbox',
  'codevalanche_operation_jobs',
  'codevalanche_operator_oauth_proofs',
  'codevalanche_profile_requests',
  'codevalanche_profiles',
  'codevalanche_project_bindings',
  'codevalanche_provider_event_cursor',
  'codevalanche_rate_limits',
  'codevalanche_revoked_sessions',
  'codevalanche_security_events',
  'codevalanche_suspension_expiry_jobs',
  'wa_consent_receipts',
  'wa_daily_rollups',
  'wa_data_health',
  'wa_download_daily',
  'wa_download_requests',
  'wa_events',
  'wa_maintenance_state',
  'wa_profile_outcomes',
  'wa_profile_source_state',
  'wa_provider_session_receipts',
  'wa_provider_session_source',
  'wa_rate_limits',
  'wa_receipt_account_bindings',
  'wa_report_state',
  'wa_rollup_coverage',
  'wa_sessions',
  'wa_source_snapshots'
 ] loop
  execute format('alter table public.%I enable row level security',v_table);
  execute format('revoke all privileges on table public.%I from public,anon,authenticated,service_role',v_table);
 end loop;
end
$access$;

-- Preserve the existing service contract, including read-only audit/queue tables.
-- RPC-only tables above remain owner-only: SECURITY DEFINER performs their DML.
grant select on table public.codevalanche_account_erasure_jobs to service_role;
grant select,insert,update,delete on table public.codevalanche_account_state to service_role;
grant select,insert on table public.codevalanche_admin_access_log to service_role;
grant select on table public.codevalanche_admin_audit to service_role;
grant select on table public.codevalanche_admin_memberships to service_role;
grant select on table public.codevalanche_analytics_v2 to service_role;
grant select,insert,delete on table public.codevalanche_credential_events to service_role;
grant select on table public.codevalanche_download_counts to service_role;
grant select,insert,update,delete on table public.codevalanche_events to service_role;
grant select,insert,update,delete on table public.codevalanche_feedback to service_role;
grant select,insert,update,delete on table public.codevalanche_mfa_recovery_codes to service_role;
grant select on table public.codevalanche_notification_outbox to service_role;
grant select on table public.codevalanche_operation_jobs to service_role;
grant select,insert,delete on table public.codevalanche_profile_requests to service_role;
grant select,insert,update,delete on table public.codevalanche_profiles to service_role;
grant select on table public.codevalanche_provider_event_cursor to service_role;
grant select,insert,update,delete on table public.codevalanche_rate_limits to service_role;
grant select,insert,update,delete on table public.codevalanche_revoked_sessions to service_role;
grant select,insert on table public.codevalanche_security_events to service_role;
grant select on table public.codevalanche_suspension_expiry_jobs to service_role;
grant select,insert,update,delete on table public.wa_consent_receipts to service_role;
grant select,insert,update,delete on table public.wa_daily_rollups to service_role;
grant select,insert,update,delete on table public.wa_data_health to service_role;
grant select,insert,update,delete on table public.wa_download_daily to service_role;
grant select,insert,update,delete on table public.wa_download_requests to service_role;
grant select,insert,update,delete on table public.wa_events to service_role;
grant select on table public.wa_maintenance_state to service_role;
grant select,insert,update,delete on table public.wa_profile_outcomes to service_role;
grant select on table public.wa_profile_source_state to service_role;
grant select on table public.wa_provider_session_receipts to service_role;
grant select on table public.wa_provider_session_source to service_role;
grant select,insert,update,delete on table public.wa_rate_limits to service_role;
grant select,insert,update,delete on table public.wa_receipt_account_bindings to service_role;
grant select,insert,update,delete on table public.wa_report_state to service_role;
grant select,insert,update,delete on table public.wa_rollup_coverage to service_role;
grant select,insert,update,delete on table public.wa_sessions to service_role;
grant select,insert,update,delete on table public.wa_source_snapshots to service_role;

-- Scoped importer reads only its cursor under the existing SELECT RLS policy.
grant select on table public.codevalanche_provider_event_cursor to codevalanche_security_import_worker;
-- No visitor table policies: default deny is intentional. Public download counting
-- keeps its existing narrow EXECUTE grant; no table privileges are needed.
commit;
