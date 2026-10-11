begin;
-- Account metadata ownership only. No historical receipt/producer/gate rewrite.
create function public.codevalanche_project_binding_immutable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if row(new.project_id,new.owner_user_id,new.local_alias,new.binding_version,new.created_at) is distinct from row(old.project_id,old.owner_user_id,old.local_alias,old.binding_version,old.created_at) then raise exception 'project_binding_immutable';end if;
 return new;
end $$;
revoke all on function public.codevalanche_project_binding_immutable() from public,anon,authenticated,service_role,codevalanche_native_ledger_ingest_worker;
create trigger codevalanche_project_binding_immutable before update on public.codevalanche_project_bindings for each row execute function public.codevalanche_project_binding_immutable();
alter table public.codevalanche_project_bindings enable always trigger codevalanche_project_binding_immutable;
create or replace function public.codevalanche_ingest_native_ledger(p_receipt jsonb,p_issuer text,p_subject text,p_key_fingerprint text,p_expires_at timestamptz)
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
 -- Same transaction, AFTER original producer/actor/session/consent/policy/time locks and BEFORE duplicate/insert acceptance.
 perform 1 from public.codevalanche_project_bindings b where b.project_id=p_receipt->>'projectId' and b.owner_user_id=v_uid and b.binding_version=1 for share;
 if not found then return query select false,false,null::uuid;return;end if;
 if not exists(select 1 from public.codevalanche_native_project_ownership(v_uid,v_sid,p_receipt->>'projectId',(p_receipt->>'consentGeneration')::bigint,(p_receipt->>'policyVersion')::bigint,1) o where o.owned) then return query select false,false,null::uuid;return;end if;
 if p_expires_at<=clock_timestamp() then return query select false,false,null::uuid;return;end if;
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
commit;
