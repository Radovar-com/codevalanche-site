import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import manifest from '../supabase/functions/_shared/download-manifest.json' with {type: 'json'};

const bundle = await build({stdin: {contents: `export {startRequestedDownload, countDownload} from './src/download-experience.js'; export {renderReleaseActions} from './src/release-actions.js';`, resolveDir: process.cwd()}, bundle: true, write: false, format: 'iife', globalName: 'journey'});
async function fixture(run) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({body: '<html><body></body></html>', contentType: 'text/html'}));
    await page.goto('https://site.example.test/');
    await page.addScriptTag({content: bundle.outputFiles[0].text});
    await run(page);
  } finally {await browser.close();}
}
const html = '<main data-download-started><div data-started-ok>Starting</div><div data-started-missing hidden>Unavailable. See download options.</div><div class="page-body"><section>Install</section><section id="while-you-wait">More</section></div><a data-download-retry href="#">Retry</a></main>';

test('a missing asset never accepts windows-undefined or schedules a broken download', async () => fixture(async page => {
  await page.setContent(html);
  const result = await page.evaluate(() => {
    const timers = [], calls = [];
    const host = {location: {search: '?platform=windows-undefined', assign: url => calls.push(url)}, setTimeout: fn => timers.push(fn), navigator: {}};
    const selected = journey.startRequestedDownload(document, {version: 1, assets: [], allowedOrigins: [], gatewayBaseUrl: ''}, {window: host});
    return {selected, timers: timers.length, missing: document.querySelector('[data-started-missing]').hidden, ok: document.querySelector('[data-started-ok]').hidden};
  });
  assert.deepEqual(result, {selected: null, timers: 0, missing: false, ok: true});
}));

test('all qualified Windows architectures keep their requested platform through every button', async () => fixture(async page => {
  for (const architecture of ['arm64', 'universal', 'x86', 'x64']) {
    await page.setContent('<html lang="ro"><a data-release-primary href="/download/">Options</a><a data-download-card href="/download/">Download</a><div data-dl-platform="windows"><span class="dl-card-state">Download</span></div></html>');
    const hrefs = await page.evaluate(({manifest, architecture}) => {
      manifest.assets[0].architecture = architecture;
      journey.renderReleaseActions(document, manifest, {platform: 'Win32', userAgent: `Windows NT 10.0; ${architecture === 'arm64' ? 'ARM64' : 'Win64; x64'}`});
      return [...document.querySelectorAll('a')].map(a => new URL(a.href).searchParams.get('platform'));
    }, {manifest, architecture});
    assert.deepEqual(hrefs, Array(3).fill(`windows-${architecture}`), architecture);
  }
}));

test('rerendering a thank-you page does not start or count the same attempt twice', async () => fixture(async page => {
  await page.setContent(html);
  const result = await page.evaluate(manifest => {
    const calls = [], timers = [];
    const host = {location: {search: '?platform=windows-x64', assign: url => calls.push(url)}, navigator: {}, document,
      CODEVALANCHE_CONFIG: {supabaseUrl: 'https://collector.example.test', supabasePublishableKey: 'fixture'},
      fetch: async (...args) => {calls.push(JSON.parse(args[1].body));}, setTimeout: fn => timers.push(fn)};
    journey.startRequestedDownload(document, manifest, {window: host});
    journey.startRequestedDownload(document, manifest, {window: host});
    timers[0]();
    return {calls, timers: timers.length};
  }, manifest);
  assert.equal(result.timers, 1);
  assert.equal(result.calls.filter(c => c.p_metric === 'download_started').length, 1);
  assert.equal(result.calls.filter(c => typeof c === 'string').length, 1);
}));

test('every qualified Windows architecture retains started and retry counts without adding new dimensions', async () => fixture(async page => {
  for (const architecture of ['arm64','x86','universal','x64']) {
    await page.setContent(html);
    const metrics = await page.evaluate(({manifest,architecture}) => {
      manifest.assets[0].architecture = architecture;
      const calls = [];
      const host = {location:{search:`?platform=windows-${architecture}`,assign:()=>{}},navigator:{},document,
        CODEVALANCHE_CONFIG:{supabaseUrl:'https://collector.example.test',supabasePublishableKey:'fixture'},
        fetch:async (url,init)=>{calls.push(JSON.parse(init.body));},setTimeout:()=>{}};
      journey.startRequestedDownload(document,manifest,{window:host});
      document.querySelector('[data-download-retry]').click();
      return calls;
    },{manifest,architecture});
    const platform = architecture==='x64'?'windows-x64':'windows';
    assert.deepEqual(metrics,[{p_metric:'download_started',p_platform:platform,p_locale:'en'},{p_metric:'download_retry',p_platform:platform,p_locale:'en'}],architecture);
  }
}));
