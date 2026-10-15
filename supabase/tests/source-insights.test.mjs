import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqlFixture } from './sqlHarness.mjs';
import { accountReadout } from '../functions/_shared/accountReadouts.ts';
import { acceptAnalyticsEvent } from '../functions/_shared/analytics.ts';
import { importSecurityEvents } from '../functions/_shared/securityEvent.ts';
import { deliverNotification, notificationStore } from '../functions/_shared/notificationDelivery.ts';

const uid = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const window = { userId: uid, from: '2026-10-24T21:00:00Z', to: '2026-10-25T04:00:00Z', timeZone: 'Europe/Bucharest', includeSources: true };
async function fixture() {
  const db = await createSqlFixture();
  await db.query('insert into auth.users(id,created_at) values($1,$2)', [uid, window.from]);
  await db.query('insert into public.codevalanche_account_state(user_id,analytics_consent,consent_generation) values($1,true,2)', [uid]);
  const service = { rpc: async (name, args) => {
    try {
      const keys = Object.keys(args);
      return { data: (await db.query(`select * from public.${name}(${keys.map((key,i) => `${key} => $${i+1}`).join(',')})`, Object.values(args))).rows, error: null };
    } catch (error) { return { data: null, error }; }
  } };
  const read = (body = {}, enabled = true, role = 'support_readonly') => accountReadout('admin.analytics.summary', { ...window, ...body }, { principal: { userId: uid }, admin: { role }, service, sourceInsightsEnabled: enabled });
  const readConfigured = () => accountReadout('admin.analytics.summary', window, {principal:{userId:uid},admin:{role:'support_readonly'},service});
  return { db, service, read, readConfigured };
}

test('source insights require explicit server opt-in and retain the legacy response without a request opt-in', async () => {
  const { db, read, readConfigured } = await fixture();
  const previousDeno = globalThis.Deno;
  try {
    assert.equal((await read({}, false)).sourceInsights?.status, 'disabled');
    assert.equal(Object.hasOwn(await read({ includeSources: undefined }), 'sourceInsights'), false);
    assert.equal((await readConfigured()).sourceInsights.status, 'disabled');
    globalThis.Deno = {env:{get:name => name === 'ACCOUNT_SOURCE_INSIGHTS_ENABLED' ? 'true' : undefined}};
    assert.equal((await readConfigured()).sourceInsights.status, 'ready');
  } finally { if (previousDeno === undefined) delete globalThis.Deno; else globalThis.Deno = previousDeno; await db.close(); }
});

test('source readout aggregates the full interval, deduplicated ingestion and separate failed login/password signals', async () => {
  const { db, service, read } = await fixture();
  try {
    const events = [
      { id: 'login-1', action: 'login', user_id: uid, session_id: sid, created_at: window.from },
      { id: 'failed-1', action: 'login_failed', user_id: uid, created_at: '2026-10-25T01:00:00Z' },
      { id: 'outside', action: 'login_failed', user_id: uid, created_at: window.to },
    ];
    await importSecurityEvents(service, events, 'cursor-1');
    await importSecurityEvents(service, events, 'cursor-1');
    await db.query("insert into public.codevalanche_security_events(source,occurred_at,user_id,event_name,outcome) values('password_hook',$1,$2,'password_invalid','password_refused')", [window.from, uid]);
    await db.query("insert into public.codevalanche_analytics_v2(event_id,user_id,event_name,platform,app_version,installation_id,occurred_at,outcome,source_quality,consent_generation) select gen_random_uuid(),$1,'run_finished','windows','fixture',gen_random_uuid(),'2026-10-25T00:30:00Z','success','unconfirmed',2 from generate_series(1,1101)", [uid]);
    await db.query("insert into public.codevalanche_analytics_v2 values(gen_random_uuid(),$1,'app_opened','web','fixture',gen_random_uuid(),'2026-10-25T01:30:00Z',now(),null,'unconfirmed',2,null,null,null)", [uid]);
    const { sourceInsights: s } = await read();
    assert.equal(s.status, 'ready');
    assert.equal(s.security.observedLoginSuccesses, 1);
    assert.equal(s.security.observedLoginFailures, 1);
    assert.equal(s.security.observedPasswordRefusals, 1);
    assert.equal(s.security.totalLoginFailures, null);
    assert.equal(s.activity.observedEvents, 1102);
    assert.equal(s.activity.observedRunSuccesses, 1101);
    assert.equal(s.activity.verifiedSuccessfulRuns, null);
    assert.equal(s.activity.allNativeRunsCovered, false);
    assert.equal(s.activity.hours.length, 2);
    assert.deepEqual(s.activity.hours.map(h => h.startUtc), ['2026-10-25T00:00:00+00:00','2026-10-25T01:00:00+00:00']);
    assert.deepEqual(s.activity.hours.map(h => h.localHour), ['2026-10-25 03:00','2026-10-25 03:00']);
    assert.equal(s.activity.days.length, 1);
    assert.equal(s.activity.days[0].observedEvents, 1102);
    assert.equal(s.notifications.signupCreated, 1);
    assert.equal(s.notifications.delivered, 0);
  } finally { await db.close(); }
});

test('new account alert uses the existing durable adapter and exposes unconfigured/retry states without false delivery', async () => {
  const { db, service, read } = await fixture();
  try {
    const id = (await db.query("select id from public.codevalanche_notification_outbox where event_type='signup_created' and user_id=$1", [uid])).rows[0].id;
    const store = notificationStore(service);
    assert.equal((await deliverNotification(id, { store, channel: null })).state, 'not_configured');
    assert.equal((await read()).sourceInsights.notifications.notConfigured, 1);
    await db.query("update public.codevalanche_notification_outbox set state='queued',next_attempt_at=now()-interval '1 second' where id=$1", [id]);
    assert.equal((await deliverNotification(id, { store, channel: { send: async () => { throw new Error('synthetic adapter unavailable'); } } })).state, 'retry');
    const s = (await read()).sourceInsights;
    assert.equal(s.notifications.retry, 1);
    assert.equal(s.notifications.delivered, 0);
    assert.equal(s.notifications.signupCreated, 1);
  } finally { await db.close(); }
});

test('withdrawn consent leaves activity unknown while security remains readable; Guest cannot ingest', async () => {
  const { db, service, read } = await fixture();
  try {
    await db.query('update public.codevalanche_account_state set analytics_consent=false,consent_generation=3 where user_id=$1', [uid]);
    const event = { eventId: crypto.randomUUID(), eventName: 'app_opened', platform: 'windows', appVersion: 'fixture', installationId: sid, occurredAt: new Date().toISOString() };
    assert.equal((await acceptAnalyticsEvent({ userId: uid }, event, 2, service)).accepted, false);
    assert.equal((await acceptAnalyticsEvent({ userId: sid }, event, 2, service)).accepted, false);
    const s = (await read()).sourceInsights;
    assert.equal(s.activity.status, 'consent_disabled');
    assert.equal(s.activity.observedEvents, null);
    assert.deepEqual(s.activity.hours, []);
    assert.equal(s.security.scope, 'application_security_store');
    await assert.rejects(() => read({}, true, 'viewer'), /account_forbidden/);
    await assert.rejects(() => read({ timeZone: 'Invalid/Zone' }), /invalid_fields/);
    await assert.rejects(() => read({from:1,to:2}), /invalid_fields/);
  } finally { await db.close(); }
});

test('source readout preserves existing receipt outcomes without promoting renderer observations or leaking another account', async () => {
  const { db, read } = await fixture();
  try {
    await db.query("insert into public.codevalanche_native_ledger_producers(issuer,subject,key_fingerprint,qualified) values('fixture','fixture',$1,true)", ['a'.repeat(64)]);
    // Database-owner fixture only: a raw receipt is unconfirmed until an exact
    // immutable acceptance marker exists. This does not qualify a live producer.
    const receipt = {receiptId:crypto.randomUUID(),userId:uid,sessionId:sid,runId:'run_fixture',projectId:'prj_'+'a'.repeat(32),outcome:'failed',occurredAt:window.from,consentGeneration:2,nativeGeneration:1,policyVersion:1};
    await db.query("insert into public.codevalanche_native_ledger_receipts(receipt_id,user_id,session_id,run_id,project_id,outcome,occurred_at,consent_generation,native_generation,policy_version,issuer,subject,key_fingerprint,binding) values($1,$2,$3,$4,$5,$6,$7,2,1,1,'fixture','fixture',$8,$9)", [receipt.receiptId,uid,sid,receipt.runId,receipt.projectId,receipt.outcome,receipt.occurredAt,'a'.repeat(64),receipt]);
    assert.equal((await read()).sourceInsights.activity.verifiedFailedRuns, 0, 'raw legacy receipt cannot become a verified outcome');
    await db.query("insert into public.codevalanche_native_receipt_ownership(receipt_id,owner_user_id,project_id,binding_version,issuer,subject,key_fingerprint,receipt_binding) values($1,$2,$3,1,'fixture','fixture',$4,$5)", [receipt.receiptId,uid,receipt.projectId,'a'.repeat(64),receipt]);
    await db.query('insert into auth.users(id,created_at) values($1,$2)', [sid, window.from]);
    await db.query('insert into public.codevalanche_account_state(user_id,analytics_consent) values($1,true)', [sid]);
    await db.query("insert into public.codevalanche_security_events(source,occurred_at,user_id,event_name,outcome) values('provider_audit',$1,$2,'login_failed','failed')", [window.from, sid]);
    const { sourceInsights: s } = await read();
    assert.equal(s.activity.verifiedFailedRuns, 1);
    assert.equal(s.activity.verifiedSuccessfulRuns, 0);
    assert.equal(s.activity.observedRunFailures, 0);
    assert.equal(s.activity.actualNativeProducer, 'unqualified');
    assert.equal(s.activity.allNativeRunsCovered, false);
    assert.equal(s.security.observedLoginFailures, 0);
    assert.equal(s.notifications.signupCreated, 1);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.codevalanche_source_insights(uuid,timestamptz,timestamptz,text)','execute') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
