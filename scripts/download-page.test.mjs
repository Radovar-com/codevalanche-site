import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLine, downloadTranslations, fillDownload, publicDownloadCount, redirectPage, releaseHistory, selectDownloadVariant, windowsDownload } from './download-page.mjs';
import checkedInManifest from '../supabase/functions/_shared/download-manifest.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'https://artifacts.example.org/files/Codevalanche_9.9.9_x64-setup.exe';
const manifest = {
  version: 1,
  gatewayBaseUrl: 'https://codevalanche.com/download-redirect/v1',
  allowedOrigins: ['https://artifacts.example.org'],
  assets: [{ siteId: 'codevalanche', platform: 'windows', architecture: 'x64', releaseId: '9.9.9', artifactId: 'windows-x64-setup', qualified: true, targetUrl: target,
    display: { version: '9.9.9', fileName: 'Codevalanche_9.9.9_x64-setup.exe', sizeBytes: 94371840, sha256: 'a'.repeat(64) } }],
};

test('the checked-in manifest either offers no installer or a complete one on codevalanche.com', () => {
  const download = windowsDownload(checkedInManifest);
  if (download) assert.match(download.path, /^\/download-redirect\/v1\/codevalanche\/windows\//);
});

test('a qualified installer fills the page and forwards from a codevalanche.com address', async () => {
  const download = windowsDownload(manifest);
  assert.equal(download.path, '/download-redirect/v1/codevalanche/windows/9.9.9/windows-x64-setup/');
  assert.equal(download.size, '90 MB');
  const page = await readFile(path.join(root, 'src', 'download', 'index.html'), 'utf8');
  const html = fillDownload(selectDownloadVariant(page, download), download);
  assert.doesNotMatch(html, /Public installer in preparation|artifacts\.example\.org|<!-- \/?download:/);
  assert.match(html, /data-fill="version">9\.9\.9</);
  assert.match(html, /data-fill="sha256">a{64}</);
  assert.match(html, /href="\/download\/started\/\?platform=windows-x64" data-download-platform="windows" data-download-release="9\.9\.9"[^>]* data-release-primary/);
  assert.equal((html.match(/data-release-primary/g) ?? []).length, 1, 'only the hero button adapts to the visitor; the Windows card always offers Windows');
  const started = fillDownload(selectDownloadVariant(await readFile(path.join(root, 'src', 'download', 'started', 'index.html'), 'utf8'), download), download);
  assert.match(started, /href="\/download-redirect\/v1\/codevalanche\/windows\/9\.9\.9\/windows-x64-setup\/" data-download-retry/);
  assert.match(started, /data-started-missing hidden/);
  assert.doesNotMatch(started, /artifacts\.example\.org/);
  assert.match(redirectPage(download), /<meta http-equiv="refresh" content="0; url=https:\/\/artifacts\.example\.org\/files\/Codevalanche_9\.9\.9_x64-setup\.exe">/);
});

test('without an installer the page keeps saying it is in preparation', async () => {
  const page = await readFile(path.join(root, 'src', 'download', 'index.html'), 'utf8');
  const html = fillDownload(selectDownloadVariant(page, null), null);
  assert.match(html, /Public installer in preparation\./);
  assert.doesNotMatch(html, /Choose your platform|data-fill/);
  const started = fillDownload(selectDownloadVariant(await readFile(path.join(root, 'src', 'download', 'started', 'index.html'), 'utf8'), null), null);
  assert.match(started, /data-started-missing>/);
  assert.doesNotMatch(started, /Thanks for downloading Codevalanche|data-download-retry/);
});

test('release history links each published version to its notes, newest first', () => {
  const release = (version, date, headline) => ({ version, date, copy: { en: { headline } } });
  const html = releaseHistory([release('1.0.1', '2026-10-20', 'Newer'), release('1.0.0', '2026-10-19', 'First')]);
  assert.match(html, /href="\/changelog\.html#v1-0-1"><span class="dl-history-version">1\.0\.1<\/span><span class="dl-badge">Latest<\/span><span class="dl-history-title">Newer<\/span><time datetime="2026-10-20">Oct 20, 2026<\/time>/);
  assert.equal((html.match(/Latest/g) ?? []).length, 1);
  assert.equal(releaseHistory([]), '');
});

test('the public download count appears only from the minimum upward and is translated with local digits', () => {
  assert.equal(countLine(499, 500), '');
  assert.equal(countLine(null, 500), '');
  assert.equal(countLine(1234, 500), '<p class="dl-count">Downloaded 1,234 times.</p>');
  const download = windowsDownload(manifest);
  assert.deepEqual(downloadTranslations(download, { count: 1234, minimum: 500, tag: 'de', catalog: { 'Downloaded {count} times.': '{count}-mal heruntergeladen.' } })['Downloaded 1,234 times.'], '1.234-mal heruntergeladen.');
  assert.equal(downloadTranslations(download, { count: 12, minimum: 500, tag: 'de' })['Downloaded 12 times.'], undefined);
});

test('the public count adds only stable Windows installers from published releases', async () => {
  const github = { ...manifest, allowedOrigins: ['https://github.com'], assets: [{ ...manifest.assets[0], targetUrl: 'https://github.com/example/releases-repo/releases/download/v9.9.9/Codevalanche_9.9.9_x64-setup.exe', display: { ...manifest.assets[0].display, fileName: 'Codevalanche_9.9.9_x64-setup.exe' } }] };
  let requested;
  const fetch = async url => { requested = url; return { ok: true, json: async () => [
    { draft: false, prerelease: false, assets: [{ name: 'Codevalanche-Desktop-Setup-1.0.1-stable-abc.exe', download_count: 600 }, { name: 'codevalanche-desktop-update-feed-stable.json', download_count: 9000 }] },
    { draft: false, prerelease: false, assets: [{ name: 'Codevalanche-Desktop-Setup-1.0.0-stable-def.exe', download_count: 40 }] },
    { draft: false, prerelease: true, assets: [{ name: 'Codevalanche-Desktop-Setup-0.2.1-dev-abc.exe', download_count: 77 }] },
  ] }; };
  assert.equal(await publicDownloadCount(github, { fetch }), 640);
  assert.equal(requested, 'https://api.github.com/repos/example/releases-repo/releases?per_page=100');
  assert.equal(await publicDownloadCount(github, { fetch: async () => ({ ok: false }) }), null);
  assert.equal(await publicDownloadCount(github, { fetch: async () => { throw new Error('offline'); } }), null);
  assert.equal(await publicDownloadCount(manifest, { fetch }), null, 'only a GitHub release host has a public count');
});

test('an installer with missing details or another gateway is refused', () => {
  const asset = manifest.assets[0];
  assert.throws(() => windowsDownload({ ...manifest, gatewayBaseUrl: 'https://downloads.example.org/functions/v1/download-redirect/v1' }), /must be on https:\/\/codevalanche\.com/);
  assert.throws(() => windowsDownload({ ...manifest, assets: [{ ...asset, display: { ...asset.display, sha256: 'xyz' } }] }), /sha256/);
  assert.throws(() => windowsDownload({ ...manifest, assets: [{ ...asset, display: { ...asset.display, fileName: 'other.exe' } }] }), /fileName/);
});

test('public count cannot be exposed at or below 500 even with a lower configured threshold', () => {
  for (const minimum of [0, 1, 499, 500]) for (const count of [0, 499, 500]) {
    assert.equal(countLine(count, minimum), '', `${count}/${minimum}`);
    assert.equal(Object.keys(downloadTranslations(windowsDownload(manifest), {count, minimum})).length, 2);
  }
  assert.match(countLine(501, 500), /501/);
});

test('public count includes published installer history beyond the first 100 releases', async () => {
  const github = {...manifest, allowedOrigins: ['https://github.com'], assets: [{...manifest.assets[0], targetUrl: 'https://github.com/example/fixture/releases/download/v1/fixture.exe'}]};
  const requests = [];
  const fetch = async url => {
    requests.push(url);
    const second = new URL(url).searchParams.get('page') === '2';
    return {ok: true, json: async () => second ? [{assets: [{name: 'Codevalanche-Desktop-Setup-0.1.0-stable-abc.exe', download_count: 12}]}]
      : Array.from({length: 100}, () => ({assets: [{name: 'Codevalanche-Desktop-Setup-1.0.0-stable-abc.exe', download_count: 5}]}))};
  };
  assert.equal(await publicDownloadCount(github, {fetch}), 512);
  assert.equal(requests.length, 2);
});

test('static thank-you links keep the qualified Windows architecture before JavaScript runs', async () => {
  const page = await readFile(path.join(root, 'src/download/index.html'), 'utf8');
  for (const architecture of ['arm64','universal','x86']) {
    const download = windowsDownload({...manifest,assets:[{...manifest.assets[0],architecture}]});
    const html = fillDownload(selectDownloadVariant(page,download),download);
    assert.match(html,new RegExp(`/download/started/\\?platform=windows-${architecture}`));
    assert.doesNotMatch(html,/platform=windows-x64/);
  }
});

test('provider outages or malformed counts hide the count but leave a usable qualified download page', async () => {
  const github = {...manifest,allowedOrigins:['https://github.com'],assets:[{...manifest.assets[0],targetUrl:'https://github.com/example/fixture/releases/download/v1/fixture.exe'}]};
  for (const fetch of [async()=>{throw new Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({message:'rate limit'})}),async()=>({ok:true,json:async()=>[{assets:[{name:'Codevalanche-Desktop-Setup-1-stable-abc.exe',download_count:-1}]}]})]) {
    const count = await publicDownloadCount(github,{fetch});
    assert.equal(count,null);
    const download = windowsDownload(manifest);
    const page = fillDownload(selectDownloadVariant(await readFile(path.join(root,'src/download/index.html'),'utf8'),download),download,{count,minimum:500});
    assert.match(page,/data-download-card/);
    assert.match(page,/Codevalanche for Windows/);
    assert.doesNotMatch(page,/class="dl-count"/);
  }
});

test('a failed later GitHub page never publishes a partial download total', async () => {
  const github = {...manifest,allowedOrigins:['https://github.com'],assets:[{...manifest.assets[0],targetUrl:'https://github.com/example/fixture/releases/download/v1/fixture.exe'}]};
  let calls = 0;
  assert.equal(await publicDownloadCount(github,{fetch:async()=>++calls===1?{ok:true,json:async()=>Array(100).fill({assets:[{name:'Codevalanche-Desktop-Setup-1-stable-abc.exe',download_count:8}]})}:{ok:false}}),null);
});

test('overlapping GitHub pages fail closed instead of counting the same release twice', async () => {
  const github = {...manifest,allowedOrigins:['https://github.com'],assets:[{...manifest.assets[0],targetUrl:'https://github.com/example/fixture/releases/download/v1/fixture.exe'}]};
  const releases = Array.from({length:100},(_,index)=>({id:index+1,assets:[{id:index+1,name:'Codevalanche-Desktop-Setup-1-stable-abc.exe',download_count:6}]}));
  let page = 0;
  assert.equal(await publicDownloadCount(github,{fetch:async()=>({ok:true,json:async()=>++page===1?releases:[releases[99]]})}),null);
});
