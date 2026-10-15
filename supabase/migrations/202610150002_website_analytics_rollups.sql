begin;
-- No dependency on later004/005 objects at definition time.
create table public.wa_report_state(site_id text not null check(site_id in ('radovar','codevalanche')),event_source text not null check(event_source in ('W','A')),observed_from timestamptz,watermark timestamptz,retained_from timestamptz,primary key(site_id,event_source));
alter table public.wa_report_state enable row level security;
revoke all on public.wa_report_state from public,anon,authenticated;
grant select,insert,update,delete on public.wa_report_state to service_role;
create table public.wa_rollup_coverage(site_id text not null,time_zone text not null,observed_from timestamptz not null,observed_to timestamptz not null,watermark timestamptz,primary key(site_id,time_zone));
alter table public.wa_rollup_coverage enable row level security;
revoke all on public.wa_rollup_coverage from public,anon,authenticated;
grant select,insert,update,delete on public.wa_rollup_coverage to service_role;
create function public.wa_observe_report_source() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.wa_report_state(site_id,event_source,observed_from,watermark) values(new.site_id,new.event_source,new.event_at,new.received_at)
 on conflict(site_id,event_source) do update set observed_from=least(public.wa_report_state.observed_from,excluded.observed_from),watermark=greatest(public.wa_report_state.watermark,excluded.watermark);return new;
end $$;
create trigger wa_observe_report_source after insert on public.wa_events for each row execute function public.wa_observe_report_source();
insert into public.wa_report_state(site_id,event_source,observed_from,watermark) select site_id,event_source,min(event_at),max(received_at) from public.wa_events group by site_id,event_source;

create function public.wa_refresh_website_rollups(p_now timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$
declare v_zone text;v_floor timestamptz;
begin
 if p_now is null or not isfinite(p_now) then raise exception 'invalid_fields';end if;
 perform pg_advisory_xact_lock(hashtextextended('wa_retention_rollups',0));
 select min(retained_from) into v_floor from public.wa_report_state where event_source='W';
 foreach v_zone in array array['UTC','Europe/Bucharest'] loop
 -- Once a boundary day has lost raw rows, it is sealed. Never overwrite it
 -- with a smaller, incomplete set on the next job. Late data is <=24h old.
 delete from public.wa_daily_rollups where time_zone=v_zone and (v_floor is null or day>(v_floor at time zone v_zone)::date);
 insert into public.wa_daily_rollups(site_id,day,time_zone,definition_version,population,metric_id,dimensions,value,exactness,watermark)
 with starts as (
 select distinct on(site_id,session_id) site_id,session_id,context from public.wa_events where event_source='W' and event_name='session_started'
 order by site_id,session_id,case when properties->>'attribution_kind' in ('campaign','referrer') then 0 else 1 end,event_at,event_id
 ), source as (
 select e.*,jsonb_build_object('pageId',e.page_id,'pageVersion',e.page_version,'sectionId',coalesce(e.properties->>'section_id','unknown'),'ctaId',coalesce(e.properties->>'cta_id','unknown'),'acquisitionSource',coalesce(s.context->>'acquisition_source','unknown'),'campaign',coalesce(s.context->>'campaign','unknown'),'deviceClass',coalesce(e.context->>'device_class','unknown'),'osFamily',coalesce(e.context->>'os_family','unknown'),'browserFamily',coalesce(e.context->>'browser_family','unknown'),'platform',coalesce(e.properties->>'platform','unknown'),'releaseId',coalesce(e.properties->>'release_id','unknown'),'trafficClass',e.traffic_class) dims
 from public.wa_events e left join starts s using(site_id,session_id) where e.event_source='W'
 ), pageviews as (
 select distinct on(site_id,page_instance_id) * from source where event_name='page_viewed' order by site_id,page_instance_id,event_at,event_id
 ), revisions as (
 select distinct on(site_id,page_instance_id,(properties->>'revision')::bigint) * from source where event_name='page_engagement_reported' order by site_id,page_instance_id,(properties->>'revision')::bigint,event_at desc,event_id desc
 ), deltas as (
 select *,greatest(0,(properties->>'active_ms_total')::numeric-coalesce(lag((properties->>'active_ms_total')::numeric) over(partition by site_id,page_instance_id order by (properties->>'revision')::bigint),0)) active_delta,
 greatest(0,(properties->>'visible_ms_total')::numeric-coalesce(lag((properties->>'visible_ms_total')::numeric) over(partition by site_id,page_instance_id order by (properties->>'revision')::bigint),0)) visible_delta from revisions
 ), observations as (
 select site_id,event_at,received_at,dims,'page_views' metric,1::numeric val,'exact' exactness from pageviews
 union all select site_id,event_at,received_at,dims,'active_ms',active_delta,'estimate' from deltas
 union all select site_id,event_at,received_at,dims,'visible_ms',visible_delta,'estimate' from deltas
 union all select site_id,event_at,received_at,dims,case event_name when 'cta_clicked' then 'cta_clicks' when 'download_clicked' then 'download_clicks' else 'normalized_errors' end,1,'exact' from source where event_name in ('cta_clicked','download_clicked','javascript_error_observed','resource_load_failed','interaction_failed')
 )
 select site_id,(event_at at time zone v_zone)::date,v_zone,'1','consented_website_observations',metric,dims,sum(val),exactness,max(received_at) from observations
 where v_floor is null or (event_at at time zone v_zone)::date>(v_floor at time zone v_zone)::date group by site_id,(event_at at time zone v_zone)::date,metric,dims,exactness;
 insert into public.wa_daily_rollups(site_id,day,time_zone,population,metric_id,dimensions,value,watermark)
 select site_id,(event_at at time zone v_zone)::date,v_zone,'consented_website_observations','session_starts','{}',count(distinct session_id),max(received_at) from public.wa_events
 where event_source='W' and event_name='session_started' and traffic_class not in ('internal','test','suspected_bot') and (v_floor is null or (event_at at time zone v_zone)::date>(v_floor at time zone v_zone)::date)
 group by site_id,(event_at at time zone v_zone)::date;
 -- Daily distinct is stored only unsegmented: summing dimensional distincts
 -- or days must never masquerade as selected-period unique browsers.
 insert into public.wa_daily_rollups(site_id,day,time_zone,population,metric_id,dimensions,value,watermark)
 select site_id,(event_at at time zone v_zone)::date,v_zone,'consented_website_observations','daily_anonymous_ids','{}',count(distinct anonymous_id),max(received_at) from public.wa_events
 where event_source='W' and traffic_class not in ('internal','test','suspected_bot') and (v_floor is null or (event_at at time zone v_zone)::date>(v_floor at time zone v_zone)::date)
 group by site_id,(event_at at time zone v_zone)::date;
 insert into public.wa_rollup_coverage(site_id,time_zone,observed_from,observed_to,watermark)
 select site_id,v_zone,date_trunc('day',min(event_at) at time zone v_zone) at time zone v_zone,date_trunc('day',p_now at time zone v_zone) at time zone v_zone,max(received_at) from public.wa_events where event_source='W' group by site_id
 on conflict(site_id,time_zone) do update set observed_from=least(public.wa_rollup_coverage.observed_from,excluded.observed_from),observed_to=greatest(public.wa_rollup_coverage.observed_to,excluded.observed_to),watermark=greatest(public.wa_rollup_coverage.watermark,excluded.watermark);
 end loop;
end $$;

create function public.wa_read_website_evidence(p_actor_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text,p_site_id text,p_source text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;v_download jsonb:='[]';v_daily jsonb:='[]';v_snapshots jsonb:='[]';v_download_configured boolean:=false;
begin
 perform public.wa_assert_report_actor(p_actor_id);perform public.wa_assert_report_period(p_from,p_to,p_timezone);
 if p_site_id not in ('radovar','codevalanche','all') or p_source not in ('W','A') then raise exception 'unsupported_query';end if;
 -- One aggregate JSON value, no PostgREST row cap or offset truncation. IDs
 -- stay inside the service boundary; report DTOs contain aggregates only.
 select jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(e) order by event_at,event_id) from public.wa_events e where (p_site_id='all' or site_id=p_site_id) and event_source=p_source and event_at>=now()-interval '90 days' and event_at<p_to),'[]'::jsonb),
 'rollups',coalesce((select jsonb_agg(to_jsonb(r)) from public.wa_daily_rollups r where (p_site_id='all' or site_id=p_site_id) and time_zone=p_timezone and day>=(p_from at time zone p_timezone)::date and day<(p_to at time zone p_timezone)::date),'[]'::jsonb),
 'health',coalesce((select jsonb_agg(to_jsonb(h)) from public.wa_data_health h where (p_site_id='all' or site_id=p_site_id) and bucket_start>=p_from and bucket_start<p_to),'[]'::jsonb),
 'observedFrom',(select min(observed_from) from public.wa_report_state where (p_site_id='all' or site_id=p_site_id) and event_source=p_source),
 'watermark',(select max(watermark) from public.wa_report_state where (p_site_id='all' or site_id=p_site_id) and event_source=p_source),
 'rollupReady',coalesce((select bool_and(coalesce(c.observed_from<=p_from and c.observed_to>=p_to,false)) from public.wa_report_state s left join public.wa_rollup_coverage c on c.site_id=s.site_id and c.time_zone=p_timezone where s.event_source='W' and (p_site_id='all' or s.site_id=p_site_id)),false),
 'rawWindowStart',greatest(now()-interval '90 days',(select max(retained_from) from public.wa_report_state where event_source=p_source and (p_site_id='all' or site_id=p_site_id))),'rollupWindowStart',now()-interval '13 months') into v_result;
 -- Runtime deferred dependencies preserve fresh filename order001002003004005.
 if to_regclass('public.wa_download_requests') is not null then
 execute 'select coalesce(jsonb_agg(to_jsonb(d)),''[]''::jsonb) from public.wa_download_requests d where ($1=''all'' or site_id=$1) and observed_at >= $2 and observed_at < $3' into v_download using p_site_id,p_from,p_to;
 execute 'select coalesce(jsonb_agg(to_jsonb(d)),''[]''::jsonb) from public.wa_download_daily d where ($1=''all'' or site_id=$1) and day >= ($2 at time zone ''UTC'')::date and day < ($3 at time zone ''UTC'')::date' into v_daily using p_site_id,p_from,p_to;
 execute 'select exists(select 1 from public.wa_download_daily where $1=''all'' or site_id=$1)' into v_download_configured using p_site_id;
 execute 'select coalesce(jsonb_agg(to_jsonb(d)),''[]''::jsonb) from (select s.*,lag(observed_at) over(partition by site_id,artifact_id order by observed_at) previous_observed_at from public.wa_source_snapshots s where $1=''all'' or site_id=$1) d where observed_at >= $2 and observed_at < $3' into v_snapshots using p_site_id,p_from,p_to;
 end if;
 return v_result||jsonb_build_object('downloads',v_download,'downloadDaily',v_daily,'downloadConfigured',v_download_configured,'snapshots',v_snapshots);
end $$;
revoke all on function public.wa_observe_report_source(),public.wa_refresh_website_rollups(timestamptz),public.wa_read_website_evidence(uuid,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_refresh_website_rollups(timestamptz),public.wa_read_website_evidence(uuid,timestamptz,timestamptz,text,text,text) to service_role;
commit;
