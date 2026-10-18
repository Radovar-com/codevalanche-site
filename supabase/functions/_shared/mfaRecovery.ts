import { checked, uuid } from './accountContract.ts';

// A provider response can be lost after deletion. Durable SQL authority keeps
// retries bound to the original factor IDs; only observed absence completes it.
export async function redeemMfaRecovery(service: any, userId: string, codeHash: string): Promise<boolean> {
  const prepare = async () => {
    const rows = checked(await service.rpc('codevalanche_mfa_recovery_prepare', { p_user_id: userId, p_code_hash: codeHash })) as any[];
    if (!Array.isArray(rows)) throw new Error('Recovery authority unavailable');
    const row = rows[0];
    if (!row) return null;
    if (!['pending', 'completed'].includes(row.attempt_status) || !Array.isArray(row.target_factor_ids)
      || row.target_factor_ids.length < 1 || row.target_factor_ids.length > 32
      || row.target_factor_ids.some((id: any) => typeof id !== 'string' || !uuid.test(id))) throw new Error('Invalid recovery authority');
    return row;
  };
  const factors = async (): Promise<string[]> => {
    const result = await service.auth.admin.getUserById(userId);
    const user = result.data?.user;
    // GoTrue's User factors field is omitted when the list is empty.
    if (result.error || user?.id !== userId || (user.factors !== undefined && !Array.isArray(user.factors))) throw new Error('Recovery provider state unavailable');
    const ids = (user.factors ?? []).filter((factor: any) => factor.factor_type === 'totp').map((factor: any) => factor.id);
    if (ids.length > 32 || ids.some((id: any) => typeof id !== 'string' || !uuid.test(id)) || new Set(ids).size !== ids.length) throw new Error('Invalid provider factors');
    return ids;
  };
  const attempt = await prepare();
  if (!attempt) return false;
  if (attempt.attempt_status === 'completed') return (await factors()).length === 0;
  const targets: string[] = attempt.target_factor_ids;
  for (const id of targets) {
    const current = await factors();
    if (current.some(factor => !targets.includes(factor))) return false;
    // Regeneration, expiry or enrollment may invalidate the proof between calls.
    const authority = await prepare();
    if (!authority) return false;
    if (authority.attempt_status === 'completed') return (await factors()).length === 0;
    if (JSON.stringify(authority.target_factor_ids) !== JSON.stringify(targets)) throw new Error('Recovery authority changed');
    if (!current.includes(id)) continue;
    const result = await service.auth.admin.mfa.deleteFactor({ id, userId });
    if (result.error && (await factors()).includes(id)) throw new Error('Recovery provider result unknown');
  }
  const remaining = await factors();
  if (remaining.some(id => !targets.includes(id))) return false;
  if (remaining.length) throw new Error('Recovery provider result unconfirmed');
  // SQL rechecks current Auth factors in the terminal transaction. No usable
  // proof is marked consumed merely because a provider call was attempted.
  return checked(await service.rpc('codevalanche_mfa_recovery_complete', { p_user_id: userId, p_code_hash: codeHash })) === true;
}
