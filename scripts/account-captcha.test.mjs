import test from 'node:test';import assert from 'node:assert/strict';
import {createAccountCaptcha} from '../src/account/captcha.js';
test('configured CAPTCHA returns the provider token and renews each public attempt',async()=>{let count=0;const widget={render(container,options){count++;queueMicrotask(()=>options.callback(`synthetic-${count}`));return count},remove(){}};const captcha=createAccountCaptcha({siteKey:'public-test',container:{},loadWidget:async()=>widget});assert.equal(await captcha.challenge(),'synthetic-1');assert.equal(await captcha.challenge(),'synthetic-2')});
test('unconfigured CAPTCHA does not pretend to have verified a challenge',async()=>assert.equal(await createAccountCaptcha({siteKey:'',container:{},loadWidget:async()=>{throw new Error('unexpected')}}).challenge(),undefined));
test('failed CAPTCHA refuses the auth request',async()=>{const widget={render(container,options){queueMicrotask(()=>options['error-callback']());return 1},remove(){}};await assert.rejects(()=>createAccountCaptcha({siteKey:'public-test',container:{},loadWidget:async()=>widget}).challenge(),/captcha_required/)});

test('Turnstile can retry when the loaded script did not install the provider API',async()=>{
 const previous=globalThis.document,scripts=[];
 globalThis.document={createElement:()=>({}),head:{append(script){scripts.push(script)}}};
 try{
  const {loadTurnstile}=await import('../src/account/captcha.js?retry-missing-api');
  const first=loadTurnstile();scripts[0].onload();await assert.rejects(first,error=>error.code==='captcha_required');
  const retry=loadTurnstile();
  assert.equal(scripts.length,2,'a failed load must allow a new script request');
  globalThis.turnstile={render(){}};scripts[1].onload();assert.equal(await retry,globalThis.turnstile);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;delete globalThis.turnstile}
});
