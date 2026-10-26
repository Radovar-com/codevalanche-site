begin;
-- Only the verified account handler may call this RPC. Caller-selected subjects
-- and assurance levels are never accepted from a browser request.
create function public.codevalanche_export_account(p_user_id uuid,p_session_id uuid,p_aal text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp();v_claimed text;v_result jsonb;
begin
 -- Recheck the live session inside the snapshot, including app revocation.
 perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=p_user_id and s.id=p_session_id and (s.not_after is null or s.not_after>v_now)
 and not exists(select 1 from public.codevalanche_revoked_sessions r where r.session_id=s.id)
 for share of u,s;
 if not found then raise exception 'session_revoked';end if;
 if exists(select 1 from auth.mfa_factors f where f.user_id=p_user_id and f.status='verified')
 and p_aal is distinct from 'aal2' then raise exception 'mfa_required';end if;
 if exists(select 1 from auth.users u where u.id=p_user_id and u.banned_until>v_now)
 or exists(select 1 from public.codevalanche_account_state s where s.user_id=p_user_id and (s.blocked or s.status='suspended'))
 then raise exception 'account_suspended';end if;
 if exists(select 1 from public.codevalanche_account_state s where s.user_id=p_user_id and s.status='deleted')
 then raise exception 'session_revoked';end if;
 -- Conditional UPSERT serializes concurrent requests across sessions/instances.
 -- A rejected attempt does not extend the existing five-minute window.
 insert into public.codevalanche_rate_limits(bucket,started_at,hits)
 values('account-export:'||p_user_id,v_now,1)
 on conflict(bucket) do update set started_at=excluded.started_at,hits=1
 where codevalanche_rate_limits.started_at<=v_now-interval '300 seconds'
 returning bucket into v_claimed;
 if v_claimed is null then raise exception 'rate_limited';end if;
 -- One statement, one snapshot. Explicit projections prevent newly added secret
 -- columns from leaking. Arrays have stable order and no pagination truncation.
 select jsonb_build_object(
  'schemaVersion',1,'exportedAt',v_now,
  'account',(select jsonb_build_object('id',u.id,'email',u.email,'email_confirmed_at',u.email_confirmed_at,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at) from auth.users u where u.id=p_user_id),
  'profile',(select jsonb_build_object('display_name',p.display_name,'bio',p.bio,'updated_at',(select updated_at from public.codevalanche_profiles where user_id=p_user_id)) from public.codevalanche_profile_read(p_user_id) p),
  'accountState',(select to_jsonb(r) from (select analytics_consent,deletion_requested_at,deletion_scheduled_for,blocked,updated_at,status,suspended_until,policy_version,remote_enabled,max_hosts,max_controllers,max_concurrent_runs,consent_generation,credential_changed_at from public.codevalanche_account_state where user_id=p_user_id order by updated_at) r),
  'sessions',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select id,created_at,updated_at,user_agent,not_after from auth.sessions where user_id=p_user_id order by created_at,id) r),
  'revokedSessions',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select session_id,revoked_at from public.codevalanche_revoked_sessions where user_id=p_user_id order by revoked_at,session_id) r),
  'securityEvents',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select event_id,source,occurred_at,received_at,session_id,event_name,outcome,reason_code from public.codevalanche_security_events where user_id=p_user_id order by occurred_at,event_id) r),
  'credentialEvents',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select id,event_name,occurred_at,policy_version from public.codevalanche_credential_events where user_id=p_user_id order by occurred_at,id) r),
  'profileRequests',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select request_id from public.codevalanche_profile_requests where user_id=p_user_id order by request_id) r),
  'profileOutcomes',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select outcome_id,request_id,event_name,occurred_at,consent_generation,reason_code from public.wa_profile_outcomes where user_id=p_user_id order by occurred_at,outcome_id) r),
  'deletionRequests',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select job_id,operation_id,state,previous_status,due_at,created_at,purge_started_at,storage_cleaned_at,auth_delete_started_at,auth_deleted_at,completed_at,remote_erased_at from public.codevalanche_account_erasure_jobs where user_id=p_user_id order by created_at,job_id) r),
  'feedback',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select id,category,message,created_at,status from public.codevalanche_feedback where user_id=p_user_id order by created_at,id) r),
  'legacyActivity',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select id,event_name,platform,created_at from public.codevalanche_events where user_id=p_user_id order by created_at,id) r),
  'accountActivity',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select event_id,event_name,platform,app_version,installation_id,occurred_at,received_at,outcome,source_quality,consent_generation,run_id,project_id from public.codevalanche_analytics_v2 where user_id=p_user_id order by occurred_at,event_id) r),
  'projectBindings',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (select project_id,local_alias,binding_version,created_at from public.codevalanche_project_bindings where owner_user_id=p_user_id order by created_at,project_id) r),
  'consentReceipts',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
   select c.receipt_id,c.site_id,c.policy_version,c.generation,c.website_analytics,c.account_analytics,c.issued_at,c.expires_at,c.revoked_at,b.account_consent_generation
   from public.wa_consent_receipts c join public.wa_receipt_account_bindings b using(receipt_id)
   where b.principal_id=p_user_id order by c.issued_at,c.receipt_id) r),
  'websiteAccountActivity',(select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
   select e.site_id,e.event_id,e.schema_version,e.event_name,e.occurred_at,e.event_at,e.received_at,e.page_id,e.page_version,e.consent_generation,e.event_source,e.authority,e.surface,e.clock_quality,e.active_ms_delta,e.visible_ms_delta
   from public.wa_events e join public.wa_receipt_account_bindings b on b.receipt_id=e.consent_receipt_id
   where b.principal_id=p_user_id and e.event_source='A' order by e.event_at,e.event_id) r)
 ) into v_result;
 return v_result;
end $$;
revoke all on function public.codevalanche_export_account(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.codevalanche_export_account(uuid,uuid,text) to service_role;
commit;
