begin;
-- The owner activates only a reviewed native attestation producer; no client/admin RPC provisions one.
create table public.codevalanche_native_ledger_producers(
 issuer text not null,subject text not null,key_fingerprint text not null check(key_fingerprint ~ '^[a-f0-9]{64}$'),
 native_generation bigint not null default 1 check(native_generation>0),qualified boolean not null default false,
 primary key(issuer,subject,key_fingerprint)
);
create table public.codevalanche_native_ledger_receipts(
 receipt_id uuid primary key,user_id uuid not null references public.codevalanche_account_state(user_id) on delete cascade,
 session_id uuid not null,run_id text not null check(run_id ~ '^[a-zA-Z0-9_-]{1,128}$'),project_id text not null check(project_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
 outcome text not null check(outcome in ('success','failed','cancelled')),occurred_at timestamptz not null,received_at timestamptz not null default clock_timestamp(),
 consent_generation bigint not null,native_generation bigint not null,policy_version bigint not null,
 issuer text not null,subject text not null,key_fingerprint text not null,binding jsonb not null,
 unique(user_id,project_id,run_id)
);
create index codevalanche_native_ledger_user_time on public.codevalanche_native_ledger_receipts(user_id,occurred_at);
alter table public.codevalanche_native_ledger_producers enable row level security;
alter table public.codevalanche_native_ledger_receipts enable row level security;
revoke all on public.codevalanche_native_ledger_producers,public.codevalanche_native_ledger_receipts from public,anon,authenticated,service_role;
create role codevalanche_native_ledger_ingest_worker nologin;
grant usage on schema public to codevalanche_native_ledger_ingest_worker;
grant codevalanche_native_ledger_ingest_worker to authenticator;
grant execute on function public.codevalanche_worker_capability() to codevalanche_native_ledger_ingest_worker;
create function public.codevalanche_ingest_native_ledger(p_receipt jsonb,p_issuer text,p_subject text,p_key_fingerprint text,p_expires_at timestamptz)
returns table(accepted boolean,duplicate boolean,receipt_id uuid) language plpgsql security definer set search_path='' as $$
declare v_policy public.codevalanche_account_state;v_old public.codevalanche_native_ledger_receipts;v_uid uuid;v_sid uuid;v_created timestamptz;v_keys text;
begin
 if jsonb_typeof(p_receipt) is distinct from 'object' then raise exception 'invalid_fields';end if;
 select string_agg(k,',' order by k) into v_keys from jsonb_object_keys(p_receipt) k;
 if v_keys is distinct from 'consentGeneration,nativeGeneration,occurredAt,outcome,policyVersion,projectId,receiptId,runId,sessionId,userId'
 or p_receipt->>'outcome' not in ('success','failed','cancelled') or p_receipt->>'runId' !~ '^[a-zA-Z0-9_-]{1,128}$' or p_receipt->>'projectId' !~ '^[a-zA-Z0-9_-]{1,128}$'
 or (p_receipt->>'consentGeneration')::bigint<1 or (p_receipt->>'nativeGeneration')::bigint<1 or (p_receipt->>'policyVersion')::bigint<1 then raise exception 'invalid_fields';end if;
 perform 1 from public.codevalanche_native_ledger_producers p where p.issuer=p_issuer and p.subject=p_subject and p.key_fingerprint=p_key_fingerprint and p.qualified and p.native_generation=(p_receipt->>'nativeGeneration')::bigint for share;
 if not found then return query select false,false,null::uuid;return;end if;
 v_uid:=(p_receipt->>'userId')::uuid;v_sid:=(p_receipt->>'sessionId')::uuid;
 select * into v_policy from public.codevalanche_account_state a where a.user_id=v_uid for update;
 if not found or not v_policy.analytics_consent or v_policy.consent_generation<>(p_receipt->>'consentGeneration')::bigint or v_policy.policy_version<>(p_receipt->>'policyVersion')::bigint or v_policy.status<>'active' or v_policy.blocked then return query select false,false,null::uuid;return;end if;
 perform 1 from auth.users u where u.id=v_uid and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share;
 if not found then return query select false,false,null::uuid;return;end if;
 select s.created_at into v_created from auth.sessions s where s.id=v_sid and s.user_id=v_uid and (s.not_after is null or s.not_after>clock_timestamp()) for share;
 if not found or exists(select 1 from public.codevalanche_revoked_sessions r where r.user_id=v_uid and r.session_id=v_sid) then return query select false,false,null::uuid;return;end if;
 if (p_receipt->>'occurredAt')::timestamptz<v_created or (p_receipt->>'occurredAt')::timestamptz<clock_timestamp()-interval '1 day' or (p_receipt->>'occurredAt')::timestamptz>clock_timestamp()+interval '5 minutes' or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '61 seconds' then return query select false,false,null::uuid;return;end if;
 select * into v_old from public.codevalanche_native_ledger_receipts r where r.receipt_id=(p_receipt->>'receiptId')::uuid;
 if found then
  if v_old.binding is distinct from p_receipt or v_old.issuer is distinct from p_issuer or v_old.subject is distinct from p_subject or v_old.key_fingerprint is distinct from p_key_fingerprint then raise exception 'native_receipt_conflict';end if;
  return query select true,true,v_old.receipt_id;return;
 end if;
 if exists(select 1 from public.codevalanche_native_ledger_receipts r where r.user_id=v_uid and r.project_id=p_receipt->>'projectId' and r.run_id=p_receipt->>'runId') then raise exception 'native_receipt_conflict';end if;
 if p_expires_at<=clock_timestamp() then return query select false,false,null::uuid;return;end if;
 insert into public.codevalanche_native_ledger_receipts(receipt_id,user_id,session_id,run_id,project_id,outcome,occurred_at,consent_generation,native_generation,policy_version,issuer,subject,key_fingerprint,binding)
 values((p_receipt->>'receiptId')::uuid,v_uid,v_sid,p_receipt->>'runId',p_receipt->>'projectId',p_receipt->>'outcome',(p_receipt->>'occurredAt')::timestamptz,(p_receipt->>'consentGeneration')::bigint,(p_receipt->>'nativeGeneration')::bigint,(p_receipt->>'policyVersion')::bigint,p_issuer,p_subject,p_key_fingerprint,p_receipt);
 return query select true,false,(p_receipt->>'receiptId')::uuid;
end $$;
revoke all on function public.codevalanche_ingest_native_ledger(jsonb,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.codevalanche_ingest_native_ledger(jsonb,text,text,text,timestamptz) to codevalanche_native_ledger_ingest_worker;
-- Preserve existing unconfirmed activity calculations and add a separate verified population.
alter function public.codevalanche_analytics_summary(uuid,timestamptz,timestamptz,text) rename to codevalanche_unconfirmed_analytics_summary;
revoke all on function public.codevalanche_unconfirmed_analytics_summary(uuid,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
create function public.codevalanche_analytics_summary(p_user_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text default 'UTC')
returns table(summary jsonb) language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_qualified boolean;v_counts jsonb;v_days bigint;v_last timestamptz;v_watermark timestamptz;
begin
 select s.summary into v_base from public.codevalanche_unconfirmed_analytics_summary(p_user_id,p_from,p_to,p_timezone) s;
 select exists(select 1 from public.codevalanche_native_ledger_producers p where p.qualified) into v_qualified;
 select jsonb_build_object('successfulRuns',case when v_qualified then count(*) filter(where r.outcome='success') else null end,'failedRuns',case when v_qualified then count(*) filter(where r.outcome='failed') else null end,'cancelledRuns',case when v_qualified then count(*) filter(where r.outcome='cancelled') else null end,'nativeReceiptCount',count(*),'nativeReceiptWatermark',max(r.received_at)) into v_counts
 from public.codevalanche_native_ledger_receipts r where r.user_id=p_user_id and r.occurred_at>=p_from and r.occurred_at<p_to;
 select count(distinct (a.occurred_at at time zone p_timezone)::date),max(a.occurred_at),max(a.received_at) into v_days,v_last,v_watermark from (
  select e.occurred_at,e.received_at from public.codevalanche_analytics_v2 e where e.user_id=p_user_id and e.occurred_at>=p_from and e.occurred_at<p_to
  union all select r.occurred_at,r.received_at from public.codevalanche_native_ledger_receipts r where r.user_id=p_user_id and r.occurred_at>=p_from and r.occurred_at<p_to
 ) a;
 return query select v_base || v_counts || jsonb_build_object('activeDays',v_days,'lastMeaningfulActivity',v_last,'watermark',v_watermark,'sourceQuality',(v_base->'sourceQuality')||jsonb_build_object('nativeLedger',case when v_qualified then 'qualified' else 'unqualified' end),'populationCoverage',(v_base->'populationCoverage')||jsonb_build_object('nativeOutcomes','consented_verified_receipts','allNativeRunsCovered',false));
end $$;
revoke all on function public.codevalanche_analytics_summary(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.codevalanche_analytics_summary(uuid,timestamptz,timestamptz,text) to service_role;
create or replace function public.codevalanche_analytics_retention() returns bigint language plpgsql security definer set search_path='' as $$
declare v_events bigint;v_receipts bigint;
begin delete from public.codevalanche_analytics_v2 where occurred_at<now()-interval '90 days';get diagnostics v_events=row_count;
 delete from public.codevalanche_native_ledger_receipts where occurred_at<now()-interval '90 days';get diagnostics v_receipts=row_count;return v_events+v_receipts;end $$;
commit;
