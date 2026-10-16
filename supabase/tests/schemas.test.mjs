import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACCOUNT_REQUEST_SCHEMAS, validateAccountRequest } from '../functions/codevalanche-account/schemas.mjs';

const source = await readFile(new URL('../functions/codevalanche-account/index.ts', import.meta.url), 'utf8');
const id = '22222222-2222-4222-8222-222222222222';

test('every action the handler answers has a request schema', () => {
  // The handler source quotes action names with either quote style.
  const cases = [...source.matchAll(/case ['"]([a-z-]+)['"]/g)].map(m => m[1]);
  assert.ok(cases.length >= 13, `found ${cases.length} handler actions`);
  for (const action of cases) assert.ok(Object.hasOwn(ACCOUNT_REQUEST_SCHEMAS, action), `${action} has a schema`);
  // The v1 admin actions are aliased to admin.* operations and keep their schemas.
  for (const action of ['admin-list-users', 'admin-block-user', 'admin-unblock-user', 'admin-feedback', 'admin-analytics']) assert.match(source, new RegExp(`["']${action}["']`), action);
  // API v2 aliases of v1 actions and the operations the account page calls are schema-checked too.
  const aliases = source.slice(source.indexOf('const aliases'), source.indexOf('};', source.indexOf('const aliases')));
  const v2 = [...aliases.matchAll(/"([a-z]+\.[a-z.-]+)"\s*:/g)].map(m => m[1]);
  assert.ok(v2.length >= 7, `found ${v2.length} v2 aliases`);
  for (const operation of [...v2, 'analytics.consent', 'security.activity', 'security.mfa.remove-authorize', 'operator.oauth.details', 'operator.oauth.approve', 'operator.oauth.claim']) assert.ok(Object.hasOwn(ACCOUNT_REQUEST_SCHEMAS, operation), `${operation} has a schema`);
  assert.match(source, /validateAccountRequest\(body\)/, 'the handler validates before dispatch');
  const firstAction = Math.min(...['switch (body.action)', 'switch(body.action)', 'operatorOAuthConsent({', 'const operation = adminAliases'].map(marker => source.indexOf(marker)).filter(index => index >= 0));
  assert.ok(source.indexOf('validateAccountRequest(body)') < firstAction, 'validation runs before any action');
});

test('valid requests from website and installed clients pass, extra fields ignored', () => {
  for (const body of [
    { action: 'get-account' },
    { action: 'get-account', apiVersion: 2, requestId: id },
    { action: 'update-profile', displayName: 'Ana', bio: 'line one\nline two' },
    { action: 'update-profile', bio: '' },
    { action: 'revoke-session', sessionId: id },
    { action: 'request-deletion', confirmation: 'DELETE' },
    { action: 'consent', analytics: false },
    { action: 'feedback', category: 'idea', message: 'x'.repeat(4000) },
    { action: 'event', eventId: id, eventName: 'app_opened', platform: 'windows', consent: true, installationId: 'abc' },
    { action: 'admin-list-users' },
    { action: 'admin-list-users', page: 3 },
    { action: 'admin-block-user', userId: id },
    { action: 'account.overview', apiVersion: 2 }, // unknown: left to the handler
    {},
  ]) assert.equal(validateAccountRequest(body), null, JSON.stringify(body).slice(0, 80));
});

test('wrong shapes are refused with the answer the handler already used', () => {
  const cases = [
    [[], 400, 'Invalid body'],
    [{ action: { x: 1 } }, 400, 'Unknown action'],
    [{ action: 'x'.repeat(65) }, 400, 'Unknown action'],
    [{ action: 'update-profile', displayName: 'a\u0000b' }, 400, 'Invalid profile'],
    [{ action: 'update-profile', displayName: 'two\nlines' }, 400, 'Invalid profile'],
    [{ action: 'update-profile', displayName: ['Ana'] }, 400, 'Invalid profile'],
    [{ action: 'update-profile', bio: 'x'.repeat(501) }, 400, 'Invalid profile'],
    [{ action: 'revoke-session', sessionId: [id] }, 404, 'Session not found'],
    [{ action: 'request-deletion', confirmation: { value: 'DELETE' } }, 400, 'Type DELETE to confirm'],
    [{ action: 'consent', analytics: 'true' }, 400, 'Invalid consent'],
    [{ action: 'feedback', category: 'bug', message: '   ' }, 400, 'Invalid feedback'],
    [{ action: 'feedback', category: 'spam', message: 'hi' }, 400, 'Invalid feedback'],
    [{ action: 'event', eventId: 7, eventName: 'app_opened', platform: 'web' }, 400, 'Invalid event'],
    [{ action: 'event', eventId: id, eventName: 'app_opened', platform: 'web', consent: 'yes' }, 400, 'Invalid event'],
    [{ action: 'admin-list-users', page: 'abc' }, 400, 'Invalid page'],
    [{ action: 'admin-list-users', page: 1.5 }, 400, 'Invalid page'],
    [{ action: 'admin-block-user', userId: `${id}\n` }, 400, 'Invalid target user'],
  ];
  for (const [body, status, error] of cases) assert.deepEqual(validateAccountRequest(body), { status, error }, JSON.stringify(body).slice(0, 80));
});
