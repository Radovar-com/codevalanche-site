begin;
create function public.codevalanche_self_erasure_status(p_user_id uuid,p_session_id uuid,p_policy_version bigint)
returns table(job_id uuid,due_at timestamptz,state text,phase text,can_cancel boolean)
language sql stable security definer set search_path='' as $$
 select j.job_id,j.due_at,j.state,
 case when j.state='failed' then 'failed'
      when j.auth_deleted_at is not null then 'remote-access'
      when j.auth_delete_started_at is not null then 'authentication'
      when j.purge_started_at is not null or j.state='purging' then 'purging'
      else 'queued' end,
 j.state='queued' and j.purge_started_at is null
 from public.codevalanche_account_state a
 join public.codevalanche_account_erasure_jobs j on j.job_id=a.erasure_job_id and j.user_id=a.user_id and j.due_at=a.deletion_scheduled_for
 join auth.users u on u.id=a.user_id
 join auth.sessions s on s.user_id=u.id and s.id=p_session_id
 where a.user_id=p_user_id and a.status='deletion_pending' and a.policy_version=p_policy_version
 and j.state in ('queued','purging','failed') and (s.not_after is null or s.not_after>now())
 and not exists(select 1 from public.codevalanche_revoked_sessions r where r.user_id=p_user_id and r.session_id=s.id)
$$;
revoke all on function public.codevalanche_self_erasure_status(uuid,uuid,bigint) from public,anon,authenticated,codevalanche_native_ledger_ingest_worker;
grant execute on function public.codevalanche_self_erasure_status(uuid,uuid,bigint) to service_role;
commit;
