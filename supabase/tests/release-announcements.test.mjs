import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {renderReleaseEmail} from '../functions/_shared/releaseEmail.js';
import {runReleaseAction, unsubscribe, unsubscribeToken, verifyUnsubscribeToken, releaseEmailSettings, createResendMailer} from '../functions/_shared/releaseAnnouncements.ts';

const RELEASE={version:'1.1.1',date:'2026-10-29',copy:{
 en:{headline:'All your AIs in one place',summary:'A new home for your AIs.',sections:[1,2,3,4,5].map(i=>({title:`Title ${i}`,body:`Body ${i}`}))},
 ro:{headline:'Toate AI-urile tale',summary:'Un loc nou.',sections:[{title:'Titlu <b>',body:'Corp & text'}]},
 de:{headline:'Alle KIs',summary:'Neu.',sections:[{title:'T',body:'B'}]},
}};
const LINKS={unsubscribeUrl:'https://codevalanche.com/unsubscribe/?t=abc',oneClickUrl:'https://example.supabase.co/functions/v1/release-announcements?unsubscribe=abc'};
const SECRET='s'.repeat(40);
const USER='11111111-1111-4111-8111-111111111111';

function hrefs(html){const out=[];(function walk(n){if(n.tagName==='a')out.push(n.attrs.find(a=>a.name==='href').value);(n.childNodes||[]).forEach(walk)})(parse(html));return out}

test('every reader gets the English copy, whatever other languages the notes have',()=>{
 const mail=renderReleaseEmail(RELEASE,{...LINKS});
 assert.equal(mail.subject,'Codevalanche 1.1.1: All your AIs in one place');
 assert.match(mail.html,/<html lang="en">/);assert.match(mail.html,/Download 1\.1\.1/);
 assert.doesNotMatch(mail.html+mail.text,/Toate|Alle KIs/);
});

test('light and dark mode are both styled, including Outlook dark mode',()=>{
 const {html}=renderReleaseEmail(RELEASE,{...LINKS});
 assert.match(html,/<meta name="color-scheme" content="light dark">/);
 const dark=html.match(/@media \(prefers-color-scheme:dark\)\{(.*)\}\n/)[1];
 const outlook=html.split('\n').find(l=>l.startsWith('[data-ogsc]'));
 for(const cls of ['email-bg','email-card','email-ink','email-muted','email-link','email-rule','email-button','email-logo-light','email-logo-dark']){
  assert.ok(dark.includes(`.${cls}`),`dark mode styles .${cls}`);
  assert.ok(outlook.includes(`.${cls}`),`Outlook dark mode styles .${cls}`);
  assert.ok(html.includes(`class="${cls}`)||html.includes(` ${cls}"`)||html.includes(` ${cls} `),`.${cls} is used`);
 }
});

test('escapes release text and keeps at most four sections',()=>{
 const tricky={...RELEASE,copy:{en:{...RELEASE.copy.en,sections:[{title:'Title <b>',body:'Body & text'}]}}};
 const t=renderReleaseEmail(tricky,{...LINKS});
 assert.match(t.html,/Title &lt;b&gt;/);assert.match(t.html,/Body &amp; text/);
 const en=renderReleaseEmail(RELEASE,{...LINKS});
 assert.match(en.html,/Title 4/);assert.doesNotMatch(en.html,/Title 5/);
});

test('the come-back variant adds the welcome-back line and its own button',()=>{
 const active=renderReleaseEmail(RELEASE,{...LINKS});
 const back=renderReleaseEmail(RELEASE,{inactive:true,...LINKS});
 assert.doesNotMatch(active.html,/It has been a while/);
 assert.match(back.html,/It has been a while/);assert.match(back.html,/Try 1\.1\.1 now/);
 assert.ok(hrefs(back.html).some(h=>h.includes('utm_campaign=release-1.1.1-comeback')));
});

test('every email carries a visible unsubscribe link, a text part and one-click headers',()=>{
 const mail=renderReleaseEmail(RELEASE,{...LINKS});
 assert.ok(hrefs(mail.html).includes(LINKS.unsubscribeUrl));
 assert.match(mail.text,/Unsubscribe: https:\/\/codevalanche\.com\/unsubscribe\/\?t=abc/);
 assert.equal(mail.headers['List-Unsubscribe'],`<${LINKS.oneClickUrl}>`);
 assert.equal(mail.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 for(const h of hrefs(mail.html)) assert.match(h,/^https:\/\/(codevalanche\.com|example\.supabase\.co)\//);
 assert.throws(()=>renderReleaseEmail(RELEASE,{unsubscribeUrl:'http://x.test/',oneClickUrl:LINKS.oneClickUrl}),/release_email_url_invalid/);
});

test('the email never names an internal address',()=>{
 for(const inactive of [false,true]){
  const mail=renderReleaseEmail(RELEASE,{inactive,...LINKS});
  assert.doesNotMatch(mail.html+mail.text,/creator\.support@|creator@radovar/);
 }
});

test('real release notes render without errors',{skip:!process.env.RELEASE_NOTES_JSON},()=>{
 const release=JSON.parse(readFileSync(process.env.RELEASE_NOTES_JSON,'utf8'));
 for(const inactive of [false,true]) renderReleaseEmail(release,{inactive,...LINKS});
});

test('unsubscribe tokens are signed per reader and refuse tampering',async()=>{
 const token=await unsubscribeToken(SECRET,USER);
 assert.equal(await verifyUnsubscribeToken(SECRET,token),USER);
 assert.equal(await verifyUnsubscribeToken('x'.repeat(40),token),null);
 assert.equal(await verifyUnsubscribeToken(SECRET,token.replace(USER,'22222222-2222-4222-8222-222222222222')),null);
 assert.equal(await verifyUnsubscribeToken(SECRET,'not-a-token'),null);
 await assert.rejects(()=>unsubscribeToken('short',USER),/worker_not_configured/);
});

function fakeService(rows={}){
 const calls=[];
 return {calls,rpc:async(name,args)=>{calls.push([name,args]);const r=rows[name];return {data:typeof r==='function'?r(args):(r??[]),error:null}}};
}
const settings={...releaseEmailSettings(n=>({RELEASE_EMAIL_UNSUBSCRIBE_SECRET:SECRET,SUPABASE_URL:'https://example.supabase.co',RELEASE_EMAIL_TEST_TO:'owner@example.test',RELEASE_EMAIL_FROM:'Codevalanche <info@radovar.com>'})[n])};
const CAMPAIGN={id:'c',version:'1.1.1',release:RELEASE,state:'test_sent',audience:'all_accounts'};

test('sending to readers is refused while the sending switch is off',async()=>{
 const service=fakeService({codevalanche_release_campaign_get:[CAMPAIGN]});
 let mailed=0;const mailer={send:async()=>{mailed++;return {id:'r'}}};
 await assert.rejects(()=>runReleaseAction({action:'send-batch',version:'1.1.1'},{service,mailer,settings}),/worker_not_configured/);
 assert.equal(mailed,0);assert.equal(service.calls.length,0);
});

test('a test goes only to the configured owner address, never to an address in the request',async()=>{
 const service=fakeService({codevalanche_release_campaign_get:[CAMPAIGN],codevalanche_release_campaign_mark_tested:[{}]});
 const sent=[];const mailer={send:async(m)=>{sent.push(m);return {id:`r${sent.length}`}}};
 const result=await runReleaseAction({action:'send-test',version:'1.1.1',to:'someone@else.test'},{service,mailer,settings});
 assert.equal(sent.length,2);
 assert.ok(sent.every(m=>m.to==='owner@example.test'&&m.subject.startsWith('[TEST] ')));
 assert.deepEqual(result.sent.map(s=>s.variant),['active','inactive']);
 assert.equal(service.calls.at(-1)[0],'codevalanche_release_campaign_mark_tested');
});

test('a batch mails each claimed reader once with a stable idempotency key and settles failures for retry',async()=>{
 const readers=[{user_id:USER,email:'a@example.test',variant:'active',attempts:1},{user_id:'22222222-2222-4222-8222-222222222222',email:'b@example.test',variant:'inactive',attempts:1}];
 const service=fakeService({codevalanche_release_campaign_get:[{...CAMPAIGN,state:'sending'}],codevalanche_release_campaign_claim:readers,codevalanche_release_campaign_settle:[{state:'sent'}],codevalanche_release_campaign_summary:[{campaign_state:'sending',queued:1,sent:1,failed:0,skipped:0}]});
 const keys=[];const mailer={send:async(m,{idempotencyKey})=>{keys.push(idempotencyKey);if(m.to==='b@example.test')throw new Error('down');return {id:'re_1'}}};
 const result=await runReleaseAction({action:'send-batch',version:'1.1.1'},{service,mailer,settings:{...settings,sendingEnabled:true}});
 assert.deepEqual(result.batch,{sent:1,failed:1});assert.equal(result.queued,1);
 assert.deepEqual(keys,[`release-1.1.1-${USER}`,'release-1.1.1-22222222-2222-4222-8222-222222222222']);
 const settles=service.calls.filter(c=>c[0]==='codevalanche_release_campaign_settle').map(c=>[c[1].p_user_id,c[1].p_sent,c[1].p_receipt_id]);
 assert.deepEqual(settles,[[USER,true,'re_1'],['22222222-2222-4222-8222-222222222222',false,null]]);
 const claim=service.calls.find(c=>c[0]==='codevalanche_release_campaign_claim')[1];
 assert.equal(claim.p_daily_cap,90);
});

test('approval passes the typed phrase through unchanged and maps refusals',async()=>{
 const service={rpc:async(name)=>name==='codevalanche_release_campaign_get'?{data:[CAMPAIGN],error:null}:{data:null,error:{message:'confirmation_mismatch'}}};
 await assert.rejects(()=>runReleaseAction({action:'approve',version:'1.1.1',confirmation:'da'},{service,settings}),e=>e.code==='confirmation_mismatch'&&e.status===400);
});

test('unsubscribe accepts only a valid signed token',async()=>{
 const service=fakeService({codevalanche_release_email_unsubscribe:[{unsubscribed:true}]});
 await assert.rejects(()=>unsubscribe(`${USER}.forged`,{service,settings}),/invalid_fields/);
 assert.equal(service.calls.length,0);
 const token=await unsubscribeToken(SECRET,USER);
 assert.deepEqual(await unsubscribe(token,{service,settings}),{unsubscribed:true});
 assert.deepEqual(service.calls[0],['codevalanche_release_email_unsubscribe',{p_user_id:USER}]);
});

test('the Resend mailer is off without a key and never confirms a send without a receipt id',async()=>{
 assert.equal(createResendMailer(()=>undefined),null);
 const env=n=>({RESEND_API_KEY:'re_test',RELEASE_EMAIL_FROM:'Codevalanche <info@radovar.com>',RELEASE_EMAIL_REPLY_TO:'info@radovar.com'})[n];
 let request;const mailer=createResendMailer(env,async(url,init)=>{request={url,init};return new Response(JSON.stringify({id:'re_9'}),{status:200})});
 assert.deepEqual(await mailer.send({to:'a@example.test',subject:'S',html:'<p>x</p>',text:'x',headers:{}},{idempotencyKey:'k'}),{id:'re_9'});
 const sentBody=JSON.parse(request.init.body);
 assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.init.headers['Idempotency-Key'],'k');
 assert.deepEqual(sentBody.to,['a@example.test']);assert.equal(sentBody.from,'Codevalanche <info@radovar.com>');assert.equal(sentBody.reply_to,'info@radovar.com');
 const empty=createResendMailer(env,async()=>new Response('{}',{status:200}));
 await assert.rejects(()=>empty.send({to:'a@example.test'},{idempotencyKey:'k'}),/delivery_unconfirmed/);
});
