import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqlFixture } from './sqlHarness.mjs';
import { issueConsentReceipt, revokeConsentReceipt, hashCapability } from '../functions/_shared/websiteAnalyticsConsent.ts';
import { validateContractDto } from '../functions/_shared/websiteAnalyticsContract.ts';

const principal='00000009-0000-4000-8000-000000000009';
function service(db){return {async rpc(name,args){try {const keys=Object.keys(args);const result=await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')})`,keys.map(k=>args[k]));return {data:result.rows,error:null};}catch(error){return {data:null,error};}}};}
const input=(overrides={})=>({siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false},...overrides});
const context=db=>({origin:'https://codevalanche.com',service:service(db)});

test('receipt capabilities are hashed, origin scoped, and browser choice cannot grant account authority',async()=>{
 const db=await createSqlFixture();try {
  const ctx=context(db),receipt=await issueConsentReceipt(input(),ctx);
  assert.equal(validateContractDto('ConsentReceipt',receipt),true);
  const stored=(await db.query('select * from wa_consent_receipts')).rows[0];
  assert.equal(stored.collection_token_hash,await hashCapability(receipt.collectionToken));
  assert.equal(stored.revocation_proof_hash,await hashCapability(receipt.revocationProof));
  assert.equal(JSON.stringify(stored).includes(receipt.collectionToken),false);
  await assert.rejects(issueConsentReceipt(input(),{...ctx,origin:'https://radovar.com'}),/origin_not_allowed/);
  await assert.rejects(issueConsentReceipt(input({purposes:{websiteAnalytics:true,accountAnalytics:true}}),ctx),/invalid_consent/);
  await assert.rejects(issueConsentReceipt({...input(),user_id:principal},ctx),/invalid_fields/);
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query('select * from wa_consent_receipts'),/permission denied/);
   await assert.rejects(db.query('select * from wa_receipt_account_bindings'),/permission denied/);
   await assert.rejects(db.query('delete from wa_receipt_account_bindings'),/permission denied/);
   await assert.rejects(db.query('select wa_revoke_consent_receipt($1,$2,$3,$4)',[receipt.receiptId,1,'0'.repeat(64),'codevalanche']),/permission denied/);
   await assert.rejects(db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[receipt.receiptId,'codevalanche',1,'0'.repeat(64),null]),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});

test('committed revoke invalidates locked receipt, wrong capability fails and retry is idempotent',async()=>{
 const db=await createSqlFixture();try {
  const ctx=context(db),r=await issueConsentReceipt(input(),ctx),token=await hashCapability(r.collectionToken);
  await db.exec('set role service_role');
  await db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[r.receiptId,'codevalanche',1,token,null]);
  await assert.rejects(db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[r.receiptId,'radovar',1,token,null]),/invalid_consent/);
  await assert.rejects(db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[r.receiptId,'codevalanche',2,token,null]),/stale_generation/);
  await assert.rejects(revokeConsentReceipt({receiptId:r.receiptId,generation:1,capability:'wrong_capability_123456789012345678'},ctx),/invalid_consent/);
  const proof={receiptId:r.receiptId,generation:1,capability:r.revocationProof};
  await db.exec('begin');await revokeConsentReceipt(proof,ctx);await db.exec('rollback');
  await db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[r.receiptId,'codevalanche',1,token,null]);
  assert.deepEqual(await revokeConsentReceipt(proof,ctx),{revoked:true,generation:2});
  assert.deepEqual(await revokeConsentReceipt(proof,ctx),{revoked:true,generation:2});
  assert.ok((await db.query('select revoked_at from wa_consent_receipts')).rows[0].revoked_at);
  await assert.rejects(db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[r.receiptId,'codevalanche',1,token,null]),/invalid_consent/);
 }finally{await db.close();}
});

test('P4 binding uses independent generation and rejects account switch and withdrawal regrant',async()=>{
 const db=await createSqlFixture();try {
  await db.query('insert into auth.users(id) values($1)',[principal]);
  await db.query('insert into codevalanche_account_state(user_id,analytics_consent,consent_generation) values($1,true,7)',[principal]);
  const ctx={...context(db),account:{confirmed:true,principalId:principal,consentGeneration:7}};
  const r=await issueConsentReceipt(input({purposes:{websiteAnalytics:true,accountAnalytics:true}}),ctx);
  await db.exec('grant select on wa_receipt_account_bindings to authenticated;set role authenticated');
  assert.equal((await db.query('select count(*)::int n from wa_receipt_account_bindings')).rows[0].n,0);
  await db.exec('reset role;revoke select on wa_receipt_account_bindings from authenticated');
  const args=[r.receiptId,'codevalanche',1,await hashCapability(r.collectionToken),principal];
  await db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',args);
  await assert.rejects(db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[...args.slice(0,4),'00000008-0000-4000-8000-000000000008']),/invalid_consent/);
  await db.query('select codevalanche_analytics_consent($1,false)',[principal]);
  await db.query('select codevalanche_analytics_consent($1,true)',[principal]);
  await assert.rejects(db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',args),/stale_generation/);
  await assert.rejects(issueConsentReceipt(input({purposes:{websiteAnalytics:true,accountAnalytics:true}}),ctx),/stale_generation/);
  assert.equal((await db.query('select count(*)::int n from wa_consent_receipts')).rows[0].n,1);
  // Website collection remains valid despite independent account generation changes.
  await db.query('select wa_lock_consent_receipt($1,$2,$3,$4,$5)',[...args.slice(0,4),null]);
 }finally{await db.close();}
});
