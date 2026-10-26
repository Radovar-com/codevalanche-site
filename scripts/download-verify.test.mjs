import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';
import { fileURLToPath } from 'node:url';
import * as download from './download-page.mjs';
import { loadReleases } from './changelog.mjs';

const template = '<main><!-- download:verification --></main>';
const releases = [
  { version: '2.0.0', installer: { fileName: 'Setup 2.0.0.exe', sha256: 'b'.repeat(64) } },
  { version: '1.0.0', installer: { fileName: "Setup's 1.0.0.exe", sha256: 'a'.repeat(64) } },
];
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
const find = (node, tag, result = []) => {
  if (node.tagName === tag) result.push(node);
  for (const child of node.childNodes ?? []) find(child, tag, result);
  return result;
};

test('verification shows the exact hash and literal-path SHA256 command for every release', () => {
  assert.equal(typeof download.fillVerification, 'function');
  const document = parse(download.fillVerification(template, releases));
  const articles = find(document, 'article');
  assert.equal(articles.length, 2);
  for (const [index, release] of releases.entries()) {
    assert.equal(find(articles[index], 'h3').map(text).join(''), `Codevalanche ${release.version}`);
    const code = find(articles[index], 'code').map(text);
    assert.ok(code.includes(release.installer.fileName));
    assert.ok(code.includes(release.installer.sha256));
  }
  assert.ok(find(articles[0], 'code').map(text).includes("Get-FileHash -Algorithm SHA256 -LiteralPath '.\\Setup 2.0.0.exe' | Select-Object -ExpandProperty Hash"));
  assert.ok(find(articles[1], 'code').map(text).includes("Get-FileHash -Algorithm SHA256 -LiteralPath '.\\Setup''s 1.0.0.exe' | Select-Object -ExpandProperty Hash"));
});

test('verification refuses missing metadata for any published version and malformed installer data', () => {
  assert.equal(typeof download.fillVerification, 'function');
  for (const installer of [undefined, {}, { fileName: 'setup.exe' }, { fileName: 'setup.exe', sha256: 'xyz' },
    { fileName: '../setup.exe', sha256: 'a'.repeat(64) }, { fileName: 'Setup’s.exe', sha256: 'a'.repeat(64) }, { fileName: 'Setup‘s.exe', sha256: 'a'.repeat(64) }, { fileName: 'setup.ps1', sha256: 'a'.repeat(64) }]) {
    assert.throws(() => download.fillVerification(template, [releases[0], { version: '1.0.0', installer }]), /1\.0\.0.*installer/i);
  }
  assert.throws(() => download.fillVerification(template, [releases[0], releases[0]]), /duplicate/i);
  assert.throws(() => download.fillVerification('<main></main>', releases), /marker/i);
  assert.match(download.fillVerification(template, []), /No published Windows installers yet\./);
});

test('current download must agree with release verification data, including the filename', () => {
  assert.equal(typeof download.fillVerification, 'function');
  const current = { version: '2.0.0', ...releases[0].installer };
  assert.doesNotThrow(() => download.fillVerification(template, releases, current));
  for (const change of [{ sha256: 'c'.repeat(64) }, { fileName: 'other.exe' }, { version: '3.0.0' }]) {
    assert.throws(() => download.fillVerification(template, releases, { ...current, ...change }), /current.*release/i);
  }
});

test('checked-in verification data covers every published release', async () => {
  assert.equal(typeof download.fillVerification, 'function');
  const published = await loadReleases(fileURLToPath(new URL('../content/releases/', import.meta.url)));
  const source = await readFile(new URL('../src/download/verify/index.html', import.meta.url), 'utf8');
  const document = parse(download.fillVerification(source, published));
  const articles = find(document, 'article');
  assert.equal(articles.length, published.length);
  for (const [index, release] of published.entries()) {
    assert.match(release.installer.sha256, /^[a-f0-9]{64}$/);
    assert.ok(find(articles[index], 'code').map(text).includes(release.installer.sha256));
  }
});
