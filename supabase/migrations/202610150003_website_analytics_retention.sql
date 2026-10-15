begin;
create function public.wa_prune_website_analytics(p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_raw bigint;v_registry bigint;
begin
 if p_now is null or not isfinite(p_now) then raise exception 'invalid_fields';end if;
 perform pg_advisory_xact_lock(hashtextextended('wa_retention_rollups',0));
 perform public.wa_refresh_website_rollups(p_now);
 delete from public.wa_events where event_at<p_now-interval '90 days';get diagnostics v_raw=row_count;
 delete from public.wa_sessions where last_event_at<p_now-interval '90 days';
 update public.wa_report_state set retained_from=greatest(retained_from,p_now-interval '90 days');
 -- Receipt expiry is180d at most, separate from raw90d. Remove revoked or
 -- expired registry rows once references have expired; bindings cascade.
 delete from public.wa_consent_receipts r where (r.expires_at<=p_now or r.revoked_at is not null) and not exists(select 1 from public.wa_events e where e.consent_receipt_id=r.receipt_id) and not exists(select 1 from public.wa_sessions s where s.consent_receipt_id=r.receipt_id);get diagnostics v_registry=row_count;
 delete from public.wa_daily_rollups where day<(p_now at time zone time_zone)::date-interval '13 months';
 delete from public.wa_data_health where bucket_start<p_now-interval '13 months';
 delete from public.wa_rate_limits where expires_at<=p_now;
 -- Later migration sources retain their own independent policy. Never build
 -- append-only terminal-profile rollups: a successful retry mutates history.
 if to_regprocedure('public.wa_profile_retention(timestamp with time zone)') is not null then execute 'select public.wa_profile_retention($1)' using p_now;end if;
 if to_regprocedure('public.wa_prune_download_evidence(timestamp with time zone)') is not null then execute 'select public.wa_prune_download_evidence($1)' using p_now;end if;
 return jsonb_build_object('rawDeleted',v_raw,'receiptsDeleted',v_registry,'rawRetentionDays',90,'rollupRetentionMonths',13);
end $$;
-- Authoritative absence is idempotent revocation. No access capability is
-- granted by this ACK, and a DB failure cannot take this successful branch.
create or replace function public.wa_revoke_consent_receipt(p_receipt_id uuid,p_generation bigint,p_revocation_hash text,p_site_id text)
returns table(revoked boolean,generation bigint) language plpgsql security definer set search_path='' as $$
declare v_receipt public.wa_consent_receipts;
begin
 if p_site_id is null or p_site_id not in ('radovar','codevalanche') or p_generation is null or p_generation<0 or p_generation>=9007199254740991 or p_revocation_hash is null or p_revocation_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_consent';end if;
 select * into v_receipt from public.wa_consent_receipts where receipt_id=p_receipt_id for update;
 if not found then return query select true,p_generation+1;return;end if;
 if v_receipt.site_id is distinct from p_site_id or v_receipt.generation is distinct from p_generation or v_receipt.revocation_proof_hash is distinct from p_revocation_hash then raise exception 'invalid_consent';end if;
 update public.wa_consent_receipts set revoked_at=coalesce(revoked_at,clock_timestamp()) where receipt_id=p_receipt_id;
 return query select true,v_receipt.generation+1;
end $$;
revoke all on function public.wa_prune_website_analytics(timestamptz),public.wa_revoke_consent_receipt(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.wa_prune_website_analytics(timestamptz),public.wa_revoke_consent_receipt(uuid,bigint,text,text) to service_role;
commit;
