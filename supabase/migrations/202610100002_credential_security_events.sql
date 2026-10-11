begin;
alter table public.codevalanche_account_state add column credential_changed_at timestamptz;
create table public.codevalanche_credential_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 event_name text not null check(event_name in ('password_changed','mfa_changed')),
 occurred_at timestamptz not null default now(), policy_version bigint not null
);
alter table public.codevalanche_credential_events enable row level security;
revoke all on public.codevalanche_credential_events from public,anon,authenticated;
grant select,insert,delete on public.codevalanche_credential_events to service_role;
create function public.codevalanche_credential_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_version bigint; v_event text;
begin
 if tg_table_name='users' then
  if new.encrypted_password is not distinct from old.encrypted_password then return new; end if;
  v_user:=new.id;v_event:='password_changed';
 else
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.factor_type is not distinct from old.factor_type and new.secret is not distinct from old.secret then return new; end if;
  if tg_op='DELETE' then v_user:=old.user_id; else v_user:=new.user_id; end if;
  v_event:='mfa_changed';
 end if;
 -- Deleting Auth user cascades factors; no new app state may reference a disappearing user.
 if not exists(select 1 from auth.users where id=v_user) then return null; end if;
 insert into public.codevalanche_account_state(user_id,credential_changed_at,policy_version) values(v_user,clock_timestamp(),2)
 on conflict(user_id) do update set credential_changed_at=clock_timestamp(),policy_version=codevalanche_account_state.policy_version+1
 returning policy_version into v_version;
 insert into public.codevalanche_credential_events(user_id,event_name,policy_version) values(v_user,v_event,v_version);
 if v_event='password_changed' then
  insert into public.codevalanche_revoked_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=v_user on conflict do nothing;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function public.codevalanche_credential_changed() from public,anon,authenticated,service_role;
create trigger codevalanche_password_stamp after update of encrypted_password on auth.users for each row execute function public.codevalanche_credential_changed();
create trigger codevalanche_mfa_stamp after insert or update or delete on auth.mfa_factors for each row execute function public.codevalanche_credential_changed();
create function public.codevalanche_credential_evidence(p_user_id uuid,p_session_id uuid)
returns table(verified_factor_count bigint,credential_changed_at timestamptz,recovery_only boolean)
language sql stable security definer set search_path='' as $$
 select (select count(*) from auth.mfa_factors where user_id=p_user_id and status='verified'),
 (select a.credential_changed_at from public.codevalanche_account_state a where a.user_id=p_user_id),
 not exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session_id and m.authentication_method in ('password','oauth','sso/saml'))
 from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id
 and (s.not_after is null or s.not_after>now())
 and not exists(select 1 from public.codevalanche_revoked_sessions r where r.session_id=s.id)
$$;
revoke all on function public.codevalanche_credential_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.codevalanche_credential_evidence(uuid,uuid) to service_role;
commit;
