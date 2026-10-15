begin;
-- Native primary social sign-in AMR is exactly oauth. Provider/delegated
-- authorization-code grants, MFA and recovery do not become primary logins.
-- Preserve password history while fencing new social capture at this upgrade.
alter table public.wa_provider_session_source add column oauth_observed_from timestamptz not null default clock_timestamp();
alter table public.wa_provider_session_receipts drop constraint wa_provider_session_receipts_primary_method_check;
alter table public.wa_provider_session_receipts add constraint wa_provider_session_receipts_primary_method_check check(primary_method in ('password','oauth'));
comment on table public.wa_provider_session_receipts is 'Provider database primary password or native social OAuth session issuance. No delegated-code, MFA or admission inference. Canonical session UUID dedup, raw90d retention and Auth-user cascade, no identifying archive.';
create or replace function public.wa_capture_provider_session() returns trigger language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare v_session uuid;v_observed timestamptz;v_inserted bigint;
begin
 -- Role is set by PostgreSQL, not request metadata/JWT/browser intent. Ordinary
 -- service/HTTP roles have no membership allowing SET ROLE supabase_auth_admin.
 if not (current_setting('role')='supabase_auth_admin' or (session_user='supabase_auth_admin' and current_setting('role')='none')) then return new;end if;
 if tg_table_schema<>'auth' or tg_op<>'INSERT' then return new;end if;
 if tg_table_name='sessions' then v_session:=new.id;elsif tg_table_name='mfa_amr_claims' then v_session:=new.session_id;else return new;end if;
 v_observed:=clock_timestamp();
 insert into public.wa_provider_session_receipts(session_id,user_id,occurred_at,observed_at,primary_method)
 select s.id,s.user_id,s.created_at,v_observed,primary_amr.method from auth.sessions s cross join public.wa_provider_session_source c
 cross join lateral (
  select a.authentication_method method from auth.mfa_amr_claims a where a.session_id=s.id
  and (a.authentication_method='password' or (a.authentication_method='oauth' and s.created_at>=c.oauth_observed_from))
  order by case when a.authentication_method='password' then 0 else 1 end limit 1
 ) primary_amr
 where s.id=v_session and s.created_at>=c.installed_at and s.created_at<=v_observed
 and not exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method in ('recovery','oauth_provider','authorization_code'))
 on conflict(session_id) do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted>0 then update public.wa_provider_session_source set watermark=greatest(watermark,v_observed);end if;
 return new;
exception when query_canceled or others then
 -- Best effort analytics must not turn an ordinary provider authentication into
 -- failure. Failure state is also best effort if the store itself is unavailable.
 begin update public.wa_provider_session_source set qualified=false,capture_errors=capture_errors+1;exception when query_canceled or others then null;end;
 return new;
end $$;
create or replace function public.wa_provider_session_source_qualified() returns boolean language sql stable security definer set search_path='' as $$
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
 and exists(select 1 from pg_catalog.pg_attribute a join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='public.wa_provider_session_source'::regclass and a.attname='oauth_observed_from' and not a.attisdropped and a.attnotnull and a.atttypid='timestamptz'::regtype and pg_catalog.pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()')
 and (select count(*)=6 from pg_catalog.pg_attribute where not attisdropped and (
  (attrelid='auth.sessions'::regclass and ((attname in ('id','user_id') and atttypid='uuid'::regtype) or (attname='created_at' and atttypid='timestamptz'::regtype)))
  or (attrelid='auth.mfa_amr_claims'::regclass and ((attname='session_id' and atttypid='uuid'::regtype) or (attname='authentication_method' and atttypid='text'::regtype) or (attname='created_at' and atttypid='timestamptz'::regtype)))
 ))
 and (select count(*)=2 from pg_catalog.pg_class where oid in ('auth.sessions'::regclass,'auth.mfa_amr_claims'::regclass) and pg_catalog.pg_get_userbyid(relowner)='supabase_auth_admin')
 and (select count(*)=2 from expected_triggers where tgenabled='O')
 and exists(select 1 from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.wa_capture_provider_session()') and prosecdef and proconfig=array['search_path=""','lock_timeout=100ms']::text[] and proowner not in (select oid from reachable_roles))
 and pg_catalog.current_setting('session_replication_role') in ('origin','local')
 and (select count(*)=5 from execution_roles)
 and not exists(select 1 from reachable_roles r join pg_catalog.pg_roles p on p.oid=r.oid where p.rolsuper or pg_catalog.has_parameter_privilege(p.oid,'session_replication_role','SET'))
 and not exists(select 1 from pg_catalog.pg_auth_members where member=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin') or roleid=(select oid from pg_catalog.pg_roles where rolname='supabase_auth_admin'))
 and not exists(select 1 from pg_catalog.pg_db_role_setting s cross join lateral pg_catalog.unnest(s.setconfig) c(setting)
  where (s.setdatabase=0 or s.setdatabase=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())) and (s.setrole=0 or s.setrole in (select oid from reachable_roles))
  and c.setting like 'session_replication_role=%' and c.setting not in ('session_replication_role=origin','session_replication_role=local'))
$$;
create or replace function public.wa_read_account_outcomes(p_actor_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text)
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
 return jsonb_set(v_result,'{rows}',v_rows)||jsonb_build_object('providerSessionSource',jsonb_build_object('qualified',v_qualified,'observedFrom',v_start,'oauthObservedFrom',greatest(v_source.oauth_observed_from,now()-interval '90 days'),'watermark',v_source.watermark,'captureErrors',v_source.capture_errors));
end $$;
-- New method support requires fresh qualification, never implicit activation.
update public.wa_provider_session_source set qualified=false;
commit;
