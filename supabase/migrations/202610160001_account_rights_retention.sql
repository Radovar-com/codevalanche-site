-- Account rights and retention (W7-SRV-ACCOUNT). Additive only: no existing
-- object is altered or replaced, so clients on API v2 (desktop 0.2.9426 and
-- later, the account website) keep their exact behaviour.
--
-- 1. Revoking one session also ends it at Supabase Auth (its refresh tokens go
--    with it), so a copy of that device's token can no longer be renewed.
-- 2. A data export for the signed-in user (GDPR art. 15 / 20).
-- 3. Written retention for account events, feedback, revocation rows,
--    finished operation jobs and the rate-limit table.
-- 4. Indexes for the per-user and time-ordered reads of feedback and events.
-- The retention periods are documented in docs/account-data-retention.md.
begin;

-- 4. Indexes ---------------------------------------------------------------
create index if not exists codevalanche_feedback_user_created on public.codevalanche_feedback(user_id, created_at desc);
create index if not exists codevalanche_feedback_created on public.codevalanche_feedback(created_at desc, id);
create index if not exists codevalanche_events_user_created on public.codevalanche_events(user_id, created_at desc);
create index if not exists codevalanche_events_created on public.codevalanche_events(created_at desc);
create index if not exists codevalanche_rate_limits_started on public.codevalanche_rate_limits(started_at);
create index if not exists codevalanche_revoked_sessions_user on public.codevalanche_revoked_sessions(user_id, revoked_at);

-- 1. Revoke one session, at the application AND at Supabase Auth -------------
-- Returns 'provider_ended' (Auth session deleted now), 'already_ended' (no Auth
-- session left) or 'application_only' (the database role may not delete Auth
-- sessions on this project: the application-level revocation still holds and
-- the operator is told by the API result). Deleting auth.sessions cascades to
-- auth.refresh_tokens and auth.mfa_amr_claims in the Supabase Auth schema.
create function public.codevalanche_revoke_session(p_user_id uuid, p_session_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_deleted integer := 0;
begin
 if p_user_id is null or p_session_id is null then raise exception 'invalid_fields'; end if;
 select s.user_id into v_owner from auth.sessions s where s.id = p_session_id;
 if found and v_owner is distinct from p_user_id then raise exception 'not_found'; end if;
 insert into public.codevalanche_revoked_sessions(session_id, user_id) values (p_session_id, p_user_id)
 on conflict (session_id) do update set revoked_at = now()
 where public.codevalanche_revoked_sessions.user_id = excluded.user_id;
 begin
  delete from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id;
  get diagnostics v_deleted = row_count;
 exception when insufficient_privilege then
  return 'application_only';
 end;
 return case when v_deleted > 0 then 'provider_ended' else 'already_ended' end;
end $$;
revoke all on function public.codevalanche_revoke_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.codevalanche_revoke_session(uuid, uuid) to service_role;

-- 2. Data export -------------------------------------------------------------
-- Everything the account service stores about one user, from application
-- tables. Identity fields held by Auth (email, identities, sessions) are added
-- by the Edge Function from the verified Auth user. Lease bookkeeping and the
-- identifiers of OTHER people (administrator actor ids) are left out.
create function public.codevalanche_account_export(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit constant integer := 50000;
begin
 if p_user_id is null then raise exception 'invalid_fields'; end if;
 return jsonb_build_object(
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
  'limitPerList', v_limit
 );
end $$;
revoke all on function public.codevalanche_account_export(uuid) from public, anon, authenticated;
grant execute on function public.codevalanche_account_export(uuid) to service_role;

-- 3. Retention ---------------------------------------------------------------
-- Rate-limit rows only matter inside their one-minute window.
create function public.codevalanche_rate_limits_prune(p_limit integer default 5000)
returns integer language plpgsql security definer set search_path='' as $$
declare v_deleted integer;
begin
 delete from public.codevalanche_rate_limits r where r.bucket in (
  select x.bucket from public.codevalanche_rate_limits x
  where x.started_at < now() - interval '2 minutes'
  order by x.started_at limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  for update skip locked);
 get diagnostics v_deleted = row_count;
 return v_deleted;
end $$;
revoke all on function public.codevalanche_rate_limits_prune(integer) from public, anon, authenticated;
grant execute on function public.codevalanche_rate_limits_prune(integer) to service_role, codevalanche_retention_worker;

-- Age-based retention of account data that has no other expiry. Periods:
--   account events (codevalanche_events) ........ 90 days (same as activity v2)
--   feedback (codevalanche_feedback) ............ 730 days after it was sent
--   revocation rows whose Auth session is gone .. 30 days (longer than any JWT)
--   finished operation / suspension jobs ........ 365 days (same as admin audit)
--   rate-limit rows ............................. 2 minutes after their window
-- Erasure of an account still deletes its rows at once (erasure job).
create function public.codevalanche_account_retention(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_events integer; v_feedback integer; v_revoked integer; v_operations integer; v_suspensions integer; v_limits integer;
begin
 if p_now is null or p_now > now() + interval '1 minute' then raise exception 'invalid_fields'; end if;
 delete from public.codevalanche_events e where e.created_at < p_now - interval '90 days';
 get diagnostics v_events = row_count;
 delete from public.codevalanche_feedback f where f.created_at < p_now - interval '730 days';
 get diagnostics v_feedback = row_count;
 delete from public.codevalanche_revoked_sessions r where r.revoked_at < p_now - interval '30 days'
  and not exists (select 1 from auth.sessions s where s.id = r.session_id);
 get diagnostics v_revoked = row_count;
 delete from public.codevalanche_operation_jobs o where o.state in ('completed', 'failed')
  and coalesce(o.completed_at, o.updated_at) < p_now - interval '365 days';
 get diagnostics v_operations = row_count;
 delete from public.codevalanche_suspension_expiry_jobs j where j.state in ('completed', 'superseded')
  and coalesce(j.completed_at, j.created_at) < p_now - interval '365 days';
 get diagnostics v_suspensions = row_count;
 delete from public.codevalanche_rate_limits r where r.started_at < p_now - interval '2 minutes';
 get diagnostics v_limits = row_count;
 return jsonb_build_object('eventsDeleted', v_events, 'feedbackDeleted', v_feedback, 'revokedSessionsDeleted', v_revoked,
  'operationJobsDeleted', v_operations, 'suspensionJobsDeleted', v_suspensions, 'rateLimitsDeleted', v_limits);
end $$;
revoke all on function public.codevalanche_account_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.codevalanche_account_retention(timestamptz) to service_role, codevalanche_retention_worker;

commit;
