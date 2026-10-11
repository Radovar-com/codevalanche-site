import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqlFixture } from './sqlHarness.mjs';
import { accountReadout } from '../functions/_shared/accountReadouts.ts';
import { deliverNotification, notificationStore } from '../functions/_shared/notificationDelivery.ts';

const userId='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222';
const stamp='2026-10-11T10:10:00.123456Z';
function serviceFor(db) {
  return {rpc:async(name,args={})=>{
    try {const keys=Object.keys(args);return {data:(await db.query(`select * from public.${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')})`,keys.map(key=>args[key]))).rows,error:null};}
    catch(error){return {data:null,error};}
  }};
}
async function page(service,fields={}) {
  return accountReadout('admin.notifications.list',{userId,...fields},{principal:{userId:otherId},service,admin:{role:'support_readonly'}});
}

test('actual durable failed delivery supplies its recorded retry attempt without claiming delivered email',async()=>{
  const db=await createSqlFixture();
  try {
    await db.query('insert into auth.users(id) values($1)',[userId]);
    const id=(await db.query("select id from public.codevalanche_notification_outbox where user_id=$1 and event_type='signup_created'",[userId])).rows[0].id;
    const service=serviceFor(db);
    const result=await deliverNotification(id,{store:notificationStore(service),channel:{send:async()=>{throw Error('synthetic unavailable channel');}}});
    assert.equal(result.state,'retry');
    const expected=(await db.query(`select to_char(next_attempt_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as next_attempt_at from public.codevalanche_notification_outbox where id=$1`,[id])).rows[0].next_attempt_at;
    const row=(await page(service)).items.find(item=>item.id===id);
    assert.equal(row.state,'retry');assert.equal(row.attempts,1);
    assert.equal(row.next_attempt_at,expected);assert.equal(row.delivered_at,null);
    assert.equal(row.inbox_state,'available');
  } finally {await db.close();}
});

test('notification projection emits scheduled attempts only for durable eligible states and filters the exact user',async()=>{
  const db=await createSqlFixture();
  try {
    await db.query('insert into auth.users(id) values($1),($2)',[userId,otherId]);
    await db.exec('delete from public.codevalanche_notification_outbox');
    for(const state of ['queued','retry','sending','delivered','dead_letter','not_configured']) {
      await db.query('insert into public.codevalanche_notification_outbox(event_type,user_id,source_version,payload,state,next_attempt_at,delivered_at) values($1,$2,$1,$3,$1,$4,$4)',[state,userId,'{}',stamp]);
    }
    await db.query("insert into public.codevalanche_notification_outbox(event_type,user_id,source_version,payload,next_attempt_at) values('foreign',$1,'foreign','{}',$2)",[otherId,stamp]);
    const before=(await db.query('select * from public.codevalanche_notification_outbox order by id')).rows;
    const rows=(await page(serviceFor(db))).items;
    assert.equal(rows.length,6);assert.ok(rows.every(row=>row.user_id===userId));
    for(const row of rows) {
      assert.equal(row.next_attempt_at,['queued','retry','sending'].includes(row.state)?stamp:null,row.state);
      assert.equal(row.delivered_at,row.state==='delivered'?stamp:null,row.state);
      assert.equal(row.inbox_state,'available');
    }
    // Queued means a scheduled processing attempt, not a configured sender or delivery guarantee.
    assert.equal(rows.find(row=>row.state==='queued').next_attempt_at,stamp);
    assert.deepEqual((await db.query('select * from public.codevalanche_notification_outbox order by id')).rows,before);
  } finally {await db.close();}
});

test('replacement readout retains database roles and rejects malformed cursors before SQL',async()=>{
  const db=await createSqlFixture();
  try {
    for(const role of ['anon','authenticated','codevalanche_notification_worker']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>db.query("select * from public.codevalanche_readout_page('notifications',null,null,null,10)"),/permission denied/);
      await db.exec('reset role');
    }
    let calls=0;
    await assert.rejects(()=>page({rpc:async()=>{calls++;assert.fail('malformed cursor must not reach SQL');}},{cursor:'malformed_cursor'}),/invalid_fields/);
    assert.equal(calls,0);
  } finally {await db.close();}
});
