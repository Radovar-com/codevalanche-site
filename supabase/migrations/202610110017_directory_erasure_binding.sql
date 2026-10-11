begin;
drop function public.codevalanche_admin_user_detail(uuid);
drop function public.codevalanche_admin_directory(text,uuid,integer);
create function public.codevalanche_admin_directory(p_search text default '',p_after uuid default null,p_limit integer default 51)
returns table(id uuid,email text,display_name text,bio text,email_confirmed_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz,status text,blocked boolean,suspended_until timestamptz,policy_version bigint,remote_enabled boolean,max_hosts integer,max_controllers integer,max_concurrent_runs integer,deletion_scheduled_for timestamptz,session_count bigint,erasure_job_id uuid)
language sql stable security definer set search_path='' as $$
 select u.id,u.email::text,left(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',''),80),left(coalesce(u.raw_user_meta_data->>'bio',''),500),u.email_confirmed_at,u.created_at,u.last_sign_in_at,coalesce(a.status,'active'),coalesce(a.blocked,false),a.suspended_until,coalesce(a.policy_version,1),coalesce(a.remote_enabled,false),coalesce(a.max_hosts,3),coalesce(a.max_controllers,5),coalesce(a.max_concurrent_runs,2),a.deletion_scheduled_for,(select count(*) from public.codevalanche_sessions(u.id)),e.job_id
 from auth.users u left join public.codevalanche_account_state a on a.user_id=u.id left join public.codevalanche_account_erasure_jobs e on e.job_id=a.erasure_job_id and e.user_id=u.id
 where (p_after is null or u.id>p_after) and (p_search='' or position(lower(left(p_search,200)) in lower(coalesce(u.email,'')))>0 or position(lower(left(p_search,200)) in lower(coalesce(u.raw_user_meta_data->>'display_name','')))>0)
 order by u.id limit greatest(1,least(p_limit,101))
$$;
create function public.codevalanche_admin_user_detail(p_user_id uuid)
returns table(id uuid,email text,display_name text,bio text,email_confirmed_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz,status text,blocked boolean,suspended_until timestamptz,policy_version bigint,remote_enabled boolean,max_hosts integer,max_controllers integer,max_concurrent_runs integer,deletion_scheduled_for timestamptz,session_count bigint,erasure_job_id uuid)
language sql stable security definer set search_path='' as $$
 select u.id,u.email::text,left(coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',''),80),left(coalesce(u.raw_user_meta_data->>'bio',''),500),u.email_confirmed_at,u.created_at,u.last_sign_in_at,coalesce(a.status,'active'),coalesce(a.blocked,false),a.suspended_until,coalesce(a.policy_version,1),coalesce(a.remote_enabled,false),coalesce(a.max_hosts,3),coalesce(a.max_controllers,5),coalesce(a.max_concurrent_runs,2),a.deletion_scheduled_for,(select count(*) from public.codevalanche_sessions(u.id)),e.job_id from auth.users u left join public.codevalanche_account_state a on a.user_id=u.id left join public.codevalanche_account_erasure_jobs e on e.job_id=a.erasure_job_id and e.user_id=u.id where u.id=p_user_id
$$;
revoke all on function public.codevalanche_admin_directory(text,uuid,integer),public.codevalanche_admin_user_detail(uuid) from public,anon,authenticated;
grant execute on function public.codevalanche_admin_directory(text,uuid,integer),public.codevalanche_admin_user_detail(uuid) to service_role;
commit;
