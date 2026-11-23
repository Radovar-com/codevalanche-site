import test from 'node:test';
import assert from 'node:assert/strict';
import {countPage, referrerSource} from '../src/page-counts.js';

const origin = 'https://codevalanche.com';
function host({path = '/', referrer = '', lang = 'en', navigator = {}, navigationType = 'navigate', config} = {}) {
  const calls = [];
  return {
    calls,
    window: {
      navigator,
      CODEVALANCHE_CONFIG: config ?? {supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_x'},
      document: {referrer, documentElement: {lang}},
      location: {pathname: path, origin},
      performance: {getEntriesByType: () => [{type: navigationType}]},
      fetch: (url, init) => { calls.push({url, init, body: JSON.parse(init.body)}); return Promise.resolve({}); },
    },
  };
}

test('referrer is reduced to one coarse bucket', () => {
  assert.equal(referrerSource('', origin), 'direct');
  assert.equal(referrerSource('https://codevalanche.com/docs/', origin), 'internal');
  assert.equal(referrerSource('https://www.google.ro/', origin), 'search');
  assert.equal(referrerSource('https://github.com/Radovar-com', origin), 'github');
  assert.equal(referrerSource('https://t.co/abc', origin), 'social');
  assert.equal(referrerSource('https://chatgpt.com/', origin), 'ai');
  assert.equal(referrerSource('https://someblog.example/post', origin), 'other');
  assert.equal(referrerSource('not a url', origin), 'other');
});

test('a page opened from outside counts a page view and a visit, with nothing identifying', () => {
  const h = host({path: '/ro/', referrer: 'https://www.google.com/', lang: 'ro'});
  assert.deepEqual(countPage({window: h.window}), ['page_view', 'visit']);
  assert.equal(h.calls[0].url, 'https://project.supabase.co/rest/v1/rpc/count_site_page');
  assert.deepEqual(h.calls.map(c => c.body), [
    {p_site: 'codevalanche', p_page: 'home', p_metric: 'page_view', p_source: 'search', p_locale: 'ro'},
    {p_site: 'codevalanche', p_page: 'home', p_metric: 'visit', p_source: 'search', p_locale: 'ro'},
  ]);
  for (const {init} of h.calls) {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(init.headers).sort(), ['apikey', 'content-type']);
  }
});

test('moving inside the site is a page view, not a new visit', () => {
  const h = host({path: '/changelog.html', referrer: 'https://codevalanche.com/'});
  assert.deepEqual(countPage({window: h.window}), ['page_view']);
  assert.deepEqual(h.calls[0].body, {p_site: 'codevalanche', p_page: 'changelog', p_metric: 'page_view', p_source: 'internal', p_locale: 'en'});
});

test('reloads, privacy signals, automated browsers and missing config are not counted', () => {
  for (const options of [
    {navigationType: 'reload'},
    {navigator: {globalPrivacyControl: true}},
    {navigator: {doNotTrack: '1'}},
    {navigator: {webdriver: true}},
    {config: {}},
  ]) {
    const h = host(options);
    assert.deepEqual(countPage({window: h.window}), []);
    assert.equal(h.calls.length, 0);
  }
});

test('unknown pages and languages fall back to fixed values', () => {
  const h = host({path: '/nope/', lang: 'xx', referrer: ''});
  countPage({window: h.window});
  assert.deepEqual(h.calls[1].body, {p_site: 'codevalanche', p_page: 'other', p_metric: 'visit', p_source: 'direct', p_locale: 'en'});
});

test('the thank-you page after a Download click has its own page id in every language', () => {
  for (const path of ['/download/started/', '/ro/download/started/', '/zh-hans/download/started/']) {
    const h = host({path, referrer: 'https://codevalanche.com/download/'});
    countPage({window: h.window});
    assert.equal(h.calls[0].body.p_page, 'download_thanks');
  }
  const h = host({path: '/ro/download/', referrer: ''});
  countPage({window: h.window});
  assert.equal(h.calls[0].body.p_page, 'download');
});
