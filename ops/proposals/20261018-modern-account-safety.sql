-- REVIEWABLE INERT PROPOSAL. This file is intentionally outside supabase/migrations.
-- No workflow automatically applies it; no provider deployment is authorized here.
-- Requires the modern account foundation and both unpromoted MFA migrations
-- 202610160301 and 202610180001. It must refuse the five-table legacy production.
-- CREATE OR REPLACE preserves existing ownership/ACLs; local regression verifies this.
-- Native two-session evidence qualifies the replacement component, not a hosted release.
begin;
do $modern_account_preconditions$
begin
 if pg_catalog.to_regclass('public.codevalanche_mfa_recovery_codes') is null
  or pg_catalog.to_regclass('public.codevalanche_admin_access_log') is null
  or pg_catalog.to_regprocedure('public.codevalanche_revoke_all_sessions(uuid)') is null
  or pg_catalog.to_regprocedure('public.codevalanche_mfa_recovery_replace(uuid,text[])') is null
  or pg_catalog.to_regprocedure('public.codevalanche_mfa_recovery_prepare(uuid,text)') is null
  or pg_catalog.to_regprocedure('public.codevalanche_mfa_recovery_complete(uuid,text)') is null
 then raise exception 'modern_account_foundation_required'; end if;
end;
$modern_account_preconditions$;

create or replace function public.codevalanche_revoke_all_sessions(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_app integer := 0; v_sessions integer := 0; v_tokens integer := 0; v_auth boolean := true;
begin
 if p_user_id is null then raise exception 'invalid_user'; end if;
 insert into public.codevalanche_revoked_sessions(session_id, user_id)
  select s.id, s.user_id from auth.sessions s where s.user_id = p_user_id
  on conflict (session_id) do nothing;
 get diagnostics v_app = row_count;
 begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  get diagnostics v_tokens = row_count;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_sessions = row_count;
 exception when insufficient_privilege then
  -- The inner block rolled back both deletes; its PL/pgSQL variables did not.
  v_sessions := 0;
  v_tokens := 0;
  v_auth := false;
 end;
 return jsonb_build_object('app_revoked', v_app, 'auth_sessions_deleted', v_sessions, 'refresh_tokens_deleted', v_tokens, 'auth_revoked', v_auth);
end;
$$;

create or replace function public.codevalanche_mfa_recovery_replace(p_user_id uuid, p_code_hashes text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
 if p_user_id is null or coalesce(array_length(p_code_hashes, 1), 0) <> 10 then raise exception 'invalid_recovery_codes'; end if;
 foreach v_hash in array p_code_hashes loop
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_recovery_codes'; end if;
 end loop;
 -- Serialize replacement for one user, including an initially empty code set.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'codevalanche:mfa-recovery-replace:' || p_user_id::text, 202610180003::bigint));
 delete from public.codevalanche_mfa_recovery_codes where user_id = p_user_id;
 insert into public.codevalanche_mfa_recovery_codes(user_id, code_hash) select p_user_id, h from unnest(p_code_hashes) as h;
 return 10;
end;
$$;

commit;
