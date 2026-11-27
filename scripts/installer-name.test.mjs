import test from 'node:test';
import assert from 'node:assert/strict';
import { ANY_INSTALLER, installerFileName, isInstallerFileName, releaseAssetUrl, usesSimpleName } from './installer-name.mjs';
import { windowsDownload } from './download-page.mjs';

const REPO = 'Radovar-com/codevalanche-desktop-releases';
const OLD = 'Codevalanche-Desktop-Setup-1.1.76-stable-9b10c4b30c02.exe';

test('1.1.77 and later use the simple name; 1.1.76 and earlier keep the build id', () => {
  assert.equal(usesSimpleName('1.1.76'), false);
  assert.equal(usesSimpleName('1.1.77'), true);
  assert.equal(usesSimpleName('1.2.0'), true);
  assert.equal(usesSimpleName('2.0.0'), true);
  assert.equal(usesSimpleName('1.0.99'), false);
  assert.equal(installerFileName('1.1.77'), 'Codevalanche-Setup-1.1.77.exe');
  assert.equal(installerFileName('1.1.76'), null);
  assert.throws(() => usesSimpleName('1.1'), /Not a version/);
});

test('each version accepts only its own form', () => {
  assert.equal(isInstallerFileName('1.1.76', OLD), true);
  assert.equal(isInstallerFileName('1.1.76', 'Codevalanche-Setup-1.1.76.exe'), false);
  assert.equal(isInstallerFileName('1.1.75', OLD), false);
  assert.equal(isInstallerFileName('1.1.77', 'Codevalanche-Setup-1.1.77.exe'), true);
  assert.equal(isInstallerFileName('1.1.77', 'Codevalanche-Desktop-Setup-1.1.77-stable-0123456789ab.exe'), false);
  assert.equal(isInstallerFileName('1.1.77', 'Codevalanche-Setup-1.1.78.exe'), false);
  for (const name of [OLD, 'Codevalanche-Setup-1.1.77.exe']) assert.match(name, ANY_INSTALLER);
  assert.doesNotMatch('codevalanche-desktop-update-feed-stable.json', ANY_INSTALLER);
});

test('the release address follows the rule', () => {
  assert.equal(releaseAssetUrl(REPO, '1.1.77'), `https://github.com/${REPO}/releases/download/v1.1.77/Codevalanche-Setup-1.1.77.exe`);
  assert.equal(releaseAssetUrl(REPO, '1.1.76', OLD), `https://github.com/${REPO}/releases/download/v1.1.76/${OLD}`);
  assert.throws(() => releaseAssetUrl(REPO, '1.1.76'), /not the installer name/);
  assert.throws(() => releaseAssetUrl(REPO, '1.1.77', OLD), /not the installer name/);
});

const manifestFor = (version, fileName) => ({
  version: 1, gatewayBaseUrl: 'https://codevalanche.com/download-redirect/v1', allowedOrigins: ['https://github.com'],
  assets: [{ siteId: 'codevalanche', platform: 'windows', architecture: 'x64', releaseId: version, artifactId: 'windows-x64-setup', qualified: true,
    targetUrl: `https://github.com/${REPO}/releases/download/v${version}/${fileName}`,
    display: { version, fileName, sizeBytes: 1, sha256: 'a'.repeat(64) } }],
});

test('the download redirect refuses a release asset with the wrong name for its version', () => {
  assert.equal(windowsDownload(manifestFor('1.1.76', OLD)).path, '/download-redirect/v1/codevalanche/windows/1.1.76/windows-x64-setup/');
  const simple = windowsDownload(manifestFor('1.1.77', 'Codevalanche-Setup-1.1.77.exe'));
  assert.equal(simple.path, '/download-redirect/v1/codevalanche/windows/1.1.77/windows-x64-setup/');
  assert.equal(simple.targetUrl, `https://github.com/${REPO}/releases/download/v1.1.77/Codevalanche-Setup-1.1.77.exe`);
  assert.throws(() => windowsDownload(manifestFor('1.1.77', 'Codevalanche-Desktop-Setup-1.1.77-stable-0123456789ab.exe')), /not the installer name/);
  assert.throws(() => windowsDownload(manifestFor('1.1.76', 'Codevalanche-Setup-1.1.76.exe')), /not the installer name/);
});
