begin;
-- Native GoTrue MFA verification prunes the user's other AAL1 sessions. A
-- primary AAL1 parent would therefore disappear (and cascade-delete its proof)
-- when the OAuth client verifies MFA. Keep the parent live/revocation fence;
-- step it up before observing or approving any operator authorization code.
create function public.codevalanche_operator_parent_identity(p_user_id uuid,p_session_id uuid)
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

create function public.codevalanche_operator_parent_mfa_ready(p_user_id uuid,p_session_id uuid,p_stamp timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id and to_jsonb(s)->>'aal'='aal2')
 and exists(select 1 from auth.mfa_factors f where f.user_id=p_user_id and f.factor_type='totp' and f.status='verified')
 and exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session_id and m.authentication_method='totp'
  and greatest(m.created_at,m.updated_at)<=clock_timestamp()
  and (p_stamp is null or greatest(m.created_at,m.updated_at)>p_stamp))
$$;

create or replace function public.codevalanche_operator_primary_parent(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_parent jsonb;
begin
 v_parent:=public.codevalanche_operator_parent_identity(p_user_id,p_session_id);
 if not public.codevalanche_operator_parent_mfa_ready(p_user_id,p_session_id,(v_parent->>'credentialStamp')::timestamptz)
 then raise exception 'mfa_required';end if;
 return v_parent;
end $$;

create or replace function public.codevalanche_operator_oauth_context(p_user_id uuid,p_session_id uuid,p_authorization_id text,p_client_ids text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_a record;v_parent jsonb;
begin
 execute 'select * from auth.oauth_authorizations where authorization_id=$1' into v_a using p_authorization_id;
 if v_a.id is null then raise exception 'invalid_fields';end if;
 if (v_a.client_id::text=any(p_client_ids)) is distinct from true then return jsonb_build_object('operator',false);end if;
 v_parent:=public.codevalanche_operator_parent_identity(p_user_id,p_session_id);
 if (v_a.user_id is not null and v_a.user_id<>p_user_id) or v_a.status is null or v_a.status::text not in ('pending','approved')
 or v_a.expires_at is null or v_a.expires_at<=clock_timestamp() or lower(v_a.code_challenge_method::text) is distinct from 's256'
 or v_a.code_challenge is null or v_a.code_challenge !~ '^[A-Za-z0-9_-]{43}$'
 or v_a.state is null or length(v_a.state) not between 32 and 512 or v_a.state !~ '^[A-Za-z0-9_-]+$'
 then raise exception 'invalid_fields';end if;
 if not public.codevalanche_operator_parent_mfa_ready(p_user_id,p_session_id,(v_parent->>'credentialStamp')::timestamptz) then
  -- Only server-side identity metadata needed to validate the hint; never
  -- release state, code, callback or PKCE material before native parent MFA.
  return jsonb_build_object('operator',true,'parentMfaRequired',true,'clientId',v_a.client_id,'credentialStamp',v_parent->'credentialStamp');
 end if;
 return jsonb_build_object('operator',true,'clientId',v_a.client_id,'state',v_a.state,
 'redirectUri',v_a.redirect_uri,'credentialStamp',v_parent->'credentialStamp');
end $$;
revoke all on function public.codevalanche_operator_parent_identity(uuid,uuid),public.codevalanche_operator_parent_mfa_ready(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
-- Existing context/store/evidence ACLs are preserved by CREATE OR REPLACE;
-- neither identity helper can become a new directly exposed authority route.
commit;
