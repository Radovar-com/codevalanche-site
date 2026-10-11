begin;

-- Add scheduled processing attempts to the existing notification readout.
-- A durable queue state does not establish configured or delivered email.
create or replace function public.codevalanche_readout_page(p_kind text,p_user_id uuid default null,p_cursor_time timestamptz default null,p_cursor_id uuid default null,p_limit integer default 51)
returns table(record jsonb) language plpgsql stable security definer set search_path='' as $$
declare v_table text;v_time text;v_id text;v_columns text[];v_delivery text:='';
begin
 if p_cursor_time is not null and p_cursor_id is null then raise exception 'invalid_fields';end if;
 case p_kind
 when 'security' then v_table:='codevalanche_security_events';v_time:='occurred_at';v_id:='event_id';v_columns:=array['event_id','source','source_event_id','occurred_at','received_at','user_id','session_id','event_name','outcome','reason_code','coverage'];
 when 'notifications' then
  v_table:='codevalanche_notification_outbox';v_time:='created_at';v_id:='id';v_columns:=array['id','event_type','user_id','source_version','payload','state','inbox_state','created_at','attempts','delivered_at'];
  v_delivery:=' || jsonb_build_object(''next_attempt_at'',case when t.state in (''queued'',''retry'',''sending'') then to_char(t.next_attempt_at at time zone ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'') else null end,''delivered_at'',case when t.state=''delivered'' then to_char(t.delivered_at at time zone ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'') else null end)';
 when 'audit' then v_table:='codevalanche_admin_audit';v_time:='occurred_at';v_id:='id';v_columns:=array['id','operation_id','actor_id','user_id','action','outcome','reason_code','occurred_at'];
 when 'feedback' then v_table:='codevalanche_feedback';v_time:='created_at';v_id:='id';v_columns:=array['id','user_id','category','message','status','created_at'];
 else raise exception 'invalid_fields';end case;
 return query execute format('select (select jsonb_object_agg(c.key,to_jsonb(t)->c.key) from unnest($5::text[]) as c(key))%s || jsonb_build_object(''_cursorTime'',to_char(t.%I at time zone ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"''),''_cursorId'',t.%I) from public.%I t where ($1::uuid is null or t.user_id=$1) and ($2::timestamptz is null or (t.%I,t.%I)<($2,$3::uuid)) order by t.%I desc,t.%I desc limit $4',v_delivery,v_time,v_id,v_table,v_time,v_id,v_time,v_id)
 using p_user_id,p_cursor_time,p_cursor_id,greatest(1,least(p_limit,101)),v_columns;
end $$;

-- CREATE OR REPLACE retains the existing service-only grants and signature.
commit;
