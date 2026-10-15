begin;
-- D is operational evidence, independent of consented W/A and account identity.
create table public.wa_download_requests(
 request_id uuid primary key,event_name text not null check(event_name in ('download_redirected','download_request_failed')),
 site_id text not null check(site_id in ('codevalanche','radovar')),
 platform text not null check(platform in ('windows','mac-arm','mac-intel','linux')),
 architecture text not null check(architecture in ('x64','arm64','x86','universal','unknown')),
 release_id text not null check(release_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 artifact_id text not null check(artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),observed_at timestamptz not null,
 response_class text generated always as (case when event_name='download_redirected' then '3xx' else '4xx' end) stored,
 normalized_error text generated always as (case when event_name='download_request_failed' then 'unavailable' else null end) stored
);
create index wa_download_requests_retention on public.wa_download_requests(observed_at);
comment on table public.wa_download_requests is 'Operational gateway requests, not people, completed transfers or installations. No W/A IDs or raw network/target data. Raw retention 90 days; UUID idempotence within retained window.';
create table public.wa_download_daily(
 site_id text not null check(site_id in ('codevalanche','radovar')),day date not null,
 platform text not null check(platform in ('windows','mac-arm','mac-intel','linux')),
 architecture text not null check(architecture in ('x64','arm64','x86','universal','unknown')),
 release_id text not null check(release_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 artifact_id text not null check(artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
 event_name text not null check(event_name in ('download_redirected','download_request_failed')),
 count bigint not null check(count>=0),watermark timestamptz not null,
 primary key(site_id,day,platform,architecture,release_id,artifact_id,event_name)
);
comment on table public.wa_download_daily is 'Non-identifying UTC daily operational request counts, 13 months. Includes direct requests/retries; excludes HEAD. Never infer completion/unique people. Browser W filters cannot be applied to D.';
alter table public.wa_download_requests enable row level security;
alter table public.wa_download_daily enable row level security;
revoke all on public.wa_download_requests,public.wa_download_daily from public,anon,authenticated;
grant select,insert,update,delete on public.wa_download_requests,public.wa_download_daily to service_role;

create function public.wa_record_download_request(p_request_id uuid,p_event_name text,p_site_id text,p_platform text,p_architecture text,p_release_id text,p_artifact_id text,p_observed_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_old public.wa_download_requests;v_inserted uuid;
begin
 insert into public.wa_download_requests(request_id,event_name,site_id,platform,architecture,release_id,artifact_id,observed_at) values(p_request_id,p_event_name,p_site_id,p_platform,p_architecture,p_release_id,p_artifact_id,p_observed_at)
 on conflict(request_id) do nothing returning request_id into v_inserted;
 if v_inserted is null then
  select * into v_old from public.wa_download_requests where request_id=p_request_id;
  if row(v_old.event_name,v_old.site_id,v_old.platform,v_old.architecture,v_old.release_id,v_old.artifact_id,v_old.observed_at) is distinct from row(p_event_name,p_site_id,p_platform,p_architecture,p_release_id,p_artifact_id,p_observed_at) then raise exception 'invalid_fields';end if;
  return false;
 end if;
 insert into public.wa_download_daily values(p_site_id,(p_observed_at at time zone 'UTC')::date,p_platform,p_architecture,p_release_id,p_artifact_id,p_event_name,1,p_observed_at)
 on conflict(site_id,day,platform,architecture,release_id,artifact_id,event_name) do update
 set count=public.wa_download_daily.count+1,watermark=greatest(public.wa_download_daily.watermark,excluded.watermark);
 return true;
end;$$;

-- Reuse001's source store, preserving all historical migration hashes.
alter table public.wa_source_snapshots add column count_delta bigint check(count_delta>=0),add column asset_removed boolean not null default false,
 add column source_watermark_high_water timestamptz check(source_watermark_high_water is null or (isfinite(source_watermark_high_water) and source_watermark_high_water<=observed_at and (source_watermark is null or source_watermark_high_water>=source_watermark)));
-- Preserve any existing001 provider ordering history. Carry the boundary on each
-- row so pruning an older known observation cannot erase it while newer unknown
-- observations remain. It is validation state, never the row's source freshness.
with boundaries as (
 select snapshot_id,max(source_watermark) over(partition by site_id,source,artifact_id order by observed_at rows between unbounded preceding and current row) high_water
 from public.wa_source_snapshots
)
update public.wa_source_snapshots s set source_watermark_high_water=b.high_water from boundaries b where s.snapshot_id=b.snapshot_id;
create index wa_source_snapshots_reconciliation on public.wa_source_snapshots(site_id,source,release_id,artifact_id,observed_at desc);
comment on table public.wa_source_snapshots is 'Non-identifying provider counters; 13 months. First sample/reset/removal have null delta. Nullable source_watermark remains unknown freshness even with a carried source_watermark_high_water ordering boundary. Count deltas describe observations, not provider freshness or complete files.';
comment on column public.wa_source_snapshots.source_watermark_high_water is 'Last known non-null provider watermark for site/provider/artifact as of this observation. Carried through null observations and retention; never substitute for null source_watermark. Expires when all observations for that artifact expire.';
create function public.wa_import_release_asset_snapshot(p_site_id text,p_release_id text,p_artifact_id text,p_count_total bigint,p_observed_at timestamptz,p_source_watermark timestamptz,p_asset_removed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_previous public.wa_source_snapshots;v_duplicate public.wa_source_snapshots;v_status text;v_delta bigint;v_high_water timestamptz;
begin
 if p_site_id is null or p_site_id not in ('radovar','codevalanche') or p_release_id is null or p_release_id !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' or p_artifact_id is null or p_artifact_id !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' or p_count_total is null or p_count_total<0 or p_count_total>9007199254740991 or p_observed_at is null or not isfinite(p_observed_at) or p_asset_removed is null or p_source_watermark>p_observed_at or (p_source_watermark is not null and not isfinite(p_source_watermark)) then raise exception 'invalid_fields';end if;
 -- Artifact identity in001's unique key is provider/site scoped. Release change
 -- starts a new baseline; serialize across release changes for that asset.
 perform pg_advisory_xact_lock(hashtextextended(p_site_id||':release_provider:'||p_artifact_id,0));
 select * into v_duplicate from public.wa_source_snapshots where site_id=p_site_id and source='release_provider' and artifact_id=p_artifact_id and observed_at=p_observed_at;
 if found then
  if row(v_duplicate.release_id,v_duplicate.count_total,v_duplicate.source_watermark,v_duplicate.asset_removed) is distinct from row(p_release_id,p_count_total,p_source_watermark,p_asset_removed) then raise exception 'invalid_fields';end if;
  return jsonb_build_object('counterStatus',v_duplicate.counter_status,'countDelta',v_duplicate.count_delta,'duplicate',true,'sourceWatermark',v_duplicate.source_watermark,'sourceWatermarkHighWater',v_duplicate.source_watermark_high_water,'sourceFreshness',case when v_duplicate.source_watermark is null then 'unknown' else 'known' end);
 end if;
 select * into v_previous from public.wa_source_snapshots where site_id=p_site_id and source='release_provider' and artifact_id=p_artifact_id order by observed_at desc limit 1;
 if found and (p_observed_at<v_previous.observed_at or (p_source_watermark is not null and v_previous.source_watermark_high_water is not null and p_source_watermark<v_previous.source_watermark_high_water)) then raise exception 'invalid_fields';end if;
 v_high_water:=greatest(v_previous.source_watermark_high_water,p_source_watermark);
 if p_asset_removed then v_status:='asset_removed';
 elsif v_previous.snapshot_id is null or v_previous.release_id<>p_release_id or v_previous.asset_removed then v_status:='baseline';
 elsif p_count_total<v_previous.count_total then v_status:='reset';
 else v_status:='measured';v_delta:=p_count_total-v_previous.count_total;end if;
 insert into public.wa_source_snapshots(site_id,source,artifact_id,release_id,count_total,observed_at,source_watermark,counter_status,count_delta,asset_removed,source_watermark_high_water)
 values(p_site_id,'release_provider',p_artifact_id,p_release_id,p_count_total,p_observed_at,p_source_watermark,v_status,v_delta,p_asset_removed,v_high_water);
 return jsonb_build_object('counterStatus',v_status,'countDelta',v_delta,'duplicate',false,'sourceWatermark',p_source_watermark,'sourceWatermarkHighWater',v_high_water,'sourceFreshness',case when p_source_watermark is null then 'unknown' else 'known' end);
end;$$;
create function public.wa_prune_download_evidence(p_now timestamptz default now())
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_now is null or not isfinite(p_now) then raise exception 'invalid_fields';end if;
 delete from public.wa_download_requests where observed_at<p_now-interval '90 days';
 delete from public.wa_download_daily where day<((p_now at time zone 'UTC')-interval '13 months')::date;
 delete from public.wa_source_snapshots where observed_at<p_now-interval '13 months';
end;$$;
revoke all on function public.wa_record_download_request(uuid,text,text,text,text,text,text,timestamptz),public.wa_import_release_asset_snapshot(text,text,text,bigint,timestamptz,timestamptz,boolean),public.wa_prune_download_evidence(timestamptz) from public,anon,authenticated;
grant execute on function public.wa_record_download_request(uuid,text,text,text,text,text,text,timestamptz),public.wa_import_release_asset_snapshot(text,text,text,bigint,timestamptz,timestamptz,boolean),public.wa_prune_download_evidence(timestamptz) to service_role;
commit;
