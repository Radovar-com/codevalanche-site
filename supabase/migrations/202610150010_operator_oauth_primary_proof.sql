begin;
-- OAuth authorization-code AMR describes delegation, not primary sign-in.
-- Keep the ordinary recovery/credential policy unchanged. These short-lived,
-- private capabilities assemble a provider-observed primary parent and a
-- separately verified native-MFA OAuth session for operator reads only.
create table public.codevalanche_operator_oauth_proofs(
 authorization_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 parent_session_id uuid not null references auth.sessions(id) on delete cascade,
 client_id text not null,
 state_hash text not null check(state_hash ~ '^[0-9a-f]{64}$'),
 code_hash text not null check(code_hash ~ '^[0-9a-f]{64}$'),
 pkce_challenge text not null check(pkce_challenge ~ '^[A-Za-z0-9_-]{43}$'),
 credential_stamp timestamptz,
 prepared_at timestamptz not null default clock_timestamp(),
 claim_deadline timestamptz not null,
 oauth_session_id uuid unique references auth.sessions(id) on delete cascade,
 grant_expires_at timestamptz,
 unique(state_hash,code_hash)
);
alter table public.codevalanche_operator_oauth_proofs enable row level security;
revoke all on public.codevalanche_operator_oauth_proofs from public,anon,authenticated,service_role;

create function public.codevalanche_operator_challenge_equal(p_left text,p_right text)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_diff integer:=0;v_i integer;
begin
 if p_left is null or p_right is null or length(p_left)<>43 or length(p_right)<>43 then return false;end if;
 -- Fixed public S256 length, full comparison without an early byte exit.
 for v_i in 1..43 loop v_diff:=v_diff | (ascii(substr(p_left,v_i,1)) # ascii(substr(p_right,v_i,1)));end loop;
 return v_diff=0;
end $$;

create function public.codevalanche_operator_primary_parent(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_e record;v_primary timestamptz;
begin
 select * into v_e from public.codevalanche_credential_evidence(p_user_id,p_session_id);
 if v_e.qualified is distinct from true then raise exception 'account_service_unavailable';end if;
 if v_e.session_active is distinct from true or v_e.recovery_only is distinct from false
 or v_e.current_status is distinct from 'active' or v_e.blocked is distinct from false
 or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=p_session_id and s.user_id=p_user_id and u.email_confirmed_at is not null
  and nullif(to_jsonb(s)->>'oauth_client_id','') is null)
 then raise exception 'recovery_restricted';end if;
 perform public.wa_assert_report_actor(p_user_id);
 select max(greatest(m.created_at,m.updated_at)) into v_primary from auth.mfa_amr_claims m
 where m.session_id=p_session_id and m.authentication_method in ('password','oauth','sso/saml');
 if v_primary is null or v_primary>clock_timestamp()
 or (v_e.credential_changed_at is not null and v_primary<=v_e.credential_changed_at)
 then raise exception 'reauthentication_required';end if;
 return jsonb_build_object('credentialStamp',v_e.credential_changed_at);
end $$;

create function public.codevalanche_operator_oauth_context(p_user_id uuid,p_session_id uuid,p_authorization_id text,p_client_ids text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_a record;v_parent jsonb;
begin
 -- Runtime lookup keeps unsupported/missing provider OAuth schema fail closed.
 execute 'select * from auth.oauth_authorizations where authorization_id=$1' into v_a using p_authorization_id;
 if v_a.id is null then raise exception 'invalid_fields';end if;
 if (v_a.client_id::text=any(p_client_ids)) is distinct from true then return jsonb_build_object('operator',false);end if;
 v_parent:=public.codevalanche_operator_primary_parent(p_user_id,p_session_id);
 if (v_a.user_id is not null and v_a.user_id<>p_user_id) or v_a.status is null or v_a.status::text not in ('pending','approved')
 or v_a.expires_at is null or v_a.expires_at<=clock_timestamp() or lower(v_a.code_challenge_method::text) is distinct from 's256'
 or v_a.code_challenge is null or v_a.code_challenge !~ '^[A-Za-z0-9_-]{43}$'
 or v_a.state is null or length(v_a.state) not between 32 and 512 or v_a.state !~ '^[A-Za-z0-9_-]+$'
 then raise exception 'invalid_fields';end if;
 return jsonb_build_object('operator',true,'clientId',v_a.client_id,'state',v_a.state,
 'redirectUri',v_a.redirect_uri,'credentialStamp',v_parent->'credentialStamp');
end $$;

create function public.codevalanche_operator_oauth_store(p_user_id uuid,p_session_id uuid,p_authorization_id text,p_client_id text,p_state_hash text,p_code_hash text,p_credential_stamp timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_a record;v_parent jsonb;
begin
 v_parent:=public.codevalanche_operator_primary_parent(p_user_id,p_session_id);
 if (v_parent->>'credentialStamp')::timestamptz is distinct from p_credential_stamp then raise exception 'reauthentication_required';end if;
 execute 'select * from auth.oauth_authorizations where authorization_id=$1' into v_a using p_authorization_id;
 if v_a.id is null or v_a.user_id is distinct from p_user_id or v_a.client_id::text is distinct from p_client_id
 or v_a.status::text is distinct from 'approved' or v_a.expires_at is null or v_a.expires_at<=clock_timestamp()
 or lower(v_a.code_challenge_method::text) is distinct from 's256' or v_a.code_challenge is null or v_a.code_challenge !~ '^[A-Za-z0-9_-]{43}$'
 or v_a.state is null or length(v_a.state) not between 32 and 512 or v_a.state !~ '^[A-Za-z0-9_-]+$' or v_a.authorization_code is null
 or encode(sha256(convert_to(v_a.state,'UTF8')),'hex') is distinct from p_state_hash
 or encode(sha256(convert_to(v_a.authorization_code,'UTF8')),'hex') is distinct from p_code_hash
 then raise exception 'invalid_fields';end if;
 delete from public.codevalanche_operator_oauth_proofs where coalesce(grant_expires_at,claim_deadline)<=clock_timestamp();
 insert into public.codevalanche_operator_oauth_proofs(authorization_id,user_id,parent_session_id,client_id,state_hash,code_hash,pkce_challenge,credential_stamp,claim_deadline)
 values(v_a.id,p_user_id,p_session_id,p_client_id,p_state_hash,p_code_hash,v_a.code_challenge,p_credential_stamp,least(v_a.expires_at,clock_timestamp()+interval '5 minutes'))
 on conflict(authorization_id) do nothing;
 if not exists(select 1 from public.codevalanche_operator_oauth_proofs r where r.authorization_id=v_a.id and r.user_id=p_user_id
 and r.parent_session_id=p_session_id and r.client_id=p_client_id and r.state_hash=p_state_hash and r.code_hash=p_code_hash
 and r.pkce_challenge=v_a.code_challenge and r.credential_stamp is not distinct from p_credential_stamp
 and r.oauth_session_id is null and r.claim_deadline>clock_timestamp()) then raise exception 'invalid_fields';end if;
 return true;
end $$;

create function public.codevalanche_operator_oauth_evidence(p_user_id uuid,p_session_id uuid,p_client_id text,p_state_hash text default null,p_code_hash text default null,p_pkce_challenge text default null)
returns table(qualified boolean) language plpgsql security definer set search_path='' as $$
declare v_p public.codevalanche_operator_oauth_proofs;v_parent jsonb;v_claim boolean:=p_state_hash is not null or p_code_hash is not null or p_pkce_challenge is not null;v_totp timestamptz;
begin
 if v_claim then
  if p_state_hash !~ '^[0-9a-f]{64}$' or p_code_hash !~ '^[0-9a-f]{64}$' or p_pkce_challenge !~ '^[A-Za-z0-9_-]{43}$'
  or p_state_hash is null or p_code_hash is null or p_pkce_challenge is null then return query select false;return;end if;
  select * into v_p from public.codevalanche_operator_oauth_proofs where state_hash=p_state_hash and code_hash=p_code_hash for update;
 else
  select * into v_p from public.codevalanche_operator_oauth_proofs where oauth_session_id=p_session_id;
 end if;
 if v_p.authorization_id is null or v_p.user_id is distinct from p_user_id or v_p.client_id is distinct from p_client_id
 or (v_claim and not public.codevalanche_operator_challenge_equal(v_p.pkce_challenge,p_pkce_challenge))
 or (v_p.oauth_session_id is null and (not v_claim or v_p.claim_deadline<=clock_timestamp()))
 or (v_p.oauth_session_id is not null and (v_p.oauth_session_id<>p_session_id or v_p.grant_expires_at<=clock_timestamp()))
 then return query select false;return;end if;
 if not exists(select 1 from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id
  and to_jsonb(s)->>'oauth_client_id'=p_client_id and to_jsonb(s)->>'aal'='aal2'
  and s.created_at>=v_p.prepared_at and s.created_at<=v_p.claim_deadline
  and (s.not_after is null or s.not_after>clock_timestamp())
  and not exists(select 1 from public.codevalanche_revoked_sessions r where r.session_id=s.id))
 or not exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session_id and m.authentication_method='oauth_provider/authorization_code'
  and m.created_at>=v_p.prepared_at and m.created_at<=v_p.claim_deadline)
 or exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session_id and m.authentication_method not in ('oauth_provider/authorization_code','totp'))
 or not exists(select 1 from auth.mfa_factors f where f.user_id=p_user_id and f.factor_type='totp' and f.status='verified')
 then return query select false;return;end if;
 v_parent:=public.codevalanche_operator_primary_parent(p_user_id,v_p.parent_session_id);
 if (v_parent->>'credentialStamp')::timestamptz is distinct from v_p.credential_stamp then return query select false;return;end if;
 select max(greatest(created_at,updated_at)) into v_totp from auth.mfa_amr_claims where session_id=p_session_id and authentication_method='totp';
 if v_totp is null or v_totp>clock_timestamp() or (v_p.credential_stamp is not null and v_totp<=v_p.credential_stamp)
 or (v_claim and v_totp<=clock_timestamp()-interval '5 minutes') then return query select false;return;end if;
 if v_p.oauth_session_id is null then
  update public.codevalanche_operator_oauth_proofs set oauth_session_id=p_session_id,grant_expires_at=clock_timestamp()+interval '8 hours' where authorization_id=v_p.authorization_id;
 end if;
 return query select true;
end $$;

create function public.codevalanche_operator_oauth_prune() returns bigint language plpgsql security definer set search_path='' as $$
declare v_count bigint;
begin
 delete from public.codevalanche_operator_oauth_proofs where coalesce(grant_expires_at,claim_deadline)<=clock_timestamp();
 get diagnostics v_count=row_count;return v_count;
end $$;
revoke all on function public.codevalanche_operator_challenge_equal(text,text),public.codevalanche_operator_primary_parent(uuid,uuid),public.codevalanche_operator_oauth_context(uuid,uuid,text,text[]),public.codevalanche_operator_oauth_store(uuid,uuid,text,text,text,text,timestamptz),public.codevalanche_operator_oauth_evidence(uuid,uuid,text,text,text,text),public.codevalanche_operator_oauth_prune() from public,anon,authenticated;
grant execute on function public.codevalanche_operator_oauth_context(uuid,uuid,text,text[]),public.codevalanche_operator_oauth_store(uuid,uuid,text,text,text,text,timestamptz),public.codevalanche_operator_oauth_evidence(uuid,uuid,text,text,text,text),public.codevalanche_operator_oauth_prune() to service_role;
-- Include physical expiry cleanup in the existing qualified maintenance path;
-- no additional job, extension, key, or scheduler is installed here.
alter function public.wa_prune_website_analytics(timestamptz) rename to wa_prune_website_analytics_without_operator_proofs;
revoke all on function public.wa_prune_website_analytics_without_operator_proofs(timestamptz) from public,anon,authenticated,service_role;
create function public.wa_prune_website_analytics(p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_count bigint;
begin
 v_result:=public.wa_prune_website_analytics_without_operator_proofs(p_now);
 v_count:=public.codevalanche_operator_oauth_prune();
 return v_result||jsonb_build_object('operatorProofs',v_count);
end $$;
revoke all on function public.wa_prune_website_analytics(timestamptz) from public,anon,authenticated;
grant execute on function public.wa_prune_website_analytics(timestamptz) to service_role;
commit;
