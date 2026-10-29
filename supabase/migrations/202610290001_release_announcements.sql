-- Release announcement emails ("what's new in <version>").
-- Nothing here sends anything: a campaign only reaches readers after a test
-- send to the owner and an explicit approval that types "SEND <version>".
-- Emails are English only (owner decision 2026-10-29).
-- Recipient addresses are never copied out of auth.users; they are read at
-- claim time so an address change, unsubscribe, block or deletion wins.
begin;
create role codevalanche_release_email_worker nologin;
grant usage on schema public to codevalanche_release_email_worker;
grant codevalanche_release_email_worker to authenticator;
grant execute on function public.codevalanche_worker_capability() to codevalanche_release_email_worker;

-- opted_in: null = never asked, true = asked for update emails, false = refused.
create table public.codevalanche_release_email_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 opted_in boolean,
 unsubscribed_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.codevalanche_release_campaigns (
 id uuid primary key default gen_random_uuid(),
 version text not null unique check(version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
 release jsonb not null,
 audience text not null check(audience in ('all_accounts','opted_in')),
 state text not null default 'draft' check(state in ('draft','test_sent','sending','sent','cancelled')),
 created_at timestamptz not null default now(),
 test_sent_at timestamptz,
 approved_at timestamptz,
 completed_at timestamptz
);
create table public.codevalanche_release_campaign_recipients (
 campaign_id uuid not null references public.codevalanche_release_campaigns(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 variant text not null check(variant in ('active','inactive')),
 state text not null default 'queued' check(state in ('queued','sending','sent','failed','skipped')),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 receipt_id text,
 sent_at timestamptz,
 primary key(campaign_id,user_id)
);
create index codevalanche_release_recipients_sent_at on public.codevalanche_release_campaign_recipients(sent_at) where state='sent';
alter table public.codevalanche_release_email_preferences enable row level security;
alter table public.codevalanche_release_campaigns enable row level security;
alter table public.codevalanche_release_campaign_recipients enable row level security;
-- Explicit grants: no client role can read or write these tables; the worker
-- role reaches them only through the functions below.
revoke all on public.codevalanche_release_email_preferences,public.codevalanche_release_campaigns,public.codevalanche_release_campaign_recipients from public,anon,authenticated,codevalanche_release_email_worker;
grant select,insert,update,delete on public.codevalanche_release_email_preferences,public.codevalanche_release_campaigns,public.codevalanche_release_campaign_recipients to service_role;

-- Creating or replacing the copy of a campaign that has not started resets it
-- to draft, so the owner always approves the text that was last tested.
create function public.codevalanche_release_campaign_save(p_version text,p_release jsonb,p_audience text)
returns setof public.codevalanche_release_campaigns language plpgsql security definer set search_path='' as $$
begin
 if p_release->>'version' is distinct from p_version or jsonb_typeof(p_release->'copy')<>'object' or p_audience not in ('all_accounts','opted_in') then raise exception 'invalid_fields';end if;
 if exists(select 1 from public.codevalanche_release_campaigns where version=p_version and state not in ('draft','test_sent')) then raise exception 'campaign_locked';end if;
 return query insert into public.codevalanche_release_campaigns(version,release,audience) values(p_version,p_release,p_audience)
  on conflict(version) do update set release=excluded.release,audience=excluded.audience,state='draft',test_sent_at=null returning *;
end $$;

create function public.codevalanche_release_campaign_get(p_version text)
returns setof public.codevalanche_release_campaigns language sql stable security definer set search_path='' as $$
 select * from public.codevalanche_release_campaigns where version=p_version
$$;

create function public.codevalanche_release_campaign_mark_tested(p_campaign_id uuid)
returns setof public.codevalanche_release_campaigns language plpgsql security definer set search_path='' as $$
begin
 return query update public.codevalanche_release_campaigns set state='test_sent',test_sent_at=now() where id=p_campaign_id and state in ('draft','test_sent') returning *;
 if not found then raise exception 'operation_conflict';end if;
end $$;

-- Counts who would receive the campaign right now, without changing anything.
create function public.codevalanche_release_campaign_audience(p_campaign_id uuid)
returns table(total integer,inactive integer) language sql stable security definer set search_path='' as $$
 with c as (select audience from public.codevalanche_release_campaigns where id=p_campaign_id),
 eligible as (
  select coalesce(greatest(u.last_sign_in_at,(select max(s.updated_at) from auth.sessions s where s.user_id=u.id)),u.created_at)<now()-interval '30 days' inactive
  from auth.users u cross join c
  left join public.codevalanche_account_state a on a.user_id=u.id
  left join public.codevalanche_release_email_preferences p on p.user_id=u.id
  where u.email is not null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
   and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false) and a.deletion_requested_at is null
   and p.unsubscribed_at is null
   and case c.audience when 'opted_in' then p.opted_in is true else coalesce(p.opted_in,true) end
 )
 select count(*)::int,count(*) filter(where inactive)::int from eligible
$$;

-- The one approval step. Requires a prior test send and the typed phrase
-- "SEND <version>", then freezes the recipient list.
create function public.codevalanche_release_campaign_approve(p_campaign_id uuid,p_confirmation text)
returns table(recipients integer) language plpgsql security definer set search_path='' as $$
declare v public.codevalanche_release_campaigns;n integer;
begin
 select * into v from public.codevalanche_release_campaigns where id=p_campaign_id for update;
 if not found then raise exception 'operation_conflict';end if;
 if v.state<>'test_sent' then raise exception 'campaign_not_tested';end if;
 if p_confirmation is distinct from 'SEND '||v.version then raise exception 'confirmation_mismatch';end if;
 insert into public.codevalanche_release_campaign_recipients(campaign_id,user_id,variant)
 select v.id,u.id,
  case when coalesce(greatest(u.last_sign_in_at,(select max(s.updated_at) from auth.sessions s where s.user_id=u.id)),u.created_at)<now()-interval '30 days' then 'inactive' else 'active' end
 from auth.users u
 left join public.codevalanche_account_state a on a.user_id=u.id
 left join public.codevalanche_release_email_preferences p on p.user_id=u.id
 where u.email is not null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
  and coalesce(a.status,'active')='active' and not coalesce(a.blocked,false) and a.deletion_requested_at is null
  and p.unsubscribed_at is null
  and case v.audience when 'opted_in' then p.opted_in is true else coalesce(p.opted_in,true) end;
 get diagnostics n=row_count;
 update public.codevalanche_release_campaigns set state=case when n=0 then 'sent' else 'sending' end,approved_at=now(),completed_at=case when n=0 then now() end where id=v.id;
 return query select n;
end $$;

-- Claims up to p_limit readers, never more than the daily cap allows across all
-- campaigns. Readers who unsubscribed or lost eligibility since approval are
-- skipped here, so they are not mailed.
create function public.codevalanche_release_campaign_claim(p_campaign_id uuid,p_lease_id uuid,p_limit integer,p_daily_cap integer)
returns table(user_id uuid,email text,variant text,attempts integer) language plpgsql security definer set search_path='' as $$
declare v_room integer;
begin
 if p_limit<1 or p_limit>100 or p_daily_cap<1 then raise exception 'invalid_fields';end if;
 if not exists(select 1 from public.codevalanche_release_campaigns c where c.id=p_campaign_id and c.state='sending') then raise exception 'campaign_not_sending';end if;
 update public.codevalanche_release_campaign_recipients r set state='skipped',lease_id=null,lease_until=null
 from auth.users u
 left join public.codevalanche_account_state a on a.user_id=u.id
 left join public.codevalanche_release_email_preferences p on p.user_id=u.id
 where r.campaign_id=p_campaign_id and r.state in ('queued','sending') and u.id=r.user_id
  and (p.unsubscribed_at is not null or p.opted_in is false or u.email is null or (u.banned_until is not null and u.banned_until>=now())
   or coalesce(a.status,'active')<>'active' or coalesce(a.blocked,false) or a.deletion_requested_at is not null);
 select greatest(0,p_daily_cap-count(*))::int into v_room from public.codevalanche_release_campaign_recipients r where r.state='sent' and r.sent_at>=now()-interval '24 hours';
 return query with picked as (
  select r.campaign_id,r.user_id from public.codevalanche_release_campaign_recipients r
  where r.campaign_id=p_campaign_id and (r.state='queued' or (r.state='sending' and r.lease_until<now()))
  order by r.user_id limit least(p_limit,v_room) for update skip locked
 ), claimed as (
  update public.codevalanche_release_campaign_recipients r set state='sending',attempts=r.attempts+1,lease_id=p_lease_id,lease_until=now()+interval '120 seconds'
  from picked where r.campaign_id=picked.campaign_id and r.user_id=picked.user_id returning r.user_id,r.variant,r.attempts
 ) select c.user_id,u.email,c.variant,c.attempts from claimed c join auth.users u on u.id=c.user_id;
end $$;

create function public.codevalanche_release_campaign_settle(p_campaign_id uuid,p_user_id uuid,p_lease_id uuid,p_sent boolean,p_receipt_id text)
returns table(state text) language plpgsql security definer set search_path='' as $$
begin
 if p_sent and (p_receipt_id is null or p_receipt_id='' or length(p_receipt_id)>200) then raise exception 'invalid_fields';end if;
 return query update public.codevalanche_release_campaign_recipients r
  set state=case when p_sent then 'sent' when r.attempts>=3 then 'failed' else 'queued' end,
   receipt_id=case when p_sent then p_receipt_id end,sent_at=case when p_sent then now() end,lease_id=null,lease_until=null
  where r.campaign_id=p_campaign_id and r.user_id=p_user_id and r.lease_id=p_lease_id and r.state='sending' returning r.state;
 if not found then raise exception 'operation_conflict';end if;
 update public.codevalanche_release_campaigns c set state='sent',completed_at=now()
  where c.id=p_campaign_id and c.state='sending' and not exists(select 1 from public.codevalanche_release_campaign_recipients r where r.campaign_id=p_campaign_id and r.state in ('queued','sending'));
end $$;

create function public.codevalanche_release_campaign_summary(p_campaign_id uuid)
returns table(campaign_state text,queued integer,sent integer,failed integer,skipped integer) language sql stable security definer set search_path='' as $$
 select c.state,
  (select count(*)::int from public.codevalanche_release_campaign_recipients r where r.campaign_id=c.id and r.state in ('queued','sending')),
  (select count(*)::int from public.codevalanche_release_campaign_recipients r where r.campaign_id=c.id and r.state='sent'),
  (select count(*)::int from public.codevalanche_release_campaign_recipients r where r.campaign_id=c.id and r.state='failed'),
  (select count(*)::int from public.codevalanche_release_campaign_recipients r where r.campaign_id=c.id and r.state='skipped')
 from public.codevalanche_release_campaigns c where c.id=p_campaign_id
$$;

create function public.codevalanche_release_campaign_cancel(p_campaign_id uuid)
returns setof public.codevalanche_release_campaigns language plpgsql security definer set search_path='' as $$
begin
 update public.codevalanche_release_campaign_recipients set state='skipped',lease_id=null,lease_until=null where campaign_id=p_campaign_id and state='queued';
 return query update public.codevalanche_release_campaigns set state='cancelled',completed_at=now() where id=p_campaign_id and state in ('draft','test_sent','sending') returning *;
 if not found then raise exception 'operation_conflict';end if;
end $$;

-- One-click unsubscribe (the signed link proves the reader; see releaseEmail).
create function public.codevalanche_release_email_unsubscribe(p_user_id uuid)
returns table(unsubscribed boolean) language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_user_id) then return query select false;return;end if;
 insert into public.codevalanche_release_email_preferences(user_id,opted_in,unsubscribed_at) values(p_user_id,false,now())
 on conflict(user_id) do update set opted_in=false,unsubscribed_at=coalesce(public.codevalanche_release_email_preferences.unsubscribed_at,now()),updated_at=now();
 return query select true;
end $$;

-- The account page's "Email me about new versions" switch.
create function public.codevalanche_release_email_preference(p_user_id uuid,p_opted_in boolean)
returns table(opted_in boolean) language plpgsql security definer set search_path='' as $$
begin
 return query insert into public.codevalanche_release_email_preferences(user_id,opted_in,unsubscribed_at) values(p_user_id,p_opted_in,case when p_opted_in then null else now() end)
 on conflict(user_id) do update set opted_in=p_opted_in,unsubscribed_at=case when p_opted_in then null else coalesce(public.codevalanche_release_email_preferences.unsubscribed_at,now()) end,updated_at=now()
 returning public.codevalanche_release_email_preferences.opted_in;
end $$;

revoke all on function public.codevalanche_release_campaign_save(text,jsonb,text),public.codevalanche_release_campaign_get(text),public.codevalanche_release_campaign_mark_tested(uuid),
 public.codevalanche_release_campaign_audience(uuid),public.codevalanche_release_campaign_approve(uuid,text),public.codevalanche_release_campaign_claim(uuid,uuid,integer,integer),
 public.codevalanche_release_campaign_settle(uuid,uuid,uuid,boolean,text),public.codevalanche_release_campaign_summary(uuid),public.codevalanche_release_campaign_cancel(uuid),
 public.codevalanche_release_email_unsubscribe(uuid),public.codevalanche_release_email_preference(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.codevalanche_release_campaign_save(text,jsonb,text),public.codevalanche_release_campaign_get(text),public.codevalanche_release_campaign_mark_tested(uuid),
 public.codevalanche_release_campaign_audience(uuid),public.codevalanche_release_campaign_approve(uuid,text),public.codevalanche_release_campaign_claim(uuid,uuid,integer,integer),
 public.codevalanche_release_campaign_settle(uuid,uuid,uuid,boolean,text),public.codevalanche_release_campaign_summary(uuid),public.codevalanche_release_campaign_cancel(uuid),
 public.codevalanche_release_email_unsubscribe(uuid)
 to codevalanche_release_email_worker;
grant execute on function public.codevalanche_release_email_preference(uuid,boolean) to service_role;
commit;
