begin;
create table public.codevalanche_project_bindings(
 project_id text primary key default ('prj_'||replace(gen_random_uuid()::text,'-','')) check(project_id ~ '^prj_[a-f0-9]{32}$'),
 owner_user_id uuid not null references public.codevalanche_account_state(user_id) on delete cascade,
 local_alias text not null check(local_alias ~ '^[a-zA-Z0-9_-]{1,128}$'),
 binding_version bigint not null default 1 check(binding_version=1),created_at timestamptz not null default clock_timestamp(),
 unique(owner_user_id,local_alias)
);
alter table public.codevalanche_project_bindings enable row level security;
revoke all on public.codevalanche_project_bindings from public,anon,authenticated,service_role,codevalanche_native_ledger_ingest_worker;
create function public.codevalanche_assert_project_actor(p_user_id uuid,p_session_id uuid,p_policy_version bigint,p_create_state boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_ban timestamptz;v_state public.codevalanche_account_state;
begin
 select u.banned_until into v_ban from auth.users u join auth.sessions s on s.user_id=u.id where u.id=p_user_id and s.id=p_session_id and (s.not_after is null or s.not_after>clock_timestamp()) for share of u,s;
 if not found or exists(select 1 from public.codevalanche_revoked_sessions r where r.session_id=p_session_id) then raise exception 'session_revoked';end if;
 if v_ban>clock_timestamp() then raise exception 'account_suspended';end if;
 if not exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session_id and m.authentication_method in ('password','oauth','sso/saml')) then raise exception 'recovery_restricted';end if;
 if p_create_state then insert into public.codevalanche_account_state(user_id) values(p_user_id) on conflict do nothing;end if;
 select * into v_state from public.codevalanche_account_state a where a.user_id=p_user_id for share;
 if v_state.status in ('suspended','deletion_pending','deleted') or v_state.blocked then raise exception 'account_forbidden';end if;
 if p_policy_version is null or p_policy_version<>coalesce(v_state.policy_version,1) then raise exception 'project_binding_policy_changed';end if;
end $$;
create function public.codevalanche_project_register(p_user_id uuid,p_session_id uuid,p_policy_version bigint,p_local_alias text)
returns setof public.codevalanche_project_bindings language plpgsql security definer set search_path='' as $$
begin
 if p_local_alias is null or p_local_alias !~ '^[a-zA-Z0-9_-]{1,128}$' then raise exception 'invalid_fields';end if;
 perform public.codevalanche_assert_project_actor(p_user_id,p_session_id,p_policy_version,true);
 insert into public.codevalanche_project_bindings(owner_user_id,local_alias) values(p_user_id,p_local_alias) on conflict(owner_user_id,local_alias) do nothing;
 return query select b.* from public.codevalanche_project_bindings b where b.owner_user_id=p_user_id and b.local_alias=p_local_alias;
end $$;
create function public.codevalanche_project_lookup(p_user_id uuid,p_session_id uuid,p_policy_version bigint,p_project_id text default null,p_local_alias text default null)
returns setof public.codevalanche_project_bindings language plpgsql security definer set search_path='' as $$
begin
 if (p_project_id is null)=(p_local_alias is null) or (p_project_id is not null and p_project_id !~ '^prj_[a-f0-9]{32}$') or (p_local_alias is not null and p_local_alias !~ '^[a-zA-Z0-9_-]{1,128}$') then raise exception 'invalid_fields';end if;
 perform public.codevalanche_assert_project_actor(p_user_id,p_session_id,p_policy_version,false);
 return query select b.* from public.codevalanche_project_bindings b where b.owner_user_id=p_user_id and ((p_project_id is not null and b.project_id=p_project_id) or (p_local_alias is not null and b.local_alias=p_local_alias));
end $$;
create function public.codevalanche_native_project_ownership(p_user_id uuid,p_session_id uuid,p_project_id text,p_consent_generation bigint,p_policy_version bigint,p_binding_version bigint)
returns table(owned boolean,project_id text,binding_version bigint,ownership text,physical_root_verified boolean,native_execution_verified boolean,producer_qualified boolean)
language plpgsql security definer set search_path='' as $$
declare v_binding public.codevalanche_project_bindings;v_consent boolean;v_generation bigint;
begin
 begin perform public.codevalanche_assert_project_actor(p_user_id,p_session_id,p_policy_version,false);
 exception when raise_exception then
  if sqlerrm not in ('session_revoked','account_suspended','recovery_restricted','account_forbidden','project_binding_policy_changed') then raise;end if;
  return query select false,null::text,null::bigint,'unconfirmed'::text,false,false,false;return;
 end;
 select a.analytics_consent,a.consent_generation into v_consent,v_generation from public.codevalanche_account_state a where a.user_id=p_user_id;
 if not coalesce(v_consent,false) or p_consent_generation is null or v_generation is distinct from p_consent_generation then return query select false,null::text,null::bigint,'unconfirmed'::text,false,false,false;return;end if;
 select * into v_binding from public.codevalanche_project_bindings b where b.owner_user_id=p_user_id and b.project_id=p_project_id and b.binding_version=p_binding_version;
 if not found then return query select false,null::text,null::bigint,'unconfirmed'::text,false,false,false;return;end if;
 return query select true,v_binding.project_id,v_binding.binding_version,'account_metadata'::text,false,false,false;
end $$;
revoke all on function public.codevalanche_assert_project_actor(uuid,uuid,bigint,boolean),public.codevalanche_project_register(uuid,uuid,bigint,text),public.codevalanche_project_lookup(uuid,uuid,bigint,text,text),public.codevalanche_native_project_ownership(uuid,uuid,text,bigint,bigint,bigint) from public,anon,authenticated,service_role,codevalanche_native_ledger_ingest_worker;
grant execute on function public.codevalanche_project_register(uuid,uuid,bigint,text),public.codevalanche_project_lookup(uuid,uuid,bigint,text,text) to service_role;
grant execute on function public.codevalanche_native_project_ownership(uuid,uuid,text,bigint,bigint,bigint) to codevalanche_native_ledger_ingest_worker;
-- Deliberately no change to native ingest021 or existing receipt provenance/qualification.
commit;
