-- Fixed legacy scope. Return only a boolean before exporting any application rows.
with rows as (
 select to_jsonb(t) as value from public.codevalanche_account_state t union all
 select to_jsonb(t) from public.codevalanche_revoked_sessions t union all
 select to_jsonb(t) from public.codevalanche_feedback t union all
 select to_jsonb(t) from public.codevalanche_events t union all
 select to_jsonb(t) from public.codevalanche_rate_limits t
)
select count(*)<=10000 and coalesce(sum(octet_length(value::text)),0)<=524288 as within_limits from rows;
