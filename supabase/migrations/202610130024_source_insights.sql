begin;
-- Additive, read-only operator statistics. Existing clients do not call this RPC.
create function public.codevalanche_source_insights(p_user_id uuid,p_from timestamptz,p_to timestamptz,p_timezone text)
returns table(insights jsonb) language plpgsql stable security definer set search_path='' as $$
declare v_consent boolean;v_security jsonb;v_activity jsonb;v_notifications jsonb;v_audit jsonb;v_hours jsonb;v_days jsonb;
begin
 if p_user_id is null or p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '90 days' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_fields';end if;
 select coalesce((select a.analytics_consent from public.codevalanche_account_state a where a.user_id=p_user_id),false) into v_consent;
 select jsonb_build_object('scope','application_security_store','observedEvents',count(*),'observedLoginSuccesses',count(*) filter(where source='provider_audit' and event_name='login_succeeded' and outcome='success'),'observedLoginFailures',count(*) filter(where source='provider_audit' and event_name='login_failed' and outcome='failed'),'observedPasswordRefusals',count(*) filter(where source='password_hook' and event_name='password_invalid'),'lastLogin',max(occurred_at) filter(where source='provider_audit' and event_name='login_succeeded' and outcome='success'),'watermark',max(received_at),'coverage',coalesce((select jsonb_build_object('providerAuditEnabled',c.provider_audit_enabled,'passwordHookEnabled',c.password_hook_enabled,'watermark',c.watermark) from public.codevalanche_provider_event_cursor c where c.source='provider_audit'),'{}'::jsonb)) into v_security
 from public.codevalanche_security_events where user_id=p_user_id and occurred_at>=p_from and occurred_at<p_to;
 select coalesce(jsonb_agg(jsonb_build_object('startUtc',to_char(h.start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00','localHour',to_char(h.start at time zone p_timezone,'YYYY-MM-DD HH24:MI'),'observedEvents',h.n) order by h.start),'[]'::jsonb) into v_hours from (
  select date_trunc('hour',e.occurred_at at time zone 'UTC') at time zone 'UTC' as start,count(*) as n
  from public.codevalanche_analytics_v2 e where v_consent and e.user_id=p_user_id and e.occurred_at>=p_from and e.occurred_at<p_to group by 1
 ) h;
 select coalesce(jsonb_agg(d.record order by d.day),'[]'::jsonb) into v_days from (
  select (e.occurred_at at time zone p_timezone)::date as day,jsonb_build_object('day',(e.occurred_at at time zone p_timezone)::date,'observedEvents',count(*)) as record
  from public.codevalanche_analytics_v2 e where v_consent and e.user_id=p_user_id and e.occurred_at>=p_from and e.occurred_at<p_to group by 1
 ) d;
 select jsonb_build_object('status',case when v_consent then 'observed' else 'consent_disabled' end,'scope','consented_account_activity','observedEvents',case when v_consent then count(*) else null end,'observedRunSuccesses',case when v_consent then count(*) filter(where event_name='run_finished' and outcome='success') else null end,'observedRunFailures',case when v_consent then count(*) filter(where event_name='run_finished' and outcome='failed') else null end,'observedRunCancellations',case when v_consent then count(*) filter(where event_name='run_finished' and outcome='cancelled') else null end,'lastMeaningfulActivity',case when v_consent then max(occurred_at) else null end,'watermark',case when v_consent then max(received_at) else null end,'hours',v_hours,'days',v_days,'emptyBuckets','unobserved_not_zero') into v_activity
 from public.codevalanche_analytics_v2 where user_id=p_user_id and occurred_at>=p_from and occurred_at<p_to;
 -- Event time determines the window; the queue's current delivery state is separate.
 select jsonb_build_object('scope','application_notification_outbox','stateScope','current_state_of_notifications_with_event_time_in_window','signupCreated',count(*) filter(where event_type='signup_created'),'signupVerified',count(*) filter(where event_type='signup_verified'),'queued',count(*) filter(where state='queued'),'sending',count(*) filter(where state='sending'),'retry',count(*) filter(where state='retry'),'notConfigured',count(*) filter(where state='not_configured'),'deadLetter',count(*) filter(where state='dead_letter'),'delivered',count(*) filter(where state='delivered'),'watermark',max(created_at)) into v_notifications
 from public.codevalanche_notification_outbox where user_id=p_user_id and coalesce((payload->>'occurredAt')::timestamptz,created_at)>=p_from and coalesce((payload->>'occurredAt')::timestamptz,created_at)<p_to;
 select jsonb_build_object('scope','application_admin_audit','recordedEvents',count(*),'watermark',max(occurred_at)) into v_audit from public.codevalanche_admin_audit where user_id=p_user_id and occurred_at>=p_from and occurred_at<p_to;
 return query select jsonb_build_object('security',v_security,'activity',v_activity,'notifications',v_notifications,'audit',v_audit,'aggregation','full_filtered_store','retentionDays',jsonb_build_object('security',90,'activity',90,'audit',365));
end $$;
revoke all on function public.codevalanche_source_insights(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.codevalanche_source_insights(uuid,timestamptz,timestamptz,text) to service_role;
commit;
