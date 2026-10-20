import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {browserContext,sanitizeEvent} from '../src/analytics/core/sanitizer.js';
const host=(href,referrer='')=>({location:{href},document:{referrer},navigator:{language:'en-US',userAgent:'Mozilla/5.0 Windows NT Chrome/123.0'},innerWidth:1024});
test('acquisition reads only explicitly requested allowlisted context with normalized external referrer',()=>{
 const input=host('https://codevalanche.com/?utm_source=newsletter&utm_medium=email&utm_campaign=fall_2026&gclid=private#access_token=private','https://EXAMPLE.org/path?email=private@example.org');
 assert.equal(browserContext(input).acquisition_source,undefined);
 const context=browserContext(input,{acquisition:true});assert.equal(context.acquisition_source,'newsletter');assert.equal(context.referrer_domain,'example.org');assert.equal(context.viewport_bucket,'medium');assert.equal(context.os_family,'windows');assert.equal(context.browser_family,'chrome');assert.ok(!JSON.stringify(context).includes('private'));
 assert.ok(sanitizeEvent('session_started',{landing_page_id:'home',attribution_kind:'campaign'},context,'codevalanche'));
});
test('missing/same-origin referrer and unsafe, oversized or ambiguous campaign values stay unknown',()=>{
 for(const referrer of ['', 'https://codevalanche.com/privacy.html', 'javascript:private', 'https://127.0.0.1/path'])assert.equal(browserContext(host('https://codevalanche.com/',referrer),{acquisition:true}).referrer_domain,'unknown');
 for(const value of ['person%40example.com','https%3A%2F%2Fprivate.example','access_token','a'.repeat(81),'1234567890','550e8400-e29b-41d4-a716-446655440000'])assert.equal(browserContext(host('https://codevalanche.com/?utm_campaign='+value),{acquisition:true}).campaign,undefined,value);
 assert.equal(browserContext(host('https://codevalanche.com/?utm_source=first&utm_source=second'),{acquisition:true}).acquisition_source,undefined);
});
test('public config ships only the first-party collector and legacy transport/GA code is absent',()=>{
 const config=readFileSync(new URL('../src/config.js',import.meta.url),'utf8');assert.match(config,/CODEVALANCHE_ANALYTICS = \{ enabled: true, baseUrl: "https:\/\/hvevaxsfeyiikjhcsafi\.supabase\.co\/functions\/v1\/website-analytics\/v1"/);
 for(const file of ['account-funnel.js','site.js']){const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/googletagmanager|gtag\(|\/api\/codevalanche\/accounts\/events|codevalanche_analytics_installation/);}
});
