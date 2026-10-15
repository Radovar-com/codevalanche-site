begin;

-- Analytics storage is separate from Auth/security and P4 account activity.
-- These immutable guards are defense in depth; the collector must still validate
-- the versioned full schema, authenticated account consent, receipt and origin.
create function public.wa_valid_properties(p_name text,p_properties jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_keys text[];v_key text;v_value jsonb;v_text text;
begin
 v_keys:=case p_name
  when 'session_started' then array['landing_page_id','attribution_kind']
  when 'page_viewed' then array['navigation_type']
  when 'page_engagement_reported' then array['active_ms_total','visible_ms_total','max_scroll_pct','revision']
  when 'page_exited' then array['exit_kind','max_scroll_pct']
  when 'section_viewed' then array['section_id']
  when 'section_engagement_reported' then array['section_id','active_ms_total','revision']
  when 'scroll_depth_reached' then array['threshold']
  when 'cta_clicked' then array['cta_id','section_id','action_id','placement']
  when 'navigation_used' then array['navigation_id','target_page_id','placement']
  when 'outbound_clicked' then array['destination_id','section_id']
  when 'feature_selected' then array['feature_id','selection_id']
  when 'faq_toggled' then array['faq_id','expanded']
  when 'download_platform_selected' then array['platform','architecture','selection_source']
  when 'download_unavailable_shown' then array['platform','reason']
  when 'download_clicked' then array['cta_id','platform','architecture','release_id','artifact_id','placement']
  when 'contact_clicked' then array['contact_id','placement']
  when 'account_entry_clicked' then array['placement','entry_mode']
  when 'signup_started' then array['entry_point','provider_kind']
  when 'signup_form_submitted' then array['provider_kind']
  when 'verification_notice_viewed' then array['notice_kind']
  when 'login_started' then array['provider_kind','entry_point']
  when 'login_form_submitted' then array['provider_kind']
  when 'auth_challenge_viewed' then array['challenge_kind']
  when 'account_page_viewed' then array['account_page_id']
  when 'profile_edit_started' then array['edit_area_id']
  when 'profile_save_submitted' then array['operation_id']
  when 'password_reset_requested_ui' then array['entry_point']
  when 'password_reset_form_submitted' then array['flow_id']
  when 'logout_clicked' then array['account_surface']
  when 'web_vital_reported' then array['metric','value','unit','metric_id','revision']
  when 'javascript_error_observed' then array['error_code','component_id','build_sha']
  when 'resource_load_failed' then array['resource_id','resource_kind']
  when 'interaction_failed' then array['action_id','normalized_error']
  else null end;
 if v_keys is null or jsonb_typeof(p_properties) is distinct from 'object' then return false;end if;
 if not p_properties ?& v_keys or exists(select 1 from jsonb_object_keys(p_properties) k where not k=any(v_keys)) then return false;end if;
 for v_key,v_value in select * from jsonb_each(p_properties) loop
  v_text:=v_value#>>'{}';
  if v_key='expanded' then
   if jsonb_typeof(v_value)<>'boolean' then return false;end if;
  elsif v_key=any(array['active_ms_total','visible_ms_total','max_scroll_pct','revision','threshold','value']) then
   if jsonb_typeof(v_value)<>'number' or v_text::numeric<0 or v_text::numeric>9007199254740991 then return false;end if;
   if v_key in ('active_ms_total','visible_ms_total') and (v_text::numeric>86400000 or trunc(v_text::numeric)<>v_text::numeric) then return false;end if;
   if v_key='revision' and trunc(v_text::numeric)<>v_text::numeric then return false;end if;
   if v_key='max_scroll_pct' and v_text::numeric>100 then return false;end if;
   if v_key='threshold' and v_text::numeric not in (25,50,75,90,100) then return false;end if;
  else
   if jsonb_typeof(v_value)<>'string' or length(v_text)>64 or v_text !~ '^[A-Za-z0-9][A-Za-z0-9_.-]*$' or v_text ~* '(access[_-]?token|refresh[_-]?token|password[=:[:space:]]|oauth[=:#?]|service[_-]?key)' then return false;end if;
   if v_key in ('operation_id','flow_id') and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false;end if;
   if v_key='navigation_type' and v_text not in ('initial','route','back_forward') then return false;end if;
   if v_key='exit_kind' and v_text not in ('hidden','navigation') then return false;end if;
   if v_key='platform' and v_text not in ('web','windows','macos','linux','ios','android','unknown') then return false;end if;
   if v_key='architecture' and v_text not in ('x64','arm64','x86','universal','unknown') then return false;end if;
   if v_key='provider_kind' and v_text not in ('email','google','github','unknown') then return false;end if;
   if v_key='metric' and v_text not in ('LCP','INP','CLS') then return false;end if;
   if v_key='unit' and v_text not in ('ms','score') then return false;end if;
   if v_key='destination_id' and v_text not in ('product','docs','press','contact','official_repository') then return false;end if;
  end if;
 end loop;
 if p_name='page_engagement_reported' and (p_properties->>'active_ms_total')::numeric>(p_properties->>'visible_ms_total')::numeric then return false;end if;
 if p_name='web_vital_reported' and p_properties->>'unit'<>(case when p_properties->>'metric'='CLS' then 'score' else 'ms' end) then return false;end if;
 if p_name='cta_clicked' and (p_properties->>'cta_id' in ('download','signup','login','contact') or p_properties->>'action_id' in ('download','signup','login','contact')) then return false;end if;
 return true;
end $$;

create function public.wa_safe_dimensions(p_value jsonb,p_keys text[])
returns boolean language plpgsql immutable set search_path='' as $$
declare v_key text;v_value jsonb;v_text text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' then return false;end if;
 for v_key,v_value in select * from jsonb_each(p_value) loop
  v_text:=v_value#>>'{}';
  if not v_key=any(p_keys) or jsonb_typeof(v_value)<>'string' or length(v_text)>(case when v_key='referrer_domain' then 253 else 80 end) or v_text !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' or v_text ~* '(access[_-]?token|refresh[_-]?token|password[=:[:space:]]|oauth[=:#?]|service[_-]?key)' then return false;end if;
 end loop;
 return true;
end $$;

create table public.wa_consent_receipts(
 receipt_id uuid primary key,site_id text not null check(site_id in ('radovar','codevalanche')),
 policy_version text not null check(policy_version ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 generation bigint not null check(generation between 0 and 9007199254740991),website_analytics boolean not null,account_analytics boolean not null,
 issued_at timestamptz not null,expires_at timestamptz not null,revoked_at timestamptz,
 collection_token_hash text not null check(collection_token_hash ~ '^[0-9a-f]{64}$'),
 revocation_proof_hash text not null check(revocation_proof_hash ~ '^[0-9a-f]{64}$'),
 unique(receipt_id,site_id),check(expires_at>issued_at),check(revoked_at is null or revoked_at>=issued_at)
);
comment on table public.wa_consent_receipts is 'Minimal choice protocol; no visitor/session/account/IP identity; hashed capabilities only. Not proof of a human.';

-- Restricted P4 binding, separate from the anonymous choice registry. W and P4
-- generations are independent. A receipt can never be rebound to a new account.
create table public.wa_receipt_account_bindings(
 receipt_id uuid primary key references public.wa_consent_receipts(receipt_id) on delete cascade,
 principal_id uuid not null references auth.users(id) on delete cascade,
 account_consent_generation bigint not null check(account_consent_generation between 0 and 9007199254740991)
);
alter table public.wa_receipt_account_bindings enable row level security;
revoke all on public.wa_receipt_account_bindings from public,anon,authenticated;
grant select,insert,update,delete on public.wa_receipt_account_bindings to service_role;

create function public.wa_issue_consent_receipt(p_receipt_id uuid,p_site_id text,p_policy_version text,p_generation bigint,p_website_analytics boolean,p_account_analytics boolean,p_issued_at timestamptz,p_expires_at timestamptz,p_collection_hash text,p_revocation_hash text,p_principal_id uuid,p_account_generation bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_policy public.codevalanche_account_state;
begin
 if p_generation<1 or p_generation>=9007199254740991 or not (p_website_analytics or p_account_analytics) or p_expires_at>p_issued_at+interval '180 days' or p_issued_at>clock_timestamp()+interval '5 minutes' then raise exception 'invalid_fields';end if;
 if p_account_analytics then
  select * into v_policy from public.codevalanche_account_state where user_id=p_principal_id for update;
  if not found or not v_policy.analytics_consent or v_policy.status<>'active' or v_policy.blocked then raise exception 'invalid_consent';end if;
  if v_policy.consent_generation is distinct from p_account_generation then raise exception 'stale_generation';end if;
 elsif p_principal_id is not null or p_account_generation is not null then raise exception 'invalid_fields';end if;
 insert into public.wa_consent_receipts(receipt_id,site_id,policy_version,generation,website_analytics,account_analytics,issued_at,expires_at,collection_token_hash,revocation_proof_hash)
 values(p_receipt_id,p_site_id,p_policy_version,p_generation,p_website_analytics,p_account_analytics,p_issued_at,p_expires_at,p_collection_hash,p_revocation_hash);
 if p_account_analytics then insert into public.wa_receipt_account_bindings values(p_receipt_id,p_principal_id,p_account_generation);end if;
end $$;

-- T3 MUST call this guard inside the SAME transaction/RPC as event INSERT.
-- The FOR UPDATE receipt lock is shared with revocation and held until COMMIT.
-- p_principal_id is null for W, a verified current P4 principal for A.
create function public.wa_lock_consent_receipt(p_receipt_id uuid,p_site_id text,p_generation bigint,p_collection_hash text,p_principal_id uuid)
returns public.wa_consent_receipts language plpgsql security definer set search_path='' as $$
declare v_receipt public.wa_consent_receipts;v_binding public.wa_receipt_account_bindings;v_policy public.codevalanche_account_state;
begin
 select * into v_receipt from public.wa_consent_receipts where receipt_id=p_receipt_id for update;
 if not found or v_receipt.site_id is distinct from p_site_id or v_receipt.revoked_at is not null or v_receipt.expires_at<=clock_timestamp() or v_receipt.issued_at>clock_timestamp() or v_receipt.collection_token_hash is distinct from p_collection_hash then raise exception 'invalid_consent';end if;
 if v_receipt.generation is distinct from p_generation then raise exception 'stale_generation';end if;
 if p_principal_id is null then
  if not v_receipt.website_analytics then raise exception 'invalid_consent';end if;
 else
  select * into v_binding from public.wa_receipt_account_bindings where receipt_id=p_receipt_id;
  if not found or not v_receipt.account_analytics or v_binding.principal_id<>p_principal_id then raise exception 'invalid_consent';end if;
  select * into v_policy from public.codevalanche_account_state where user_id=p_principal_id for update;
  if not found or not v_policy.analytics_consent or v_policy.status<>'active' or v_policy.blocked then raise exception 'invalid_consent';end if;
  if v_policy.consent_generation<>v_binding.account_consent_generation then raise exception 'stale_generation';end if;
 end if;
 return v_receipt;
end $$;

create function public.wa_revoke_consent_receipt(p_receipt_id uuid,p_generation bigint,p_revocation_hash text,p_site_id text)
returns table(revoked boolean,generation bigint) language plpgsql security definer set search_path='' as $$
declare v_receipt public.wa_consent_receipts;
begin
 select * into v_receipt from public.wa_consent_receipts where receipt_id=p_receipt_id for update;
 if not found or v_receipt.site_id is distinct from p_site_id or v_receipt.generation is distinct from p_generation or v_receipt.revocation_proof_hash is distinct from p_revocation_hash then raise exception 'invalid_consent';end if;
 update public.wa_consent_receipts set revoked_at=coalesce(revoked_at,clock_timestamp()) where receipt_id=p_receipt_id;
 return query select true,v_receipt.generation+1;
end $$;
revoke all on function public.wa_issue_consent_receipt(uuid,text,text,bigint,boolean,boolean,timestamptz,timestamptz,text,text,uuid,bigint),public.wa_lock_consent_receipt(uuid,text,bigint,text,uuid),public.wa_revoke_consent_receipt(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.wa_issue_consent_receipt(uuid,text,text,bigint,boolean,boolean,timestamptz,timestamptz,text,text,uuid,bigint),public.wa_lock_consent_receipt(uuid,text,bigint,text,uuid),public.wa_revoke_consent_receipt(uuid,bigint,text,text) to service_role;

create table public.wa_events(
 site_id text not null check(site_id in ('radovar','codevalanche')),event_id uuid not null,schema_version integer not null default 1 check(schema_version=1),
 event_name text not null,occurred_at timestamptz not null,event_at timestamptz not null,received_at timestamptz not null default now(),
 page_id text not null check(page_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),page_instance_id uuid not null,
 page_version text not null check(page_version ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 session_id uuid not null,anonymous_id uuid not null,consent_receipt_id uuid not null,consent_generation bigint not null check(consent_generation between 0 and 9007199254740991),
 properties jsonb not null check(public.wa_valid_properties(event_name,properties)),
 context jsonb not null default '{}' check(public.wa_safe_dimensions(context,array['acquisition_source','acquisition_medium','campaign','content','term','referrer_domain','landing_page_id','locale','device_class','os_family','browser_family','viewport_bucket'])),
 event_source text not null default 'W' check(event_source in ('W','A')),
 authority text not null default 'browser_observation' check(authority in ('browser_observation','consented_account_observation')),
 surface text not null default 'marketing' check(surface in ('marketing','pre_auth','authenticated_account')),
 clock_quality text not null default 'original' check(clock_quality in ('original','adjusted')),
 traffic_class text not null default 'unknown' check(traffic_class in ('external','internal','test','suspected_bot','unknown')),
 primary key(site_id,event_id),foreign key(consent_receipt_id,site_id) references public.wa_consent_receipts(receipt_id,site_id),
 check(received_at-occurred_at<=interval '24 hours'),check(event_at<=received_at+interval '5 minutes'),
 check((event_source='W' and authority='browser_observation') or (event_source='A' and authority='consented_account_observation')),
 check(event_name not in ('account_page_viewed','profile_edit_started','profile_save_submitted','logout_clicked') or event_source='A'),
 check(surface<>'authenticated_account' or event_source='A'),
 check(page_id not in ('account','account_authorize') or event_source='A' or surface='pre_auth')
);
create index wa_events_time on public.wa_events(site_id,event_at);
create index wa_events_page on public.wa_events(site_id,page_id,page_version,event_at);
create index wa_events_session on public.wa_events(site_id,session_id,event_at);
create index wa_events_receipt on public.wa_events(consent_receipt_id,consent_generation);
comment on table public.wa_events is 'Consented W/A observations only; no Auth identity, security outcome, raw URL, form, prompt or project data. Raw retention 90 days.';

create table public.wa_sessions(
 site_id text not null check(site_id in ('radovar','codevalanche')),session_id uuid not null,anonymous_id uuid not null,
 consent_receipt_id uuid not null,consent_generation bigint not null check(consent_generation>=0),
 started_at timestamptz not null,last_event_at timestamptz not null,expires_at timestamptz not null,
 landing_page_id text not null check(landing_page_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 context jsonb not null default '{}' check(public.wa_safe_dimensions(context,array['acquisition_source','acquisition_medium','campaign','content','term','referrer_domain','locale','device_class','os_family','browser_family','viewport_bucket'])),
 primary key(site_id,session_id),foreign key(consent_receipt_id,site_id) references public.wa_consent_receipts(receipt_id,site_id),
 check(last_event_at>=started_at and last_event_at<=started_at+interval '24 hours'),
 check(expires_at>started_at and expires_at<=started_at+interval '24 hours')
);
create index wa_sessions_receipt on public.wa_sessions(consent_receipt_id);

create table public.wa_source_snapshots(
 snapshot_id uuid primary key default gen_random_uuid(),site_id text not null check(site_id in ('radovar','codevalanche')),
 source text not null check(source='release_provider'),artifact_id text not null check(artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 release_id text not null check(release_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),count_total bigint not null check(count_total>=0),
 observed_at timestamptz not null,source_watermark timestamptz,
 counter_status text not null default 'baseline' check(counter_status in ('measured','baseline','reset','asset_removed','not_configured')),
 unique(site_id,source,artifact_id,observed_at)
);

create table public.wa_daily_rollups(
 site_id text not null check(site_id in ('radovar','codevalanche')),day date not null,time_zone text not null default 'UTC',definition_version text not null default '1' check(definition_version='1'),
 population text not null check(population='consented_website_observations'),
 metric_id text not null check(metric_id in ('session_starts','page_views','section_views','cta_clicks','download_clicks','daily_anonymous_ids','active_ms','visible_ms','normalized_errors')),
 dimensions jsonb not null default '{}' check(public.wa_safe_dimensions(dimensions,array['pageId','pageVersion','sectionId','ctaId','acquisitionSource','campaign','deviceClass','osFamily','browserFamily','country','platform','releaseId','appVersion','channel','trafficClass'])),
 value numeric not null check(value>=0 and value<=9007199254740991),
 exactness text not null default 'exact' check(exactness in ('exact','estimate')),
 watermark timestamptz,updated_at timestamptz not null default now(),
 primary key(site_id,day,time_zone,definition_version,metric_id,dimensions)
);
comment on table public.wa_daily_rollups is 'Non-identifying additive metrics/daily distincts only. Never sum daily uniques into period uniques. Retention 13 months; capabilities gate unsupported raw windows.';

create table public.wa_data_health(
 site_id text not null check(site_id in ('radovar','codevalanche')),bucket_start timestamptz not null,
 source text not null check(source in ('browser','account_v2','provider_audit','release_provider','delivery','native_ledger','consent_registry','collector')),
 counter text not null check(counter in ('accepted','rejected_schema','rejected_consent','duplicate','rate_limited','bot_suspected','queue_expired','late_arrival','clock_adjusted')),
 count bigint not null default 0 check(count>=0),watermark timestamptz,
 primary key(site_id,bucket_start,source,counter)
);

-- Only a verified server-side operator session may supply p_actor_id. This SQL
-- guard rechecks current P3 membership; it does not authenticate a browser JWT.
-- Every future report RPC must call both guards before reading any aggregates.
create function public.wa_assert_report_actor(p_actor_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if p_actor_id is null or not exists(select 1 from public.codevalanche_admin_memberships m left join public.codevalanche_account_state a on a.user_id=m.user_id where m.user_id=p_actor_id and m.active and m.role in ('owner','accounts_admin','support_readonly') and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false)) then raise exception 'forbidden';end if;
end $$;
create function public.wa_assert_report_period(p_from timestamptz,p_to timestamptz,p_timezone text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from>=p_to or p_to-p_from>interval '400 days' or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'unsupported_query';end if;
end $$;

alter table public.wa_events enable row level security;
alter table public.wa_consent_receipts enable row level security;
alter table public.wa_sessions enable row level security;
alter table public.wa_source_snapshots enable row level security;
alter table public.wa_daily_rollups enable row level security;
alter table public.wa_data_health enable row level security;
revoke all on public.wa_events,public.wa_consent_receipts,public.wa_sessions,public.wa_source_snapshots,public.wa_daily_rollups,public.wa_data_health from public,anon,authenticated;
grant select,insert,update,delete on public.wa_events,public.wa_consent_receipts,public.wa_sessions,public.wa_source_snapshots,public.wa_daily_rollups,public.wa_data_health to service_role;
revoke all on function public.wa_valid_properties(text,jsonb),public.wa_safe_dimensions(jsonb,text[]),public.wa_assert_report_actor(uuid),public.wa_assert_report_period(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.wa_valid_properties(text,jsonb),public.wa_safe_dimensions(jsonb,text[]),public.wa_assert_report_actor(uuid),public.wa_assert_report_period(timestamptz,timestamptz,text) to service_role;
commit;
