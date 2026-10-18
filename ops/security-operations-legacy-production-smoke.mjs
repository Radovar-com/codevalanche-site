import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const endpoint = 'https://hvevaxsfeyiikjhcsafi.supabase.co/functions/v1/codevalanche-account';
const sensitiveKeys = new Set(['user', 'users', 'userId', 'email', 'feedback', 'events', 'session_id', 'sessionId', 'identities', 'factors', 'sessions', 'access_token', 'refresh_token']);
function hasSensitiveKeys(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => sensitiveKeys.has(key) || hasSensitiveKeys(child));
}

export async function main(phase) {
  if (!['preflight', 'postdeploy', 'rollback'].includes(phase)) throw new Error('invalid_smoke_phase');
  const config = await readFile(new URL('src/config.js', root), 'utf8');
  const key = config.match(/supabasePublishableKey:\s*["']([^"']+)["']/)?.[1];
  const v1 = /accountServer:\s*["']v1["']/.test(config);
  const disabled = /CODEVALANCHE_ANALYTICS\s*=\s*\{[^}]*enabled:\s*false/.test(config);
  if (!key || !v1 || !disabled) throw new Error('public_config_not_qualified');
  const cases = [
    { name: 'missing_authorization_get', method: 'GET', expected: 401 },
    { name: 'missing_authorization_post', method: 'POST', expected: 401, body: JSON.stringify({ action: 'get-account' }) },
    { name: 'invalid_synthetic_token', method: 'GET', expected: 401, headers: { authorization: 'Bearer not-a-valid-jwt' } },
    { name: 'disallowed_origin', method: 'GET', expected: 403, headers: { origin: 'https://untrusted.invalid' } },
    { name: 'unsupported_method', method: 'PUT', expected: 405 },
    { name: 'canonical_preflight', method: 'OPTIONS', expected: 204, headers: { origin: 'https://codevalanche.com' } },
  ];
  const checks = [];
  for (const item of cases) {
    try {
      const response = await fetch(endpoint, { method: item.method, redirect: 'error', credentials: 'omit', headers: { apikey: key, 'content-type': 'application/json', ...item.headers }, body: item.body, signal: AbortSignal.timeout(20_000) });
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      const noSensitiveData = !hasSensitiveKeys(body);
      const noStore = /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control') ?? '');
      const cors = item.name !== 'canonical_preflight' || response.headers.get('access-control-allow-origin') === 'https://codevalanche.com';
      const denialShape = item.expected === 204 ? text === '' : !!body && typeof body.error === 'string';
      checks.push({ name: item.name, method: item.method, expectedStatus: item.expected, actualStatus: response.status, noSensitiveData, noStore, expectedCors: cors, denialShape, pass: response.status === item.expected && noSensitiveData && noStore && cors && denialShape });
    } catch { checks.push({ name: item.name, method: item.method, expectedStatus: item.expected, actualStatus: null, pass: false, reason: 'negative_smoke_unavailable' }); }
  }
  const report = { version: 1, projectRef: 'hvevaxsfeyiikjhcsafi', function: 'codevalanche-account', phase, observedAt: new Date().toISOString(), authenticatedSessionsUsed: false, realAccountsUsed: false, accountOrEventWritesAttempted: false, emailsSent: false, publicAccountContractV1: v1, websiteAnalyticsDisabled: disabled, passed: checks.filter(item => item.pass).length, total: checks.length, checks };
  await writeFile(new URL(`ops/security-operations-legacy-production-${phase}-smoke-20261018.json`, root), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return checks.every(item => item.pass) ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).then(code => { process.exitCode = code; }).catch(() => { process.stderr.write('legacy_production_negative_smoke_failed\n'); process.exitCode = 1; });
}
