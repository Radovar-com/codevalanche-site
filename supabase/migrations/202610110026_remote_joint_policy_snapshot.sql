begin;
-- Arguments are identities/MFA from two independently authenticated access tokens,
-- supplied only by the private Site handler. They are not client assurance flags.
create function public.codevalanche_remote_joint_policy(
 p_user_id uuid,p_snapshot_id uuid,
 p_host_session_id uuid,p_host_client_id text,p_host_aal text,
 p_host_mfa_verified_at timestamptz,p_host_expires_at timestamptz,
 p_controller_session_id uuid,p_controller_client_id text,p_controller_aal text,
 p_controller_mfa_verified_at timestamptz,p_controller_expires_at timestamptz
) returns table(qualified boolean,snapshot jsonb)
language sql stable security definer set search_path='' as $$
 with sampled as materialized (
  select statement_timestamp() as sampled_at,p_snapshot_id as snapshot_id
 ), trigger_gate as materialized (
  select exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.users'::regclass
   and tgname='codevalanche_password_stamp' and tgenabled in ('O','A')
   and tgfoid='public.codevalanche_credential_changed()'::regprocedure)
  and exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.mfa_factors'::regclass
   and tgname='codevalanche_mfa_stamp' and tgenabled in ('O','A')
   and tgfoid='public.codevalanche_credential_changed()'::regprocedure) as qualified
 ), actors(side,session_id,client_id,aal,mfa_at,expires_at) as materialized (
  values ('host',p_host_session_id,p_host_client_id,p_host_aal,p_host_mfa_verified_at,p_host_expires_at),
         ('controller',p_controller_session_id,p_controller_client_id,p_controller_aal,p_controller_mfa_verified_at,p_controller_expires_at)
 ), states as materialized (
  select t.side,jsonb_build_object(
   'principal',jsonb_build_object('userId',u.id,'sessionId',s.id,'clientId',t.client_id,
    'aal',t.aal,'mfaVerifiedAt',t.mfa_at,'emailVerified',true),
   'policy',jsonb_build_object('status',a.status,'suspendedUntil',a.suspended_until,
    'policyVersion',a.policy_version,'limits',jsonb_build_object('enabled',a.remote_enabled,
     'maxHosts',a.max_hosts,'maxControllers',a.max_controllers,'maxConcurrentRuns',a.max_concurrent_runs)),
   'recoveryRestricted',false,'sessionActive',true,'mfaCurrent',true) as canonical
  from actors t cross join sampled c cross join trigger_gate g
  join auth.sessions s on s.id=t.session_id and s.user_id=p_user_id
  join auth.users u on u.id=s.user_id
  join public.codevalanche_account_state a on a.user_id=u.id
  where g.qualified and c.snapshot_id is not null
   and t.aal='aal2' and t.mfa_at is not null and t.mfa_at<=c.sampled_at
   and t.mfa_at>=s.created_at and t.expires_at>c.sampled_at
   and (a.credential_changed_at is null or t.mfa_at>a.credential_changed_at)
   and (s.not_after is null or s.not_after>c.sampled_at)
   and not exists(select 1 from public.codevalanche_revoked_sessions r where r.session_id=s.id)
   and (u.banned_until is null or u.banned_until<=c.sampled_at)
   and u.email_confirmed_at is not null and a.status='active' and not a.blocked
   and a.remote_enabled and a.policy_version>0
   and a.max_hosts>=0 and a.max_controllers>=0 and a.max_concurrent_runs>=0
   and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp')
   and exists(select 1 from auth.mfa_amr_claims m where m.session_id=s.id and m.authentication_method in ('password','oauth','sso/saml'))
   and not exists(select 1 from auth.mfa_amr_claims m where m.session_id=s.id
    and m.authentication_method in ('otp','recovery','invite','signup','magiclink')
    and m.created_at >= (select max(p.created_at) from auth.mfa_amr_claims p where p.session_id=s.id and p.authentication_method in ('password','oauth','sso/saml')))
 )
 select g.qualified,case when count(t.side)=2 then
  jsonb_build_object('source','site_auth_sql_snapshot','snapshotId',c.snapshot_id)
   || jsonb_object_agg(t.side,t.canonical) filter(where t.side is not null)
  else null end
 from sampled c cross join trigger_gate g left join states t on true
 group by g.qualified,c.snapshot_id
$$;
revoke all on function public.codevalanche_remote_joint_policy(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.codevalanche_remote_joint_policy(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,text,text,timestamptz,timestamptz) to service_role;
commit;
