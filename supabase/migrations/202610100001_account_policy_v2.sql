begin;
alter table public.codevalanche_account_state
 add column status text not null default 'active' check(status in ('active','suspended','deletion_pending','deleted')),
 add column suspended_until timestamptz,
 add column suspension_generation bigint not null default 0 check(suspension_generation>=0),
 add column policy_version bigint not null default 1 check(policy_version>0),
 add column remote_enabled boolean not null default false,
 add column max_hosts integer not null default 3 check(max_hosts between 0 and 10000),
 add column max_controllers integer not null default 5 check(max_controllers between 0 and 10000),
 add column max_concurrent_runs integer not null default 2 check(max_concurrent_runs between 0 and 10000);
update public.codevalanche_account_state set status=case when blocked then 'suspended' when deletion_scheduled_for is not null then 'deletion_pending' else 'active' end;
-- Defaults describe an enrollment ceiling, not remote enablement or an authorization grant.
revoke all on public.codevalanche_account_state from public,anon,authenticated;
grant select,insert,update,delete on public.codevalanche_account_state to service_role;
commit;
