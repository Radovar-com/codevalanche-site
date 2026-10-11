begin;
drop function public.codevalanche_credential_evidence(uuid,uuid);
create function public.codevalanche_credential_evidence(p_user_id uuid,p_session_id uuid)
returns table(verified_factor_count bigint,credential_changed_at timestamptz,recovery_only boolean,policy_version bigint,current_status text,blocked boolean,session_active boolean,qualified boolean)
language sql stable security definer set search_path='' as $$
 select (select count(*) from auth.mfa_factors where user_id=p_user_id and status='verified'),a.credential_changed_at,
 not exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session_id and m.authentication_method in ('password','oauth','sso/saml')),
 coalesce(a.policy_version,1),case when u.banned_until>now() then 'suspended' else coalesce(a.status,'active') end,coalesce(a.blocked,false) or coalesce(u.banned_until>now(),false),true,
 exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.users'::regclass and tgname='codevalanche_password_stamp' and tgenabled in ('O','A')) and exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.mfa_factors'::regclass and tgname='codevalanche_mfa_stamp' and tgenabled in ('O','A'))
 from auth.sessions s join auth.users u on u.id=s.user_id left join public.codevalanche_account_state a on a.user_id=s.user_id
 where s.id=p_session_id and s.user_id=p_user_id and (s.not_after is null or s.not_after>now())
 and not exists(select 1 from public.codevalanche_revoked_sessions r where r.session_id=s.id)
$$;
revoke all on function public.codevalanche_credential_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.codevalanche_credential_evidence(uuid,uuid) to service_role;
commit;
