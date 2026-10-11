begin;

-- Read-only, bounded calendar buckets. Accepted025 provenance is never minted or
-- inferred from current project metadata. Client observations remain coarse.
create function public.codevalanche_user_activity_readout(p_user_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text default 'UTC')
returns table(summary jsonb) language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_daily jsonb;v_first date;v_last date;v_qualified boolean;
begin
 if p_user_id is null or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from>=p_to or p_to-p_from>interval '366 days' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_fields';end if;
 select s.summary into v_base from public.codevalanche_analytics_summary(p_user_id,p_from,p_to,p_timezone) s;
 if v_base->>'analyticsConsent' is distinct from 'true' then
  return query select v_base||jsonb_build_object('daily','[]'::jsonb,'eventCount',null,'unconfirmedEvents',null,'activeDays',null,'successfulRuns',null,'failedRuns',null,'cancelledRuns',null,'nativeReceiptCount',null,'unconfirmedNativeReceiptCount',null,'lastMeaningfulActivity',null,'watermark',null,'nativeReceiptWatermark',null);return;
 end if;
 v_first:=(p_from at time zone p_timezone)::date;v_last:=((p_to-interval '1 microsecond') at time zone p_timezone)::date;
 if v_last-v_first not between 0 and 367 then raise exception 'invalid_fields';end if;
 v_qualified:=v_base->'sourceQuality'->>'nativeLedger' in ('qualified','qualified_source_no_owned_receipts');
 with days as (select d::date as day from generate_series(v_first::timestamp,v_last::timestamp,interval '1 day') d),
 app as (select (e.occurred_at at time zone p_timezone)::date as day,count(*) as events,count(*) filter(where e.event_name='app_opened') as opened from public.codevalanche_analytics_v2 e where e.user_id=p_user_id and e.occurred_at>=p_from and e.occurred_at<p_to group by 1),
 native as (select (r.occurred_at at time zone p_timezone)::date as day,count(*) as receipts,count(*) filter(where r.outcome='success') as completed,count(*) filter(where r.outcome='failed') as failed,count(*) filter(where r.outcome='cancelled') as cancelled from public.codevalanche_acceptance_owned_native_receipts r where r.user_id=p_user_id and r.occurred_at>=p_from and r.occurred_at<p_to group by 1)
 select jsonb_agg(jsonb_build_object('day',d.day::text,'activeUsers',case when coalesce(a.events,0)+coalesce(n.receipts,0)>0 then 1 else 0 end,'eventCount',coalesce(a.events,0),'appOpened',coalesce(a.opened,0),'completed',case when v_qualified then coalesce(n.completed,0) else null end,'failed',case when v_qualified then coalesce(n.failed,0) else null end,'cancelled',case when v_qualified then coalesce(n.cancelled,0) else null end) order by d.day) into v_daily from days d left join app a using(day) left join native n using(day);
 return query select v_base||jsonb_build_object('daily',coalesce(v_daily,'[]'::jsonb),'populationCoverage',(v_base->'populationCoverage')||jsonb_build_object('dailyActivity','consented_observations_and_acceptance_owned_receipts','appOpened','coarse_client_observation'));
end $$;

-- One bounded batch avoids per-directory-user reads. Absence/withdrawal of
-- consent does not turn a retained observation into a measured zero.
create function public.codevalanche_user_activity_latest(p_user_ids uuid[])
returns table(activity jsonb) language plpgsql stable security definer set search_path='' as $$
begin
 if p_user_ids is null or cardinality(p_user_ids) not between 1 and 100 or array_position(p_user_ids,null) is not null then raise exception 'invalid_fields';end if;
 return query
 select jsonb_build_object('userId',u.id,'consent',coalesce(a.analytics_consent,false),'lastMeaningfulActivity',case when a.analytics_consent then to_char(o.observed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') else null end,'watermark',case when a.analytics_consent then to_char(o.watermark at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') else null end,'sourceQuality',jsonb_build_object('activity',case when a.analytics_consent then 'consented_observation' else 'unavailable' end),'populationCoverage',jsonb_build_object('scope','retained_consented_observations','nativeOutcomes','acceptance_proven_owned_receipts','allNativeRunsCovered',false))
 from auth.users u left join public.codevalanche_account_state a on a.user_id=u.id
 left join lateral (select max(t.occurred_at) as observed,max(t.received_at) as watermark from (
  select e.occurred_at,e.received_at from public.codevalanche_analytics_v2 e where e.user_id=u.id and a.analytics_consent
  union all select r.occurred_at,r.received_at from public.codevalanche_acceptance_owned_native_receipts r where r.user_id=u.id and a.analytics_consent
 ) t) o on true where u.id=any(p_user_ids);
end $$;
revoke all on function public.codevalanche_user_activity_readout(uuid,timestamptz,timestamptz,text),public.codevalanche_user_activity_latest(uuid[]) from public,anon,authenticated;
grant execute on function public.codevalanche_user_activity_readout(uuid,timestamptz,timestamptz,text),public.codevalanche_user_activity_latest(uuid[]) to service_role;
commit;
