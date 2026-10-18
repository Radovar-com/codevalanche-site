import test from 'node:test';
import assert from 'node:assert/strict';
import { totpCode, sanitizedClaims } from '../ops/security-operations-auth-qualification.mjs';

test('TOTP matches an independent RFC6238 SHA1 test vector', () => {
  assert.equal(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
});

test('claim evidence removes identity, session identifiers and raw token claims', () => {
  const evidence = sanitizedClaims({ aud: 'authenticated', iss: 'https://umpybznthsfehmdvmfly.supabase.co/auth/v1', role: 'authenticated', aal: 'aal2', amr: [{ method: 'password', timestamp: 100 }, { method: 'totp', timestamp: 105 }], sub: 'private-user-id', email: 'private-email', session_id: 'private-session-id' }, 110000);
  assert.deepEqual(evidence.amr, [{ method: 'password', ageSeconds: 10 }, { method: 'totp', ageSeconds: 5 }]);
  assert.equal(evidence.audType, 'string');
  assert.equal(evidence.issuerMatchesStaging, true);
  assert.doesNotMatch(JSON.stringify(evidence), /private|session_id|email|sub/);
});

test('unexpected audience or AMR payloads are represented without echoing arbitrary strings', () => {
  const evidence = sanitizedClaims({ aud: ['authenticated', 'secret-audience'], iss: 'secret-issuer', role: 'secret-role', aal: 'secret-aal', amr: [{ method: 'secret-method', timestamp: 'secret-time' }], token_use: 'secret-use' }, 110000);
  assert.equal(evidence.audienceAuthenticatedOnly, false);
  assert.equal(evidence.issuerMatchesStaging, false);
  assert.doesNotMatch(JSON.stringify(evidence), /secret/);
});
