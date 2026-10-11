begin;
create table public.codevalanche_admin_memberships(user_id uuid primary key references auth.users(id) on delete restrict,role text not null check(role in ('owner','accounts_admin','support_readonly')),active boolean not null default true,created_at timestamptz not null default now());
alter table public.codevalanche_admin_memberships enable row level security;
revoke all on public.codevalanche_admin_memberships from public,anon,authenticated;
grant select on public.codevalanche_admin_memberships to service_role;
-- Membership mutation is maintenance SQL only, no service/client profile promotion endpoint.
create table public.codevalanche_operation_jobs (
 operation_id uuid primary key,actor_id uuid not null,user_id uuid not null,action text not null,
 reason_code text not null,reason text not null default '',parameters jsonb not null,
 state text not null default 'pending' check(state in ('attempted','pending','completed','failed')),
 attempts integer not null default 0,lease_id uuid,lease_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,error_code text,
 accepted_suspension_generation bigint not null default 0,provider_state text not null default 'not_started' check(provider_state in ('not_started','inflight','unknown','rejected','confirmed','not_needed')),provider_attempt_id uuid,provider_started_at timestamptz,provider_completed_at timestamptz
);
create table public.codevalanche_admin_audit(id uuid primary key default gen_random_uuid(),operation_id uuid not null,actor_id uuid not null,user_id uuid not null,action text not null,outcome text not null check(outcome in ('attempted','pending','completed','failed')),reason_code text not null,occurred_at timestamptz not null default now());
alter table public.codevalanche_operation_jobs enable row level security;
alter table public.codevalanche_admin_audit enable row level security;
revoke all on public.codevalanche_operation_jobs,public.codevalanche_admin_audit from public,anon,authenticated;
grant select on public.codevalanche_operation_jobs,public.codevalanche_admin_audit to service_role;
create function public.codevalanche_admin_directory(p_search text default '',p_after uuid default null,p_limit integer default 51)
returns table(id uuid,email text,display_name text,bio text,email_confirmed_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz,status text,blocked boolean,suspended_until timestamptz,policy_version bigint,remote_enabled boolean,max_hosts integer,max_controllers integer,max_concurrent_runs integer,deletion_scheduled_for timestamptz,session_count bigint)
language sql stable security definer set search_path='' as $$
 select u.id,u.email::text,left(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',''),80),left(coalesce(u.raw_user_meta_data->>'bio',''),500),u.email_confirmed_at,u.created_at,u.last_sign_in_at,coalesce(a.status,'active'),coalesce(a.blocked,false),a.suspended_until,coalesce(a.policy_version,1),coalesce(a.remote_enabled,false),coalesce(a.max_hosts,3),coalesce(a.max_controllers,5),coalesce(a.max_concurrent_runs,2),a.deletion_scheduled_for,(select count(*) from public.codevalanche_sessions(u.id))
 from auth.users u left join public.codevalanche_account_state a on a.user_id=u.id
 where (p_after is null or u.id>p_after) and (p_search='' or position(lower(left(p_search,200)) in lower(coalesce(u.email,'')))>0 or position(lower(left(p_search,200)) in lower(coalesce(u.raw_user_meta_data->>'display_name','')))>0)
 order by u.id limit greatest(1,least(p_limit,101))
$$;
create function public.codevalanche_admin_user_detail(p_user_id uuid)
returns table(id uuid,email text,display_name text,bio text,email_confirmed_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz,status text,blocked boolean,suspended_until timestamptz,policy_version bigint,remote_enabled boolean,max_hosts integer,max_controllers integer,max_concurrent_runs integer,deletion_scheduled_for timestamptz,session_count bigint)
language sql stable security definer set search_path='' as $$
 select u.id,u.email::text,left(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',''),80),left(coalesce(u.raw_user_meta_data->>'bio',''),500),u.email_confirmed_at,u.created_at,u.last_sign_in_at,coalesce(a.status,'active'),coalesce(a.blocked,false),a.suspended_until,coalesce(a.policy_version,1),coalesce(a.remote_enabled,false),coalesce(a.max_hosts,3),coalesce(a.max_controllers,5),coalesce(a.max_concurrent_runs,2),a.deletion_scheduled_for,(select count(*) from public.codevalanche_sessions(u.id)) from auth.users u left join public.codevalanche_account_state a on a.user_id=u.id where u.id=p_user_id
$$;
revoke all on function public.codevalanche_admin_directory(text,uuid,integer),public.codevalanche_admin_user_detail(uuid) from public,anon,authenticated;
grant execute on function public.codevalanche_admin_directory(text,uuid,integer),public.codevalanche_admin_user_detail(uuid) to service_role;
commit;
