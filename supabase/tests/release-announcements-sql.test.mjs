import test from 'node:test';import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';

const RELEASE={version:'1.1.1',date:'2026-10-29',copy:{en:{headline:'H',summary:'S',sections:[{title:'T',body:'B'}]}}};
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',E='55555555-5555-4555-8555-555555555555';

async function seed(db){
 // A active reader, B inactive reader, C unconfirmed, D blocked, E refused at sign-up.
 await db.query(`insert into auth.users(id,email,email_confirmed_at,last_sign_in_at,raw_user_meta_data) values
  ($1,'a@example.test',now(),now(),'{"locale":"ro"}'),($2,'b@example.test',now(),now()-interval '60 days','{"locale":"xx"}'),
  ($3,'c@example.test',null,now(),'{}'),($4,'d@example.test',now(),now(),'{}'),($5,'e@example.test',now(),now(),'{}')`,[A,B,C,D,E]);
 await db.query("insert into public.codevalanche_account_state(user_id,blocked) values($1,true)",[D]);
 await db.query("insert into public.codevalanche_release_email_preferences(user_id,opted_in) values($1,false)",[E]);
}
async function asWorker(db,sql,args){await db.exec('set role codevalanche_release_email_worker');try{return (await db.query(sql,args)).rows}finally{await db.exec('reset role')}}

test('client roles cannot touch release email tables or functions',async()=>{const db=await createSqlFixture();try{
 for(const role of ['anon','authenticated','codevalanche_release_email_worker']){
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select * from public.codevalanche_release_campaigns'),/permission denied/);
  await assert.rejects(()=>db.query('select * from public.codevalanche_release_email_preferences'),/permission denied/);
  await assert.rejects(()=>db.query('select * from public.codevalanche_release_campaign_recipients'),/permission denied/);
  await db.exec('reset role');
 }
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select * from public.codevalanche_release_email_unsubscribe($1)',[A]),/permission denied/);
  await assert.rejects(()=>db.query("select * from public.codevalanche_release_campaign_approve($1,'SEND 1.1.1')",[A]),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role codevalanche_release_email_worker');
 await assert.rejects(()=>db.query('select * from public.codevalanche_release_email_preference($1,true)',[A]),/permission denied/);
 await db.exec('reset role');
}finally{await db.close()}});

test('a campaign cannot be approved before a test send or without the typed phrase',async()=>{const db=await createSqlFixture();try{
 await seed(db);
 const [c]=await asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'all_accounts')",[RELEASE]);
 await assert.rejects(()=>asWorker(db,"select * from public.codevalanche_release_campaign_approve($1,'SEND 1.1.1')",[c.id]),/campaign_not_tested/);
 await asWorker(db,'select * from public.codevalanche_release_campaign_mark_tested($1)',[c.id]);
 await assert.rejects(()=>asWorker(db,"select * from public.codevalanche_release_campaign_approve($1,'da')",[c.id]),/confirmation_mismatch/);
 // Editing the copy after the test sends it back to draft.
 await asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'all_accounts')",[RELEASE]);
 await assert.rejects(()=>asWorker(db,"select * from public.codevalanche_release_campaign_approve($1,'SEND 1.1.1')",[c.id]),/campaign_not_tested/);
 assert.equal((await db.query('select count(*)::int n from public.codevalanche_release_campaign_recipients')).rows[0].n,0);
}finally{await db.close()}});

test('approval freezes only eligible readers, with the come-back variant',async()=>{const db=await createSqlFixture();try{
 await seed(db);
 const [c]=await asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'all_accounts')",[RELEASE]);
 const [aud]=await asWorker(db,'select * from public.codevalanche_release_campaign_audience($1)',[c.id]);
 assert.deepEqual(aud,{total:2,inactive:1});
 await asWorker(db,'select * from public.codevalanche_release_campaign_mark_tested($1)',[c.id]);
 const [r]=await asWorker(db,"select * from public.codevalanche_release_campaign_approve($1,'SEND 1.1.1')",[c.id]);
 assert.equal(r.recipients,2);
 const rows=(await db.query('select user_id,variant from public.codevalanche_release_campaign_recipients order by user_id')).rows;
 assert.deepEqual(rows,[{user_id:A,variant:'active'},{user_id:B,variant:'inactive'}]);
 await assert.rejects(()=>asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'all_accounts')",[RELEASE]),/campaign_locked/);
}finally{await db.close()}});

test('opted_in audience reaches only readers who asked for update emails',async()=>{const db=await createSqlFixture();try{
 await seed(db);
 await db.exec('set role service_role');await db.query('select * from public.codevalanche_release_email_preference($1,true)',[B]);await db.exec('reset role');
 const [c]=await asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'opted_in')",[RELEASE]);
 const [aud]=await asWorker(db,'select * from public.codevalanche_release_campaign_audience($1)',[c.id]);
 assert.equal(aud.total,1);
}finally{await db.close()}});

test('claims respect the daily cap, skip readers who unsubscribed after approval and finish the campaign',async()=>{const db=await createSqlFixture();try{
 await seed(db);
 const [c]=await asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'all_accounts')",[RELEASE]);
 await asWorker(db,'select * from public.codevalanche_release_campaign_mark_tested($1)',[c.id]);
 await asWorker(db,"select * from public.codevalanche_release_campaign_approve($1,'SEND 1.1.1')",[c.id]);
 const lease='99999999-9999-4999-8999-999999999999';
 let batch=await asWorker(db,'select * from public.codevalanche_release_campaign_claim($1,$2,10,1)',[c.id,lease]);
 assert.equal(batch.length,1,'daily cap of 1 lets one reader through');
 assert.equal(batch[0].email,'a@example.test');
 await asWorker(db,"select * from public.codevalanche_release_campaign_settle($1,$2,$3,true,'re_1')",[c.id,batch[0].user_id,lease]);
 batch=await asWorker(db,'select * from public.codevalanche_release_campaign_claim($1,$2,10,1)',[c.id,lease]);
 assert.equal(batch.length,0,'cap reached');
 assert.deepEqual(await asWorker(db,'select * from public.codevalanche_release_email_unsubscribe($1)',[B]),[{unsubscribed:true}]);
 batch=await asWorker(db,'select * from public.codevalanche_release_campaign_claim($1,$2,10,100)',[c.id,lease]);
 assert.equal(batch.length,0,'unsubscribed reader is skipped, not mailed');
 const [s]=await asWorker(db,'select * from public.codevalanche_release_campaign_summary($1)',[c.id]);
 assert.deepEqual(s,{campaign_state:'sending',queued:0,sent:1,failed:0,skipped:1});
}finally{await db.close()}});

test('a failed send retries twice and then stops; the last settle completes the campaign',async()=>{const db=await createSqlFixture();try{
 await seed(db);
 const [c]=await asWorker(db,"select * from public.codevalanche_release_campaign_save('1.1.1',$1,'opted_in')",[RELEASE]);
 await db.exec('set role service_role');await db.query('select * from public.codevalanche_release_email_preference($1,true)',[A]);await db.exec('reset role');
 await asWorker(db,'select * from public.codevalanche_release_campaign_mark_tested($1)',[c.id]);
 await asWorker(db,"select * from public.codevalanche_release_campaign_approve($1,'SEND 1.1.1')",[c.id]);
 const lease='99999999-9999-4999-8999-999999999999';
 for(const expected of ['queued','queued','failed']){
  const [row]=await asWorker(db,'select * from public.codevalanche_release_campaign_claim($1,$2,10,100)',[c.id,lease]);
  const [settled]=await asWorker(db,'select * from public.codevalanche_release_campaign_settle($1,$2,$3,false,null)',[c.id,row.user_id,lease]);
  assert.equal(settled.state,expected);
 }
 const [s]=await asWorker(db,'select * from public.codevalanche_release_campaign_summary($1)',[c.id]);
 assert.equal(s.campaign_state,'sent');assert.equal(s.failed,1);
}finally{await db.close()}});
