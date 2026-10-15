begin;
-- Prospective password-authenticated provider session issuance, never MFA or
-- application admission. The audit source and its legacy rows remain separate.
create table public.wa_provider_session_source(
 singleton boolean primary key default true check(singleton),
 installed_at timestamptz not null default clock_timestamp(),
 qualified boolean not null default false,
 watermark timestamptz,capture_errors bigint not null default 0 check(capture_errors>=0)
);
insert into public.wa_provider_session_source default values;
create table public.wa_provider_session_receipts(
 session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 occurred_at timestamptz not null,observed_at timestamptz not null default clock_timestamp(),
 primary_method text not null check(primary_method='password')
);
create index wa_provider_session_receipts_occurred on public.wa_provider_session_receipts(occurred_at);
comment on table public.wa_provider_session_receipts is 'Provider database password-session issuance proof. No MFA/admission inference. Canonical session UUID dedup; logout retains raw evidence for 90 days; Auth user deletion cascades. No identifying archive.';
alter table public.wa_provider_session_source enable row level security;
alter table public.wa_provider_session_receipts enable row level security;
revoke all on public.wa_provider_session_source,public.wa_provider_session_receipts from public,anon,authenticated,service_role;
grant select on public.wa_provider_session_source,public.wa_provider_session_receipts to service_role;

create function public.wa_capture_provider_session() returns trigger language plpgsql security definer set search_path='' as $$
declare v_session uuid;v_observed timestamptz;v_inserted bigint;
begin
 -- Role is set by PostgreSQL, not request metadata/JWT/browser intent. Ordinary
 -- service/HTTP roles have no membership allowing SET ROLE supabase_auth_admin.
 if not (current_setting('role')='supabase_auth_admin' or (session_user='supabase_auth_admin' and current_setting('role')='none')) then return new;end if;
 if tg_table_schema<>'auth' or tg_op<>'INSERT' then return new;end if;
 if tg_table_name='sessions' then v_session:=new.id;elsif tg_table_name='mfa_amr_claims' then v_session:=new.session_id;else return new;end if;
 v_observed:=clock_timestamp();
 insert into public.wa_provider_session_receipts(session_id,user_id,occurred_at,observed_at,primary_method)
 select s.id,s.user_id,s.created_at,v_observed,'password' from auth.sessions s cross join public.wa_provider_session_source c
 where s.id=v_session and s.created_at>=c.installed_at and s.created_at<=v_observed
 and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='password')
 and not exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='recovery')
 on conflict(session_id) do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted>0 then update public.wa_provider_session_source set watermark=greatest(watermark,v_observed);end if;
 return new;
exception when others then
 -- Best effort analytics must not turn an ordinary provider authentication into
 -- failure. Failure state is also best effort if the store itself is unavailable.
 begin update public.wa_provider_session_source set qualified=false,capture_errors=capture_errors+1;exception when others then null;end;
 return new;
end $$;
-- Deferred observation sees session and primary AMR together at transaction end.
-- AMR INSERT also supports providers writing the primary claim in a later txn.
create constraint trigger wa_capture_provider_session after insert on auth.sessions deferrable initially deferred for each row execute function public.wa_capture_provider_session();
create constraint trigger wa_capture_provider_session_amr after insert on auth.mfa_amr_claims deferrable initially deferred for each row execute function public.wa_capture_provider_session();
revoke all on function public.wa_capture_provider_session() from public,anon,authenticated,service_role;

create function public.wa_provider_session_source_qualified() returns boolean language sql stable security definer set search_path='' as $$
 with recursive execution_roles as (
  select oid from pg_catalog.pg_roles where rolname in ('supabase_auth_admin','anon','authenticated','service_role','authenticator')
 ),reachable_roles(oid) as (
  select oid from execution_roles union select m.roleid from pg_catalog.pg_auth_members m join reachable_roles r on r.oid=m.member where m.set_option
 ),expected_triggers as (
  select t.* from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgqual is null and t.tgnargs=0 and t.tgattr=''::int2vector
  and t.tgtype=5 and t.tgdeferrable and t.tginitdeferred and t.tgfoid=pg_catalog.to_regprocedure('public.wa_capture_provider_session()')
  and ((t.tgrelid='auth.sessions'::regclass and t.tgname='wa_capture_provider_session') or (t.tgrelid='auth.mfa_amr_claims'::regclass and t.tgname='wa_capture_provider_session_amr'))
 )
 select coalesce((select qualified and capture_errors=0 and watermark is not null from public.wa_provider_session_source where singleton),false)
 and (select count(*)=6 from pg_catalog.pg_attribute where not attisdropped and (
  (attrelid='auth.sessions'::regclass and ((attname in ('id','user_id') and atttypid='uuid'::regtype) or (attname='created_at' and atttypid='timestamptz'::regtype)))
  or (attrelid='auth.mfa_amr_claims'::regclass and ((attname='session_id' and atttypid='uuid'::regtype) or (attname='authentication_method' and atttypid='text'::regtype) or (attname='created_at' and atttypid='timestamptz'::regtype)))
 ))
 and (select count(*)=2 from pg_catalog.pg_class where oid in ('auth.sessions'::regclass,'auth.mfa_amr_claims'::regclass) and pg_catalog.pg_get_userbyid(relowner)='supabase_auth_admin')
 and (select count(*)=2 from expected_triggers where tgenabled='O')
 and exists(select 1 from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.wa_capture_provider_session()') and prosecdef and proconfig=array['search_path=""']::text[] and proowner not in (select oid from reachable_roles))
 and pg_catalog.current_setting('session_replication_role') in ('origin','local')
 and (select count(*)=5 from execution_roles)
 and not exists(select 1 from reachable_roles r join pg_catalog.pg_roles p on p.oid=r.oid where p.rolsuper or pg_catalog.has_parameter_privilege(p.oid,'session_replication_role','SET'))
 and not exists(select 1 from pg_catalog.pg_auth_members where member=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin') or roleid=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin'))
 and not exists(select 1 from pg_catalog.pg_db_role_setting s cross join lateral pg_catalog.unnest(s.setconfig) c(setting)
  where (s.setdatabase=0 or s.setdatabase=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())) and (s.setrole=0 or s.setrole in (select oid from reachable_roles))
  and c.setting like 'session_replication_role=%' and c.setting not in ('session_replication_role=origin','session_replication_role=local'))
$$;
revoke all on function public.wa_provider_session_source_qualified() from public,anon,authenticated;
grant execute on function public.wa_provider_session_source_qualified() to service_role;

-- Preserve all existing concepts and P4/operator guards. Select exactly ONE
-- producer for login, even if legacy audit capture becomes enabled later.
alter function public.wa_read_account_outcomes(uuid,timestamptz,timestamptz,text) rename to wa_read_account_outcomes_without_session_metadata;
revoke all on function public.wa_read_account_outcomes_without_session_metadata(uuid,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
create function public.wa_read_account_outcomes(p_actor_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;v_source public.wa_provider_session_source;v_qualified boolean;v_start timestamptz;v_count bigint;v_coverage text;v_rows jsonb;
begin
 perform public.wa_assert_report_actor(p_actor_id);perform public.wa_assert_report_period(p_from,p_to,p_timezone);
 v_result:=public.wa_read_account_outcomes_without_session_metadata(p_actor_id,p_from,p_to,p_timezone);
 select * into v_source from public.wa_provider_session_source where singleton;
 v_qualified:=public.wa_provider_session_source_qualified();v_start:=greatest(v_source.installed_at,now()-interval '90 days');
 if not v_qualified then v_coverage:='not_configured';
 elsif p_to<=v_start or p_from>v_source.watermark then v_coverage:='unmeasured';
 else
  v_coverage:='partial';select count(*) into v_count from public.wa_provider_session_receipts where occurred_at>=greatest(p_from,v_start) and occurred_at<p_to;
 end if;
 select jsonb_agg(case when r->>'concept'='login_succeeded' then jsonb_build_object('concept','login_succeeded','source','provider_session_metadata','count',v_count,'attributed',0,'coverage',v_coverage,'watermark',case when v_qualified then v_source.watermark else null end) else r end order by r->>'concept') into v_rows from jsonb_array_elements(v_result->'rows') r;
 return jsonb_set(v_result,'{rows}',v_rows)||jsonb_build_object('providerSessionSource',jsonb_build_object('qualified',v_qualified,'observedFrom',v_start,'watermark',v_source.watermark,'captureErrors',v_source.capture_errors));
end $$;
revoke all on function public.wa_read_account_outcomes(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.wa_read_account_outcomes(uuid,timestamptz,timestamptz,text) to service_role;

alter function public.wa_prune_website_analytics(timestamptz) rename to wa_prune_website_analytics_without_sessions;
revoke all on function public.wa_prune_website_analytics_without_sessions(timestamptz) from public,anon,authenticated,service_role;
create function public.wa_prune_website_analytics(p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_count bigint;
begin
 v_result:=public.wa_prune_website_analytics_without_sessions(p_now);
 delete from public.wa_provider_session_receipts where occurred_at<p_now-interval '90 days';get diagnostics v_count=row_count;
 return v_result||jsonb_build_object('providerSessionReceipts',v_count);
end $$;
revoke all on function public.wa_prune_website_analytics(timestamptz) from public,anon,authenticated;
grant execute on function public.wa_prune_website_analytics(timestamptz) to service_role;
commit;
