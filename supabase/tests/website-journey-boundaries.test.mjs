import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {createWebsiteAnalyticsHandler} from '../functions/website-analytics/index.ts';

test('SQL daily page views and download requests stay idempotent at UTC midnight and both DST changes', async () => {
  const db = await createSqlFixture();
  try {
    await db.exec("set timezone='Pacific/Honolulu'");
    const receipt = crypto.randomUUID();
    await db.query("insert into wa_consent_receipts values($1,'codevalanche','2026-10-15',1,true,false,'2026-01-01Z','2026-06-01Z',null,$2,$2)", [receipt, 'a'.repeat(64)]);
    const times = [
      '2026-03-28T21:59:59Z', '2026-03-28T22:00:00Z',
      '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z',
      '2026-03-29T20:59:59Z', '2026-03-29T21:00:00Z',
      '2026-10-24T20:59:59Z', '2026-10-24T21:00:00Z',
      '2026-10-25T00:59:59Z', '2026-10-25T01:00:00Z',
      '2026-10-25T21:59:59Z', '2026-10-25T22:00:00Z',
      '2026-10-25T23:59:59Z', '2026-10-26T00:00:00Z',
    ];
    for (const time of times) {
      await db.query(`insert into wa_events(site_id,event_id,event_name,occurred_at,event_at,received_at,page_id,page_instance_id,page_version,session_id,anonymous_id,consent_receipt_id,consent_generation,properties,traffic_class)
        values('codevalanche',gen_random_uuid(),'page_viewed',$1,$1,$1,'home',gen_random_uuid(),'fixture',gen_random_uuid(),gen_random_uuid(),$2,1,'{"navigation_type":"initial"}','external')`, [time, receipt]);
      const id = crypto.randomUUID();
      for (let i = 0; i < 2; i++) await db.query("select wa_record_download_request($1,'download_redirected','codevalanche','windows','x64','fixture','fixture',$2)", [id, time]);
    }
    for (let i = 0; i < 2; i++) await db.query("select wa_refresh_website_rollups('2026-10-27T12:00:00Z')");
    const views = (await db.query("select day::text,time_zone,sum(value)::int n from wa_daily_rollups where metric_id='page_views' group by day,time_zone order by time_zone,day")).rows;
    assert.deepEqual(views, [
      {day:'2026-03-28',time_zone:'Europe/Bucharest',n:1}, {day:'2026-03-29',time_zone:'Europe/Bucharest',n:4}, {day:'2026-03-30',time_zone:'Europe/Bucharest',n:1},
      {day:'2026-10-24',time_zone:'Europe/Bucharest',n:1}, {day:'2026-10-25',time_zone:'Europe/Bucharest',n:4}, {day:'2026-10-26',time_zone:'Europe/Bucharest',n:3},
      {day:'2026-03-28',time_zone:'UTC',n:2}, {day:'2026-03-29',time_zone:'UTC',n:4},
      {day:'2026-10-24',time_zone:'UTC',n:2}, {day:'2026-10-25',time_zone:'UTC',n:5}, {day:'2026-10-26',time_zone:'UTC',n:1},
    ]);
    assert.deepEqual((await db.query('select day::text,sum(count)::int n from wa_download_daily group by day order by day')).rows, [
      {day:'2026-03-28',n:2}, {day:'2026-03-29',n:4}, {day:'2026-10-24',n:2}, {day:'2026-10-25',n:5}, {day:'2026-10-26',n:1},
    ]);
  } finally {await db.close();}
});

test('collector persists only a rotating network HMAC, ignoring full UA and spoofed forwarding headers across UTC days', async t => {
  const calls = [];
  const handler = createWebsiteAnalyticsHandler({issuer: 'https://auth.example.test', networkSecret: 'local-fixture-key', service: {rpc: async (name, args) => {
    calls.push({name, args});return {data: 0, error: null};
  }}});
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-10-25T23:59:59Z')});
  const request = () => new Request('https://collector.example.test/v1/unknown', {method:'POST', headers:{origin:'https://codevalanche.com','user-agent':'Full private browser version fixture','x-forwarded-for':'198.51.100.42'}});
  for (const now of ['2026-10-25T23:59:59Z','2026-10-26T00:00:00Z']) {
    t.mock.timers.setTime(Date.parse(now));
    assert.equal((await handler(request(), {remoteAddress:'192.0.2.55'})).status, 404);
  }
  const hashes = calls.filter(c => c.name === 'wa_take_rate_limit').map(c => c.args.p_key_hash);
  assert.equal(hashes.length, 2);assert.notEqual(hashes[0], hashes[1]);
  assert.ok(hashes.every(h => /^[a-f0-9]{64}$/.test(h)));
  for (const forbidden of ['192.0.2.55','198.51.100.42','Full private browser','user-agent','x-forwarded-for']) assert.equal(JSON.stringify(calls).includes(forbidden), false);
});
