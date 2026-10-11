begin;
alter table public.codevalanche_account_state add column consent_generation bigint not null default 1;
-- Anonymous/legacy opt-in never becomes account-attributed opt-in without new consent.
update public.codevalanche_account_state set analytics_consent=false;
create table public.codevalanche_analytics_v2(
 event_id uuid primary key,user_id uuid not null,event_name text not null check(event_name in ('app_opened','login_succeeded','provider_connected','first_success','run_finished','remote_connected','remote_reconnect')),
 platform text not null check(platform in ('web','windows','macos','linux','ios','android')),app_version text not null,installation_id uuid not null,
 occurred_at timestamptz not null,received_at timestamptz not null default now(),outcome text check(outcome in ('success','failed','cancelled')),source_quality text not null check(source_quality in ('unconfirmed','native_ledger','provider_session')),
 consent_generation bigint not null,run_id text,project_id text,receipt_id uuid
);
create index codevalanche_analytics_user_time on public.codevalanche_analytics_v2(user_id,occurred_at);
alter table public.codevalanche_analytics_v2 enable row level security;
revoke all on public.codevalanche_analytics_v2 from public,anon,authenticated;
grant select on public.codevalanche_analytics_v2 to service_role;
create function public.codevalanche_analytics_consent(p_user_id uuid,p_enabled boolean)
returns table(analytics_consent boolean,consent_generation bigint) language plpgsql security definer set search_path='' as $$
begin
 insert into public.codevalanche_account_state(user_id) values(p_user_id) on conflict do nothing;
 return query update public.codevalanche_account_state a set analytics_consent=p_enabled,consent_generation=a.consent_generation+1,updated_at=now() where a.user_id=p_user_id and a.status='active' and not a.blocked returning a.analytics_consent,a.consent_generation;
end $$;
create function public.codevalanche_accept_analytics(p_user_id uuid,p_event jsonb,p_consent_generation bigint)
returns table(accepted boolean) language plpgsql security definer set search_path='' as $$
declare v_policy public.codevalanche_account_state;v_old public.codevalanche_analytics_v2;
begin
 select * into v_policy from public.codevalanche_account_state a where a.user_id=p_user_id for update;
 if not found or not v_policy.analytics_consent or v_policy.consent_generation<>p_consent_generation or v_policy.status<>'active' or v_policy.blocked then return query select false;return;end if;
 select * into v_old from public.codevalanche_analytics_v2 where event_id=(p_event->>'eventId')::uuid;
 if found then
  if v_old.user_id<>p_user_id or v_old.event_name<>p_event->>'eventName' or v_old.installation_id<>(p_event->>'installationId')::uuid then raise exception 'invalid_fields';end if;
  return query select true;return;
 end if;
 insert into public.codevalanche_analytics_v2(event_id,user_id,event_name,platform,app_version,installation_id,occurred_at,outcome,source_quality,consent_generation,run_id,project_id,receipt_id)
 values((p_event->>'eventId')::uuid,p_user_id,p_event->>'eventName',p_event->>'platform',p_event->>'appVersion',(p_event->>'installationId')::uuid,(p_event->>'occurredAt')::timestamptz,p_event->>'outcome','unconfirmed',p_consent_generation,p_event->>'runId',p_event->>'projectId',(p_event->>'receiptId')::uuid);
 -- Client/native label alone is not a qualified ledger receipt or successful login.
 return query select true;
end $$;
create function public.codevalanche_analytics_summary(p_user_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text default 'UTC')
returns table(summary jsonb) language plpgsql stable security definer set search_path='' as $$
begin
 if p_from>=p_to or p_to-p_from>interval '366 days' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_fields';end if;
 return query select jsonb_build_object('userId',p_user_id,'analyticsConsent',coalesce((select a.analytics_consent from public.codevalanche_account_state a where a.user_id=p_user_id),false),'consentGeneration',coalesce((select a.consent_generation from public.codevalanche_account_state a where a.user_id=p_user_id),1),'from',p_from,'to',p_to,'timeZone',p_timezone,'eventCount',count(*),'activeDays',count(distinct (occurred_at at time zone p_timezone)::date),'successfulRuns',null,'failedRuns',null,'cancelledRuns',null,'unconfirmedEvents',count(*) filter(where source_quality='unconfirmed'),'lastMeaningfulActivity',max(occurred_at),'watermark',max(received_at),'populationCoverage',jsonb_build_object('scope','consented_account_activity','historicalAnonymousMerged',false),'sourceQuality',jsonb_build_object('nativeLedger','unqualified','providerUsage','unavailable','costs','unmeasured'))
 from public.codevalanche_analytics_v2 where user_id=p_user_id and occurred_at>=p_from and occurred_at<p_to;
end $$;
-- Final cleanup uses current qualified application tables; no filesystem or old Creator schema.
create function public.codevalanche_analytics_retention() returns bigint language plpgsql security definer set search_path='' as $$ declare v_count bigint;begin delete from public.codevalanche_analytics_v2 where occurred_at<now()-interval '90 days';get diagnostics v_count=row_count;return v_count;end $$;
revoke all on function public.codevalanche_analytics_consent(uuid,boolean),public.codevalanche_accept_analytics(uuid,jsonb,bigint),public.codevalanche_analytics_summary(uuid,timestamptz,timestamptz,text),public.codevalanche_analytics_retention() from public,anon,authenticated;
grant execute on function public.codevalanche_analytics_consent(uuid,boolean),public.codevalanche_accept_analytics(uuid,jsonb,bigint),public.codevalanche_analytics_summary(uuid,timestamptz,timestamptz,text),public.codevalanche_analytics_retention() to service_role;
commit;
