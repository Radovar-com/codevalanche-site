begin;
create table public.codevalanche_notification_outbox (
 id uuid primary key default gen_random_uuid(),event_type text not null,user_id uuid not null,source_version text not null,payload jsonb not null,
 state text not null default 'queued' check(state in ('queued','sending','delivered','retry','dead_letter','not_configured')),
 inbox_state text not null default 'available',created_at timestamptz not null default now(),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_id uuid,lease_until timestamptz,receipt_id text,delivered_at timestamptz,unique(event_type,user_id,source_version)
);
alter table public.codevalanche_notification_outbox enable row level security;
revoke all on public.codevalanche_notification_outbox from public,anon,authenticated;
grant select on public.codevalanche_notification_outbox to service_role;
create function public.codevalanche_auth_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare v_event text;v_version text;
begin
 if tg_op='INSERT' then
  insert into public.codevalanche_notification_outbox(event_type,user_id,source_version,payload) values('signup_created',new.id,'1',jsonb_build_object('userId',new.id,'eventType','signup_created','occurredAt',new.created_at,'verified',new.email_confirmed_at is not null)) on conflict do nothing;
 end if;
 if new.email_confirmed_at is not null and (tg_op='INSERT' or old.email_confirmed_at is null) then
  insert into public.codevalanche_notification_outbox(event_type,user_id,source_version,payload) values('signup_verified',new.id,'1',jsonb_build_object('userId',new.id,'eventType','signup_verified','occurredAt',new.email_confirmed_at,'verified',true)) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger codevalanche_signup_notifications after insert or update of email_confirmed_at on auth.users for each row execute function public.codevalanche_auth_notifications();
create function public.codevalanche_credential_notifications() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.codevalanche_notification_outbox(event_type,user_id,source_version,payload)
 values(case when new.event_name='password_changed' then 'password_changed' else 'mfa_changed' end,new.user_id,new.policy_version::text,jsonb_build_object('userId',new.user_id,'eventType',case when new.event_name='password_changed' then 'password_changed' else 'mfa_changed' end,'occurredAt',new.occurred_at,'sourceVersion',new.policy_version)) on conflict do nothing;return new;
end $$;
create trigger codevalanche_credential_notifications after insert on public.codevalanche_credential_events for each row execute function public.codevalanche_credential_notifications();
create function public.codevalanche_suspicious_notifications() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_name='password_invalid' and new.user_id is not null and (select count(*) from public.codevalanche_security_events where user_id=new.user_id and event_name='password_invalid' and occurred_at>=now()-interval '15 minutes')>=5 then
  perform pg_advisory_xact_lock(hashtextextended('codevalanche-auth-alert:'||new.user_id::text,0));
  if not exists(select 1 from public.codevalanche_notification_outbox where event_type='suspicious_auth_activity' and user_id=new.user_id and created_at>=now()-interval '24 hours') then
   insert into public.codevalanche_notification_outbox(event_type,user_id,source_version,payload) values('suspicious_auth_activity',new.user_id,(now() at time zone 'UTC')::date::text,jsonb_build_object('userId',new.user_id,'eventType','suspicious_auth_activity','occurredAt',new.occurred_at)) on conflict do nothing;
  end if;
 end if;return new;
end $$;
create trigger codevalanche_suspicious_notifications after insert on public.codevalanche_security_events for each row execute function public.codevalanche_suspicious_notifications();
create function public.codevalanche_notification_claim(p_id uuid,p_lease_id uuid)
returns setof public.codevalanche_notification_outbox language sql security definer set search_path='' as $$ update public.codevalanche_notification_outbox n set state='sending',attempts=attempts+1,lease_id=p_lease_id,lease_until=now()+interval '60 seconds' where n.id=p_id and n.state in ('queued','retry','sending') and n.next_attempt_at<=now() and (n.lease_until is null or n.lease_until<now()) returning n.* $$;
create function public.codevalanche_notification_settle(p_id uuid,p_lease_id uuid,p_state text,p_receipt_id text default null,p_retry_after integer default null)
returns setof public.codevalanche_notification_outbox language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('delivered','retry','dead_letter','not_configured') or (p_state='delivered' and (p_receipt_id is null or p_receipt_id='')) then raise exception 'invalid_fields';end if;
 return query update public.codevalanche_notification_outbox n set state=p_state,receipt_id=p_receipt_id,delivered_at=case when p_state='delivered' then now() else null end,next_attempt_at=now()+make_interval(secs=>greatest(1,least(coalesce(p_retry_after,60),3600))),lease_id=null,lease_until=null where n.id=p_id and n.lease_id=p_lease_id and n.lease_until>now() and n.state='sending' returning n.*;
 if not found then raise exception 'operation_conflict';end if;
end $$;
revoke all on function public.codevalanche_auth_notifications(),public.codevalanche_credential_notifications(),public.codevalanche_suspicious_notifications() from public,anon,authenticated,service_role;
revoke all on function public.codevalanche_notification_claim(uuid,uuid),public.codevalanche_notification_settle(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.codevalanche_notification_claim(uuid,uuid),public.codevalanche_notification_settle(uuid,uuid,text,text,integer) to service_role;
commit;
