begin;
-- A recovery proof reserves an immutable set of provider factors. A provider
-- failure leaves that bounded attempt retryable; it cannot authorize a later
-- enrollment. The original code and cleartext provider credentials are absent.
alter table public.codevalanche_mfa_recovery_codes
 add column recovery_factor_ids uuid[],
 add column recovery_started_at timestamptz,
 add column recovery_invalidated_at timestamptz;

create function public.codevalanche_mfa_recovery_prepare(p_user_id uuid,p_code_hash text)
returns table(attempt_status text,target_factor_ids uuid[])
language plpgsql security definer set search_path='' as $$
declare v_code public.codevalanche_mfa_recovery_codes;v_ids uuid[];
begin
 if p_user_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then return;end if;
 select * into v_code from public.codevalanche_mfa_recovery_codes where user_id=p_user_id and code_hash=p_code_hash for update;
 if not found or v_code.recovery_invalidated_at is not null then return;end if;
 if v_code.recovery_started_at is not null and v_code.recovery_started_at<clock_timestamp()-interval '15 minutes' then return;end if;
 if v_code.used_at is not null then
  -- Repeating a completed request acknowledges its result, never reopens it.
  if v_code.recovery_factor_ids is not null and not exists(select 1 from auth.mfa_factors where user_id=p_user_id and factor_type='totp') then
   return query select 'completed'::text,v_code.recovery_factor_ids;
  end if;
  return;
 end if;
 if v_code.recovery_factor_ids is null then
  if not exists(select 1 from auth.mfa_factors where user_id=p_user_id and factor_type='totp' and status='verified') then return;end if;
  select array_agg(id order by id) into v_ids from auth.mfa_factors where user_id=p_user_id and factor_type='totp';
  if coalesce(cardinality(v_ids),0) not between 1 and 32 then return;end if;
  update public.codevalanche_mfa_recovery_codes set recovery_factor_ids=v_ids,recovery_started_at=clock_timestamp() where id=v_code.id;
 else
  v_ids:=v_code.recovery_factor_ids;
  if exists(select 1 from auth.mfa_factors where user_id=p_user_id and factor_type='totp' and not (id=any(v_ids))) then return;end if;
 end if;
 return query select 'pending'::text,v_ids;
end $$;

create function public.codevalanche_mfa_recovery_complete(p_user_id uuid,p_code_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_code public.codevalanche_mfa_recovery_codes;
begin
 select * into v_code from public.codevalanche_mfa_recovery_codes where user_id=p_user_id and code_hash=p_code_hash for update;
 if not found or v_code.recovery_factor_ids is null or v_code.recovery_invalidated_at is not null
  or v_code.recovery_started_at<clock_timestamp()-interval '15 minutes'
  or exists(select 1 from auth.mfa_factors where user_id=p_user_id and factor_type='totp') then return false;end if;
 -- This is the terminal commit. Keep only its used proof for bounded lost-ACK
 -- retries; all other codes belonged to the removed authenticator set.
 update public.codevalanche_mfa_recovery_codes set used_at=coalesce(used_at,clock_timestamp()) where id=v_code.id;
 delete from public.codevalanche_mfa_recovery_codes where user_id=p_user_id and id<>v_code.id;
 return true;
end $$;

create or replace function public.codevalanche_mfa_recovery_remaining(p_user_id uuid)
returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.codevalanche_mfa_recovery_codes
 where user_id=p_user_id and used_at is null and recovery_invalidated_at is null
 and (recovery_started_at is null or recovery_started_at>=now()-interval '15 minutes')
$$;

create function public.codevalanche_mfa_recovery_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if tg_table_name='users' then
  if new.encrypted_password is not distinct from old.encrypted_password then return new;end if;
  v_user:=new.id;
 else
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.factor_type is not distinct from old.factor_type and new.secret is not distinct from old.secret then return new;end if;
  v_user:=new.user_id;
 end if;
 -- Factor deletion is the authorized effect; insert/update/password change
 -- changes the security context and can never enlarge an old proof's scope.
 update public.codevalanche_mfa_recovery_codes set recovery_invalidated_at=clock_timestamp()
 where user_id=v_user and recovery_started_at is not null and recovery_invalidated_at is null;
 return new;
end $$;
create trigger codevalanche_mfa_recovery_factor_fence after insert or update on auth.mfa_factors for each row execute function public.codevalanche_mfa_recovery_fence();
create trigger codevalanche_mfa_recovery_password_fence after update of encrypted_password on auth.users for each row execute function public.codevalanche_mfa_recovery_fence();
revoke all on function public.codevalanche_mfa_recovery_prepare(uuid,text),public.codevalanche_mfa_recovery_complete(uuid,text) from public,anon,authenticated;
grant execute on function public.codevalanche_mfa_recovery_prepare(uuid,text),public.codevalanche_mfa_recovery_complete(uuid,text) to service_role;
revoke all on function public.codevalanche_mfa_recovery_fence() from public,anon,authenticated,service_role;
commit;
