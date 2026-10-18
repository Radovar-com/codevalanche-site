select jsonb_build_object(
 'codevalanche_account_state',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.codevalanche_account_state t),
 'codevalanche_revoked_sessions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.codevalanche_revoked_sessions t),
 'codevalanche_feedback',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.codevalanche_feedback t),
 'codevalanche_events',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.codevalanche_events t),
 'codevalanche_rate_limits',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.codevalanche_rate_limits t)
) as tables;
