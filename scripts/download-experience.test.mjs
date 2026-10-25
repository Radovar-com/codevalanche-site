import test from 'node:test';
import assert from 'node:assert/strict';
import {countDownload} from '../src/download-experience.js';

const host = (navigator = {}) => {
  const calls = [];
  return {
    calls,
    navigator,
    document: {documentElement: {lang: 'ro'}},
    CODEVALANCHE_CONFIG: {supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_fixture'},
    fetch: async (url, init) => { calls.push({url, init}); return {ok: true}; },
  };
};

test('a download count sends only the metric, platform and page language, without credentials', () => {
  const window = host();
  assert.equal(countDownload('download_started', 'windows-x64', {window}), true);
  assert.equal(window.calls.length, 1);
  const [{url, init}] = window.calls;
  assert.equal(url, 'https://project.supabase.co/rest/v1/rpc/codevalanche_count_download');
  assert.deepEqual(JSON.parse(init.body), {p_metric: 'download_started', p_platform: 'windows-x64', p_locale: 'ro'});
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(init.headers).sort(), ['apikey', 'content-type']);
});

test('visitors who ask not to be tracked, unknown values and missing configuration are not counted', () => {
  for (const navigator of [{globalPrivacyControl: true}, {doNotTrack: '1'}]) {
    const window = host(navigator);
    assert.equal(countDownload('download_page_view', 'macos', {window}), false);
    assert.equal(window.calls.length, 0);
  }
  const window = host();
  assert.equal(countDownload('page_view', 'macos', {window}), false);
  assert.equal(countDownload('download_page_view', 'beos', {window}), false);
  assert.equal(countDownload('download_page_view', 'macos', {window: {...window, CODEVALANCHE_CONFIG: {}}}), false);
  assert.equal(window.calls.length, 0);
});

test('cookieless counts in all 17 languages have no storage, network identity or cross-day identifier', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-25T23:59:59Z')});
  const {LOCALES} = await import('../src/locales/manifest.js');
  for (const {tag} of LOCALES) {
    const window = host();
    window.document.documentElement.lang = tag;
    Object.defineProperty(window, 'localStorage', {get() {throw new Error('must not read storage');}});
    Object.defineProperty(window.document, 'cookie', {get() {throw new Error('must not read cookies');}});
    Object.defineProperty(window.navigator, 'userAgent', {get() {throw new Error('must not read full UA');}});
    Object.defineProperty(window, 'crypto', {get() {throw new Error('must not mint identity');}});
    for (const time of ['2026-10-25T23:59:59Z','2026-10-26T00:00:00Z']) {
      t.mock.timers.setTime(Date.parse(time));
      assert.equal(countDownload('download_started', 'windows-x64', {window}), true);
    }
    assert.deepEqual(window.calls.map(c=>JSON.parse(c.init.body)), Array(2).fill({p_metric:'download_started',p_platform:'windows-x64',p_locale:tag}));
    assert.ok(window.calls.every(c=>c.init.credentials==='omit' && c.init.referrerPolicy==='no-referrer'));
    window.navigator.globalPrivacyControl = true;
    assert.equal(countDownload('download_started','windows-x64',{window}),false);
    assert.equal(window.calls.length,2);
  }
});
