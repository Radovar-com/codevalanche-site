begin;
create function public.codevalanche_due_maintenance(p_limit integer default 10)
returns table(queue text,id uuid,user_id uuid) language sql stable security definer set search_path='' as $$
 select jobs.queue,jobs.id,jobs.user_id from (
  select 'operation'::text as queue,j.operation_id as id,j.user_id,j.created_at as due_at,1 as priority from public.codevalanche_operation_jobs j where j.state='pending' and j.attempts<8 and (j.lease_until is null or j.lease_until<now()) and (j.attempts=0 or j.updated_at+make_interval(secs=>least(3600,(15*power(2,greatest(0,j.attempts-1)))::integer))<=now())
  union all select 'expiry',j.id,j.user_id,j.due_at,1 from public.codevalanche_suspension_expiry_jobs j where j.state='pending' and j.due_at<=now() and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now())
  union all select 'erasure',j.job_id,j.user_id,j.due_at,2 from public.codevalanche_account_erasure_jobs j where j.state in ('queued','purging') and j.due_at<=now() and (j.lease_until is null or j.lease_until<now())
  union all select 'notification',j.id,j.user_id,j.next_attempt_at,3 from public.codevalanche_notification_outbox j where j.state in ('queued','retry','sending') and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now())
 ) jobs order by jobs.priority,jobs.due_at,jobs.id limit greatest(1,least(p_limit,25))
$$;
revoke all on function public.codevalanche_due_maintenance(integer) from public,anon,authenticated;
grant execute on function public.codevalanche_due_maintenance(integer) to service_role;
commit;
