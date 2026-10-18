import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { cliJson } from '../scripts/security-operations.mjs';

const PROJECT_REF = 'umpybznthsfehmdvmfly';
const URL = `https://${PROJECT_REF}.supabase.co`;
const SLUG = 'codevalanche-account-security-qualification-20261018';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function totpCode(secret, time = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const value = alphabet.indexOf(char); if (value < 0) throw new Error('totp_secret_invalid');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = mac.at(-1) & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function sanitizedClaims(claims, now = Date.now()) {
  const audienceAuthenticatedOnly = claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === 'authenticated');
  return {
    audType: Array.isArray(claims.aud) ? 'array' : typeof claims.aud,
    audienceAuthenticatedOnly, audienceValue: audienceAuthenticatedOnly ? 'authenticated' : 'unclassified',
    issuerMatchesStaging: claims.iss === `${URL}/auth/v1`,
    role: claims.role === 'authenticated' ? 'authenticated' : 'unclassified',
    tokenUsePresent: Object.hasOwn(claims, 'token_use'),
    tokenUse: ['access', 'access_token'].includes(claims.token_use) ? claims.token_use : null,
    aal: ['aal1', 'aal2'].includes(claims.aal) ? claims.aal : null,
    amr: (Array.isArray(claims.amr) ? claims.amr : []).map(item => ({
      method: ['password', 'totp', 'oauth', 'otp', 'recovery', 'magiclink', 'sso/saml', 'mfa/phone', 'anonymous'].includes(item.method) ? item.method : 'unclassified',
      ageSeconds: Number.isFinite(item.timestamp) ? Math.max(-1, Math.min(86_400, Math.floor(now / 1000) - item.timestamp)) : null,
    })),
  };
}

function checked(result, phase) { if (result.error) throw new Error(phase); return result.data; }

export async function main({ providerOnly = false } = {}) {
  const report = { version: 1, projectRef: PROJECT_REF, environment: 'staging', observedAt: new Date().toISOString(), providerOnly, checks: [], claims: {}, cleanupComplete: false, productionTouched: false, emailDeliveryTested: false };
  const created = [];
  let service;
  let phase = 'api_keys_read';
  const record = (name, pass, details = {}) => { report.checks.push({ name, pass: pass === true, ...details }); };
  try {
    const keys = await cliJson(['projects', 'api-keys', '--project-ref', PROJECT_REF, '--reveal']);
    const anon = keys.find(key => key.name === 'anon')?.api_key;
    const serviceKey = keys.find(key => key.name === 'service_role')?.api_key;
    if (!anon || !serviceKey) throw new Error('api_keys_unavailable');
    service = createClient(URL, serviceKey, options);
    const first = createClient(URL, anon, options);
    const second = createClient(URL, anon, options);
    const invoke = async (token, action, extra = {}) => {
      const response = await fetch(`${URL}/functions/v1/${SLUG}`, { method: 'POST', headers: { apikey: anon, ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', origin: 'https://codevalanche.com' }, body: JSON.stringify({ action, ...extra }), signal: AbortSignal.timeout(30_000) });
      let body = {}; try { body = await response.json(); } catch {}
      return { status: response.status, body };
    };
    if (!providerOnly) {
      phase = 'unauthenticated_boundary';
      const denied = await invoke(null, 'get-account');
      record('unauthenticated_request_denied', denied.status === 401, { httpStatus: denied.status });
      if (denied.status !== 401) throw new Error('qualification_function_not_ready');
    }
    phase = 'synthetic_users_create';
    const password = `Aa7!${randomBytes(24).toString('base64url')}`;
    const identities = [];
    for (const isAdmin of [true, false]) {
      const email = `security-qualification-${randomUUID()}@example.invalid`;
      const { user } = checked(await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: isAdmin ? { codevalanche_admin: true } : {} }), 'synthetic_user_create_failed');
      created.push(user.id); identities.push({ email, id: user.id });
    }
    phase = 'password_sessions';
    const firstSession = checked(await first.auth.signInWithPassword({ email: identities[0].email, password }), 'password_signin_failed').session;
    const secondSession = checked(await second.auth.signInWithPassword({ email: identities[1].email, password }), 'password_signin_failed').session;
    const passwordClaims = checked(await first.auth.getClaims(firstSession.access_token), 'password_claims_verification_failed').claims;
    report.claims.password = sanitizedClaims(passwordClaims);
    record('password_provider_claims_verified', report.claims.password.aal === 'aal1' && report.claims.password.audienceAuthenticatedOnly && report.claims.password.issuerMatchesStaging && report.claims.password.amr.some(item => item.method === 'password'));
    if (!providerOnly) {
      phase = 'password_app_boundaries';
      const own = await invoke(secondSession.access_token, 'get-account');
      record('own_profile_session_boundary', own.status === 200 && own.body.userId === identities[1].id && own.body.sessions?.some(item => item.current === true), { httpStatus: own.status });
      const foreign = await invoke(secondSession.access_token, 'revoke-session', { sessionId: passwordClaims.session_id });
      record('foreign_session_revoke_denied', foreign.status === 404, { httpStatus: foreign.status });
      const aal1Admin = await invoke(firstSession.access_token, 'admin-list-users');
      record('admin_password_aal1_denied', aal1Admin.status === 401 && aal1Admin.body.code === 'mfa_required' && aal1Admin.body.mfaRequired === true, { httpStatus: aal1Admin.status, mfaRequired: aal1Admin.body.mfaRequired === true });
      const deletion = await invoke(secondSession.access_token, 'request-deletion', { confirmation: 'DELETE' });
      record('fresh_password_synthetic_deletion_requested', deletion.status === 200 && deletion.body.deletion?.status === 'pending', { httpStatus: deletion.status });
      const canceled = await invoke(secondSession.access_token, 'cancel-deletion');
      record('synthetic_deletion_canceled', canceled.status === 200, { httpStatus: canceled.status });
    }
    phase = 'native_totp_enrollment';
    const factor = checked(await first.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Temporary security qualification' }), 'totp_enrollment_failed');
    // Keep the factor creation and challenge on distinct seconds; same-second stamp tests are separate.
    await new Promise(resolve => setTimeout(resolve, 1100));
    checked(await first.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(factor.totp.secret) }), 'totp_verification_failed');
    const afterFirstVerification = checked(await service.auth.getUser(checked(await first.auth.getSession(), 'factor_session_missing').session.access_token), 'first_factor_metadata_failed').user.factors?.find(item => item.id === factor.id);
    await new Promise(resolve => setTimeout(resolve, 1100));
    checked(await first.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(factor.totp.secret) }), 'totp_distinct_second_verification_failed');
    let mfaSession = checked(await first.auth.getSession(), 'totp_session_missing').session;
    let mfaClaims = checked(await first.auth.getClaims(mfaSession.access_token), 'totp_claims_verification_failed').claims;
    const enrolledUser = checked(await service.auth.getUser(mfaSession.access_token), 'factor_metadata_read_failed').user;
    const afterSecondVerification = enrolledUser.factors?.find(item => item.id === factor.id);
    const mfaTimestamp = mfaClaims.amr?.find(item => item.method === 'totp')?.timestamp * 1000;
    report.initialEnrollmentFactorOrdering = (enrolledUser.factors ?? []).filter(item => item.status === 'verified' && item.factor_type === 'totp').map(item => ({ createdAtPresent: Number.isFinite(Date.parse(item.created_at)), updatedAtPresent: Number.isFinite(Date.parse(item.updated_at)), createdStrictlyBeforeMfa: Date.parse(item.created_at) < mfaTimestamp, updatedStrictlyBeforeMfa: Date.parse(item.updated_at) < mfaTimestamp, updatedMinusMfaMilliseconds: Math.max(-60_000,Math.min(60_000,Date.parse(item.updated_at)-mfaTimestamp)) }));
    report.factorVerificationMetadata = {
      sameFactorAcrossChallenges: afterFirstVerification?.id === afterSecondVerification?.id,
      createdAtStable: afterFirstVerification?.created_at === afterSecondVerification?.created_at,
      updatedAtChangedOnNormalVerification: afterFirstVerification?.updated_at !== afterSecondVerification?.updated_at,
      statusRemainsVerified: afterFirstVerification?.status === 'verified' && afterSecondVerification?.status === 'verified',
      typeRemainsTotp: afterFirstVerification?.factor_type === 'totp' && afterSecondVerification?.factor_type === 'totp',
      amrAfterCreatedAt: mfaTimestamp > Date.parse(afterSecondVerification?.created_at),
      amrAtOrBeforeUpdatedAt: mfaTimestamp <= Date.parse(afterSecondVerification?.updated_at),
    };
    // Enrollment changes the factor stamp. A genuinely new password session gets a later
    // primary-authentication AMR chain before a distinct native TOTP step-up.
    const freshMfaClient = createClient(URL, anon, options);
    checked(await freshMfaClient.auth.signInWithPassword({ email: identities[0].email, password }), 'post_enrollment_password_signin_failed');
    await new Promise(resolve => setTimeout(resolve, 1100));
    checked(await freshMfaClient.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(factor.totp.secret) }), 'post_enrollment_totp_verification_failed');
    mfaSession = checked(await freshMfaClient.auth.getSession(), 'fresh_totp_session_missing').session;
    mfaClaims = checked(await freshMfaClient.auth.getClaims(mfaSession.access_token), 'fresh_totp_claims_verification_failed').claims;
    report.claims.totp = sanitizedClaims(mfaClaims);
    record('totp_provider_claims_verified', report.claims.totp.aal === 'aal2' && report.claims.totp.amr.some(item => item.method === 'totp'));
    if (!providerOnly) {
      phase = 'aal2_admin_boundary';
      const allowed = await invoke(mfaSession.access_token, 'admin-list-users');
      record('fresh_totp_admin_aal2_allowed', allowed.status === 200 && Array.isArray(allowed.body.users), { httpStatus: allowed.status });
    }
    phase = 'verified_factor_replacement';
    checked(await service.auth.admin.mfa.deleteFactor({ userId: identities[0].id, id: factor.id }), 'old_factor_delete_failed');
    const replacementClient = createClient(URL, anon, options);
    checked(await replacementClient.auth.signInWithPassword({ email: identities[0].email, password }), 'replacement_password_signin_failed');
    const replacementFactor = checked(await replacementClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Temporary replacement qualification' }), 'replacement_totp_enrollment_failed');
    await new Promise(resolve => setTimeout(resolve, 1100));
    checked(await replacementClient.auth.mfa.challengeAndVerify({ factorId: replacementFactor.id, code: totpCode(replacementFactor.totp.secret) }), 'replacement_totp_verify_failed');
    await new Promise(resolve => setTimeout(resolve, 1100));
    checked(await replacementClient.auth.mfa.challengeAndVerify({ factorId: replacementFactor.id, code: totpCode(replacementFactor.totp.secret) }), 'replacement_distinct_second_verify_failed');
    const freshReplacementClient = createClient(URL, anon, options);
    checked(await freshReplacementClient.auth.signInWithPassword({ email: identities[0].email, password }), 'replacement_fresh_password_signin_failed');
    await new Promise(resolve => setTimeout(resolve, 1100));
    checked(await freshReplacementClient.auth.mfa.challengeAndVerify({ factorId: replacementFactor.id, code: totpCode(replacementFactor.totp.secret) }), 'replacement_fresh_totp_verification_failed');
    const replacementSession = checked(await freshReplacementClient.auth.getSession(), 'replacement_session_missing').session;
    const replacementClaims = checked(await freshReplacementClient.auth.getClaims(replacementSession.access_token), 'replacement_claims_verification_failed').claims;
    report.claims.replacementTotp = sanitizedClaims(replacementClaims);
    const oldTokenUser = await service.auth.getUser(mfaSession.access_token);
    report.factorReplacement = { oldAal2TokenStillAcceptedByProvider: !oldTokenUser.error && !!oldTokenUser.data?.user, replacementVerifiedTotpPresent: oldTokenUser.data?.user?.factors?.some(item => item.factor_type === 'totp' && item.status === 'verified') === true };
    record('replacement_totp_claims_verified', report.claims.replacementTotp.aal === 'aal2' && report.claims.replacementTotp.amr.some(item => item.method === 'totp'));
    if (!providerOnly) {
      phase = 'replaced_factor_old_token_boundary';
      const stale = await invoke(mfaSession.access_token, 'admin-list-users');
      record('old_aal2_token_after_factor_replacement_denied', [401,403].includes(stale.status) && !Array.isArray(stale.body.users), { httpStatus: stale.status });
      const current = await invoke(replacementSession.access_token, 'admin-list-users');
      record('replacement_factor_fresh_aal2_allowed', current.status === 200 && Array.isArray(current.body.users), { httpStatus: current.status });
      phase = 'block_unblock_session_cut';
      const anotherClient = createClient(URL, anon, options);
      const anotherSession = checked(await anotherClient.auth.signInWithPassword({ email: identities[1].email, password }), 'parallel_password_signin_failed').session;
      const sessionCount = await service.rpc('codevalanche_sessions', { p_user_id: identities[1].id }, { count: 'exact' });
      record('session_rpc_exact_count_supported', !sessionCount.error && Number.isSafeInteger(sessionCount.count) && sessionCount.count === sessionCount.data?.length);
      const blocked = await invoke(replacementSession.access_token, 'admin-block-user', { userId: identities[1].id });
      record('synthetic_user_blocked_with_session_cut', blocked.status === 200, { httpStatus: blocked.status });
      const duringBlock = await invoke(secondSession.access_token, 'get-account');
      record('blocked_old_session_denied', [401,403].includes(duringBlock.status), { httpStatus: duringBlock.status });
      const unblocked = await invoke(replacementSession.access_token, 'admin-unblock-user', { userId: identities[1].id });
      record('synthetic_user_unblocked', unblocked.status === 200, { httpStatus: unblocked.status });
      for (const [index, session] of [secondSession, anotherSession].entries()) {
        const old = await invoke(session.access_token, 'get-account');
        record(`old_session_${index + 1}_stays_denied_after_unblock`, old.status === 401, { httpStatus: old.status });
      }
      const newLogin = createClient(URL, anon, options);
      const newSession = checked(await newLogin.auth.signInWithPassword({ email: identities[1].email, password }), 'post_unblock_password_signin_failed').session;
      const admitted = await invoke(newSession.access_token, 'get-account');
      record('fresh_post_unblock_session_allowed', admitted.status === 200 && admitted.body.userId === identities[1].id, { httpStatus: admitted.status });
    }
    phase = 'recovery_otp_provider_shape';
    const link = checked(await service.auth.admin.generateLink({ type: 'recovery', email: identities[1].email }), 'recovery_link_generation_failed');
    const recovery = createClient(URL, anon, options);
    const recoverySession = checked(await recovery.auth.verifyOtp({ type: 'recovery', token_hash: link.properties.hashed_token }), 'recovery_otp_verification_failed').session;
    const recoveryClaims = checked(await recovery.auth.getClaims(recoverySession.access_token), 'recovery_claims_verification_failed').claims;
    report.claims.recoveryOtp = sanitizedClaims(recoveryClaims);
    record('synthetic_recovery_otp_claims_verified', report.claims.recoveryOtp.aal === 'aal1' && report.claims.recoveryOtp.amr.some(item => item.method === 'otp'));
    if (!providerOnly) {
      phase = 'recovery_deletion_denial';
      const recoveryDelete = await invoke(recoverySession.access_token, 'request-deletion', { confirmation: 'DELETE' });
      record('otp_only_deletion_denied', recoveryDelete.status === 403, { httpStatus: recoveryDelete.status });
    }
    report.status = report.checks.every(item => item.pass) ? 'passed' : 'failed';
  } catch (error) { report.status = 'failed'; report.failedPhase = phase; }
  finally {
    if (service && created.length) {
      let cleanup = true;
      for (const id of created) {
        const deleted = await service.auth.admin.deleteUser(id);
        if (deleted.error) cleanup = false;
      }
      const buckets = created.flatMap(id => [`account:${id}`, `feedback:${id}`]);
      if ((await service.from('codevalanche_rate_limits').delete().in('bucket', buckets)).error) cleanup = false;
      for (const id of created) {
        const exists = await service.auth.admin.getUserById(id);
        if (exists.data?.user) cleanup = false;
      }
      report.cleanupComplete = cleanup;
      if (!cleanup) report.status = 'failed';
    } else report.cleanupComplete = created.length === 0;
  }
  report.passed = report.checks.filter(item => item.pass).length;
  report.total = report.checks.length;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === 'passed' && report.cleanupComplete ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--provider-only')) { process.stderr.write('qualification_arguments_invalid\n'); process.exitCode = 1; }
  else main({ providerOnly: process.argv.includes('--provider-only') }).then(code => { process.exitCode = code; }).catch(() => { process.stderr.write('qualification_failed\n'); process.exitCode = 1; });
}
