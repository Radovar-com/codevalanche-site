import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillDownload, redirectPage, selectDownloadVariant, windowsDownload } from './download-page.mjs';
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
  assert.match(html, /href="\/download-redirect\/v1\/codevalanche\/windows\/9\.9\.9\/windows-x64-setup\/" data-download-platform="windows"/);
  assert.match(redirectPage(download), /<meta http-equiv="refresh" content="0; url=https:\/\/artifacts\.example\.org\/files\/Codevalanche_9\.9\.9_x64-setup\.exe">/);
});

test('without an installer the page keeps saying it is in preparation', async () => {
  const page = await readFile(path.join(root, 'src', 'download', 'index.html'), 'utf8');
  const html = fillDownload(selectDownloadVariant(page, null), null);
  assert.match(html, /Public installer in preparation\./);
  assert.doesNotMatch(html, /Download Codevalanche for Windows|data-fill/);
});

test('an installer with missing details or another gateway is refused', () => {
  const asset = manifest.assets[0];
  assert.throws(() => windowsDownload({ ...manifest, gatewayBaseUrl: 'https://downloads.example.org/functions/v1/download-redirect/v1' }), /must be on https:\/\/codevalanche\.com/);
  assert.throws(() => windowsDownload({ ...manifest, assets: [{ ...asset, display: { ...asset.display, sha256: 'xyz' } }] }), /sha256/);
  assert.throws(() => windowsDownload({ ...manifest, assets: [{ ...asset, display: { ...asset.display, fileName: 'other.exe' } }] }), /fileName/);
});
