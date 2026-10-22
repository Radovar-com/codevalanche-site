import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatorQrSource} from '../src/account/authenticatorQr.js';
test('provider SVG data is encoded without losing black QR modules at a hash or percent sign',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" data-note="100%" d="M1 1h8v8H1z"/></svg>';
 for(const payload of [svg,encodeURIComponent(svg)]){
  const source=authenticatorQrSource('data:image/svg+xml;utf-8,'+payload);
  assert.ok(source.startsWith('data:image/svg+xml;charset=utf-8,'));assert.equal(decodeURIComponent(source.split(',').slice(1).join(',')),svg);
 }
});
test('the QR image never uses a remote service, an executable document, malformed encoding or oversized data',()=>{
 for(const source of [null,'','https://qr.example.test/?secret=SYNTHETIC','javascript:alert(1)','data:text/html,<svg/>','data:image/svg+xml;utf-8,%zz','data:image/svg+xml;utf-8,not-an-svg','data:image/svg+xml;utf-8,<svg>'+ 'x'.repeat(200000)])assert.equal(authenticatorQrSource(source),'');
});
