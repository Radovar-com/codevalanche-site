-- Two-step verification recovery codes, the administrator read journal and
-- cutting every live session of a blocked user.
--
-- Same rules as 202609080001: application tables only, RLS on, no grants to
-- anon/authenticated, every access goes through the verified-session Edge
-- Function with the service role. The TOTP factors themselves are Supabase Auth
-- MFA (auth.mfa_factors); nothing here reads or changes them.
begin;

-- One row per recovery code. Only a SHA-256 of "<user id>:<normalized code>" is
-- stored; the codes are shown once, when they are generated.
create table public.codevalanche_mfa_recovery_codes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 used_at timestamptz,
 unique (user_id, code_hash)
);
create index codevalanche_mfa_recovery_codes_user on public.codevalanche_mfa_recovery_codes(user_id) where used_at is null;

-- Append-only journal of what administrators read or changed. No foreign keys:
-- the entry outlives the accounts it names.
create table public.codevalanche_admin_access_log (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null,
 action text not null check (action in ('admin-feedback','admin-analytics','admin-list-users','admin-block-user','admin-unblock-user')),
 target_user_id uuid,
 row_count integer check (row_count is null or row_count >= 0),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and length(detail::text) <= 2000),
 occurred_at timestamptz not null default now()
);
create index codevalanche_admin_access_log_time on public.codevalanche_admin_access_log(occurred_at desc);

alter table public.codevalanche_mfa_recovery_codes enable row level security;
alter table public.codevalanche_admin_access_log enable row level security;
revoke all on public.codevalanche_mfa_recovery_codes, public.codevalanche_admin_access_log from public, anon, authenticated;
grant select, insert, update, delete on public.codevalanche_mfa_recovery_codes to service_role;
-- The journal can be written and read, never edited or deleted, by the service.
grant select, insert on public.codevalanche_admin_access_log to service_role;

-- Replaces every recovery code of a user in one transaction.
create function public.codevalanche_mfa_recovery_replace(p_user_id uuid, p_code_hashes text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
 if p_user_id is null or coalesce(array_length(p_code_hashes, 1), 0) <> 10 then raise exception 'invalid_recovery_codes'; end if;
 foreach v_hash in array p_code_hashes loop
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_recovery_codes'; end if;
 end loop;
 delete from public.codevalanche_mfa_recovery_codes where user_id = p_user_id;
 insert into public.codevalanche_mfa_recovery_codes(user_id, code_hash) select p_user_id, h from unnest(p_code_hashes) as h;
 return 10;
end;
$$;

-- Marks one unused code as used. True only for the single caller that used it.
create function public.codevalanche_mfa_recovery_consume(p_user_id uuid, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 update public.codevalanche_mfa_recovery_codes set used_at = now()
  where user_id = p_user_id and code_hash = p_code_hash and used_at is null
  returning id into v_id;
 return v_id is not null;
end;
$$;

create function public.codevalanche_mfa_recovery_remaining(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
 select count(*)::integer from public.codevalanche_mfa_recovery_codes where user_id = p_user_id and used_at is null
$$;

create function public.codevalanche_mfa_recovery_clear(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 delete from public.codevalanche_mfa_recovery_codes where user_id = p_user_id;
 get diagnostics v_count = row_count;
 return v_count;
end;
$$;

-- Ends every session of a user (used when an administrator blocks the account):
-- 1. the application refuses every current access token at once
--    (codevalanche_revoked_sessions, read by codevalanche_sessions);
-- 2. the Auth sessions and their refresh tokens are deleted, so no refresh can
--    mint a new access token and unblocking later does not bring old sessions
--    back. This is what Auth's own global sign-out does for a token holder; the
--    admin API has no "sign out user by id".
-- If the database refuses step 2 (Auth tables not writable by this role), step 1
-- still holds, the Auth ban still stops sign-in and refresh, and the answer says
-- auth_revoked=false so the caller can report it.
create function public.codevalanche_revoke_all_sessions(p_user_id uuid)
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
  v_auth := false;
 end;
 return jsonb_build_object('app_revoked', v_app, 'auth_sessions_deleted', v_sessions, 'refresh_tokens_deleted', v_tokens, 'auth_revoked', v_auth);
end;
$$;

revoke all on function public.codevalanche_mfa_recovery_replace(uuid, text[]) from public, anon, authenticated;
revoke all on function public.codevalanche_mfa_recovery_consume(uuid, text) from public, anon, authenticated;
revoke all on function public.codevalanche_mfa_recovery_remaining(uuid) from public, anon, authenticated;
revoke all on function public.codevalanche_mfa_recovery_clear(uuid) from public, anon, authenticated;
revoke all on function public.codevalanche_revoke_all_sessions(uuid) from public, anon, authenticated;
grant execute on function public.codevalanche_mfa_recovery_replace(uuid, text[]) to service_role;
grant execute on function public.codevalanche_mfa_recovery_consume(uuid, text) to service_role;
grant execute on function public.codevalanche_mfa_recovery_remaining(uuid) to service_role;
grant execute on function public.codevalanche_mfa_recovery_clear(uuid) to service_role;
grant execute on function public.codevalanche_revoke_all_sessions(uuid) to service_role;
commit;
