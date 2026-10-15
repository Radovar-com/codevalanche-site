begin;
-- Application profile owns editable display fields. Auth remains identity and
-- credential authority. No direct writes to provider-managed Auth metadata.
create table public.codevalanche_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name)<=80),
 bio text not null check(length(bio)<=500),updated_at timestamptz not null default now()
);
-- Functional idempotency keys survive raw outcome retention and are erased
-- with the account. They contain no profile values or optional observations.
create table public.codevalanche_profile_requests(
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,primary key(user_id,request_id)
);
alter table public.codevalanche_profile_requests enable row level security;
revoke all on public.codevalanche_profile_requests from public,anon,authenticated;
grant select,insert,delete on public.codevalanche_profile_requests to service_role;
create table public.wa_profile_outcomes(
 outcome_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid,event_name text not null check(event_name in ('profile_update_succeeded','profile_update_failed')),
 occurred_at timestamptz not null default clock_timestamp(),
 consent_generation bigint,reason_code text check(reason_code in ('persistence_unavailable')),
 -- One terminal result per correlated operation. A later successful retry
 -- supersedes its earlier confirmed rollback, never coexists with failure.
 unique(user_id,request_id)
);
comment on table public.wa_profile_outcomes is 'Operational profile results, not optional W/A activity. No profile field values. Raw retention 90 days; Auth erasure cascades.';
alter table public.codevalanche_profiles enable row level security;
alter table public.wa_profile_outcomes enable row level security;
revoke all on public.codevalanche_profiles,public.wa_profile_outcomes from public,anon,authenticated;
grant select,insert,update,delete on public.codevalanche_profiles,public.wa_profile_outcomes to service_role;

create function public.codevalanche_profile_read(p_user_id uuid)
returns table(display_name text,bio text) language sql stable security definer set search_path='' as $$
 select coalesce(p.display_name,left(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',''),80)),coalesce(p.bio,left(coalesce(u.raw_user_meta_data->>'bio',''),500))
 from auth.users u left join public.codevalanche_profiles p on p.user_id=u.id where u.id=p_user_id
$$;

create function public.codevalanche_persist_profile_outcome(p_user_id uuid,p_changes jsonb,p_request_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path='' as $$
declare v_generation bigint;v_state public.codevalanche_account_state;
begin
 if jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}' or exists(select 1 from jsonb_each(p_changes) where key not in ('display_name','bio') or jsonb_typeof(value)<>'string' or length(value#>>'{}')>case when key='bio' then 500 else 80 end) then raise exception 'invalid_fields';end if;
 -- Only the P4 state/profile are touched; no existing receipt is locked here.
 select * into v_state from public.codevalanche_account_state where user_id=p_user_id for update;
 if found and (v_state.status<>'active' or v_state.blocked) then raise exception 'account_forbidden';end if;
 if v_state.analytics_consent then v_generation:=v_state.consent_generation;end if;
 insert into public.codevalanche_profiles(user_id,display_name,bio)
 select p_user_id,r.display_name,r.bio from public.codevalanche_profile_read(p_user_id) r on conflict(user_id) do nothing;
 perform 1 from public.codevalanche_profiles where user_id=p_user_id for update;
 if not found then raise exception 'account_forbidden';end if;
 if p_request_id is not null and exists(select 1 from public.codevalanche_profile_requests where user_id=p_user_id and request_id=p_request_id) then return query select true;return;end if;
 begin
  update public.codevalanche_profiles set display_name=case when p_changes?'display_name' then p_changes->>'display_name' else display_name end,bio=case when p_changes?'bio' then p_changes->>'bio' else bio end,updated_at=clock_timestamp() where user_id=p_user_id;
  insert into public.wa_profile_outcomes(user_id,request_id,event_name,consent_generation) values(p_user_id,p_request_id,'profile_update_succeeded',v_generation)
  on conflict(user_id,request_id) do update set event_name=excluded.event_name,occurred_at=excluded.occurred_at,consent_generation=excluded.consent_generation,reason_code=null;
  if p_request_id is not null then insert into public.codevalanche_profile_requests values(p_user_id,p_request_id);end if;
 exception when others then
  -- This subtransaction has rolled back profile/outcome/key writes. The outer
  -- P4/profile locks still serialize this result with save/retry/resolution.
  -- If this record also fails, the entire RPC fails and the caller keeps the
  -- result unknown. Never manufacture failure from a transport exception.
  insert into public.wa_profile_outcomes(user_id,request_id,event_name,reason_code) values(p_user_id,p_request_id,'profile_update_failed','persistence_unavailable') on conflict(user_id,request_id) do nothing;
  return query select false;return;
 end;
 return query select true;
end $$;
create function public.codevalanche_profile_resolution(p_user_id uuid,p_request_id uuid)
returns table(committed boolean) language plpgsql security definer set search_path='' as $$
begin
 -- Same order as persistence, no receipt lock. An absent key is UNKNOWN, not
 -- proof of terminal failure: a not-yet-started/in-flight attempt can commit.
 perform 1 from public.codevalanche_account_state where user_id=p_user_id for update;
 perform 1 from public.codevalanche_profiles where user_id=p_user_id for update;
 return query select p_request_id is not null and exists(select 1 from public.codevalanche_profile_requests where user_id=p_user_id and request_id=p_request_id);
end
$$;
revoke all on function public.codevalanche_profile_read(uuid),public.codevalanche_persist_profile_outcome(uuid,jsonb,uuid),public.codevalanche_profile_resolution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.codevalanche_profile_read(uuid),public.codevalanche_persist_profile_outcome(uuid,jsonb,uuid),public.codevalanche_profile_resolution(uuid,uuid) to service_role;
create or replace function public.codevalanche_admin_directory(p_search text default '',p_after uuid default null,p_limit integer default 51)
returns table(id uuid,email text,display_name text,bio text,email_confirmed_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz,status text,blocked boolean,suspended_until timestamptz,policy_version bigint,remote_enabled boolean,max_hosts integer,max_controllers integer,max_concurrent_runs integer,deletion_scheduled_for timestamptz,session_count bigint,erasure_job_id uuid)
language sql stable security definer set search_path='' as $$
 select u.id,u.email::text,p.display_name,p.bio,u.email_confirmed_at,u.created_at,u.last_sign_in_at,coalesce(a.status,'active'),coalesce(a.blocked,false),a.suspended_until,coalesce(a.policy_version,1),coalesce(a.remote_enabled,false),coalesce(a.max_hosts,3),coalesce(a.max_controllers,5),coalesce(a.max_concurrent_runs,2),a.deletion_scheduled_for,(select count(*) from public.codevalanche_sessions(u.id)),e.job_id
 from auth.users u cross join lateral public.codevalanche_profile_read(u.id) p left join public.codevalanche_account_state a on a.user_id=u.id left join public.codevalanche_account_erasure_jobs e on e.job_id=a.erasure_job_id and e.user_id=u.id
 where (p_after is null or u.id>p_after) and (p_search='' or position(lower(left(p_search,200)) in lower(coalesce(u.email,'')))>0 or position(lower(left(p_search,200)) in lower(p.display_name))>0)
 order by u.id limit greatest(1,least(p_limit,101))
$$;
create or replace function public.codevalanche_admin_user_detail(p_user_id uuid)
returns table(id uuid,email text,display_name text,bio text,email_confirmed_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz,status text,blocked boolean,suspended_until timestamptz,policy_version bigint,remote_enabled boolean,max_hosts integer,max_controllers integer,max_concurrent_runs integer,deletion_scheduled_for timestamptz,session_count bigint,erasure_job_id uuid)
language sql stable security definer set search_path='' as $$
 select u.id,u.email::text,p.display_name,p.bio,u.email_confirmed_at,u.created_at,u.last_sign_in_at,coalesce(a.status,'active'),coalesce(a.blocked,false),a.suspended_until,coalesce(a.policy_version,1),coalesce(a.remote_enabled,false),coalesce(a.max_hosts,3),coalesce(a.max_controllers,5),coalesce(a.max_concurrent_runs,2),a.deletion_scheduled_for,(select count(*) from public.codevalanche_sessions(u.id)),e.job_id from auth.users u cross join lateral public.codevalanche_profile_read(u.id) p left join public.codevalanche_account_state a on a.user_id=u.id left join public.codevalanche_account_erasure_jobs e on e.job_id=a.erasure_job_id and e.user_id=u.id where u.id=p_user_id
$$;


create table public.wa_profile_source_state(singleton boolean primary key default true check(singleton),observed_from timestamptz not null default clock_timestamp());
insert into public.wa_profile_source_state default values;
alter table public.wa_profile_source_state enable row level security;
revoke all on public.wa_profile_source_state from public,anon,authenticated;
grant select on public.wa_profile_source_state to service_role;

create function public.wa_read_account_outcomes(p_actor_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_provider boolean;v_password boolean;v_watermark timestamptz;v_start timestamptz;
begin
 perform public.wa_assert_report_actor(p_actor_id);
 perform public.wa_assert_report_period(p_from,p_to,p_timezone);
 select provider_audit_enabled,password_hook_enabled,watermark into v_provider,v_password,v_watermark from public.codevalanche_provider_event_cursor where source='provider_audit';
 select greatest(observed_from,now()-interval '90 days') into v_start from public.wa_profile_source_state;
 with concepts(concept,source) as (values ('account_created','auth_users'),('email_verified','auth_users'),('login_succeeded','provider_audit'),('login_failed','provider_audit'),('password_valid','password_hook'),('password_invalid','password_hook'),('token_refreshed','provider_audit'),('profile_update_succeeded','account_operation'),('profile_update_failed','account_operation'),('session_revoked','unavailable'),('logout_completed','unavailable'),('password_reset_completed','unavailable'),('password_changed','unavailable'),('mfa_completed','unavailable'),('app_admitted','unavailable'),('account_deletion_requested','unavailable'),('account_deletion_completed','unavailable')),
 observed as (
 select 'account_created'::text concept,u.created_at occurred_at,null::uuid outcome_id,0::bigint attributed from auth.users u
 union all select 'email_verified',u.email_confirmed_at,null,0 from auth.users u where u.email_confirmed_at is not null
 union all select e.event_name,e.occurred_at,null,0 from public.codevalanche_security_events e where ((e.source='provider_audit' and e.event_name in ('login_succeeded','login_failed','token_refreshed')) or (e.source='password_hook' and e.event_name in ('password_valid','password_invalid'))) and (e.event_name<>'login_succeeded' or (e.outcome='success' and e.session_id is not null and e.user_id is not null))
 union all select p.event_name,p.occurred_at,p.outcome_id,case when p.request_id is not null and p.consent_generation is not null and exists(
  select 1 from public.wa_events e join public.wa_receipt_account_bindings b on b.receipt_id=e.consent_receipt_id
  join public.codevalanche_account_state a on a.user_id=b.principal_id
  where e.event_source='A' and e.event_name='profile_save_submitted' and e.properties->>'operation_id'=p.request_id::text and b.principal_id=p.user_id and b.account_consent_generation=p.consent_generation
  and a.analytics_consent and a.status='active' and not a.blocked and a.consent_generation=b.account_consent_generation
 ) then 1 else 0 end from public.wa_profile_outcomes p where p.occurred_at>=v_start
 ), counts as (select c.concept,c.source,count(o.concept)::bigint n,coalesce(sum(o.attributed),0) attributed from concepts c left join observed o on o.concept=c.concept and o.occurred_at>=p_from and o.occurred_at<p_to group by c.concept,c.source)
 select jsonb_agg(jsonb_build_object('concept',concept,'source',source,'count',case when source='unavailable' then null when source='provider_audit' and not coalesce(v_provider,false) or source='password_hook' and not coalesce(v_password,false) or source='account_operation' and p_to<=v_start then null else n end,
 'attributed',attributed,'coverage',case when source='unavailable' then 'unmeasured' when source='provider_audit' and not coalesce(v_provider,false) or source='password_hook' and not coalesce(v_password,false) then 'not_configured' when source='account_operation' and p_to<=v_start then 'unmeasured' else 'partial' end,
 'watermark',case when source='unavailable' then null when source in ('provider_audit','password_hook') then v_watermark else now() end) order by concept) into v_rows from counts;
 return jsonb_build_object('rows',v_rows,'observedFrom',v_start,'watermark',now());
end $$;
create function public.wa_profile_retention(p_now timestamptz default now())
returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint;
begin delete from public.wa_profile_outcomes where occurred_at<p_now-interval '90 days';get diagnostics n=row_count;return n;end $$;
revoke all on function public.wa_read_account_outcomes(uuid,timestamptz,timestamptz,text),public.wa_profile_retention(timestamptz) from public,anon,authenticated;
grant execute on function public.wa_read_account_outcomes(uuid,timestamptz,timestamptz,text),public.wa_profile_retention(timestamptz) to service_role;

commit;
