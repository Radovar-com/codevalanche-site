import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogTranslations, loadReleases, renderChangelog, validateRelease } from './changelog.mjs';
import { importReleaseNotes } from './import-release-notes.mjs';
import { renderTranslatedHtml } from './localization.mjs';
import { LOCALES } from '../src/locales/manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copyFor = tag => ({
  headline: `Headline ${tag}`,
  summary: `Summary ${tag}`,
  sections: [
    { title: `First ${tag}`, body: `First body ${tag}.`, detail: `First detail ${tag}.` },
    { title: `Second ${tag}`, body: `Second body ${tag}.` },
  ],
});
const release = (version, date) => ({ version, date, copy: Object.fromEntries(LOCALES.map(locale => [locale.tag, copyFor(locale.tag)])) });

test('the published site lists only real releases and says the first one is on its way until then', async () => {
  const releases = await loadReleases(path.join(root, 'content', 'releases'));
  const page = await readFile(path.join(root, 'src', 'changelog.html'), 'utf8');
  if (releases.length === 0) {
    const html = renderChangelog(page, releases);
    assert.match(html, /The first public version is on its way\./);
    assert.doesNotMatch(html, /cl-release"/);
  }
  for (const item of releases) assert.equal(validateRelease(item, item.version), item);
});

test('releases render newest first with version, date and every highlight', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'changelog-'));
  try {
    await writeFile(path.join(directory, '1.0.2.json'), JSON.stringify(release('1.0.2', '2026-10-21')));
    await writeFile(path.join(directory, '1.0.10.json'), JSON.stringify(release('1.0.10', '2026-11-02')));
    const releases = await loadReleases(directory);
    assert.deepEqual(releases.map(item => item.version), ['1.0.10', '1.0.2']);
    const page = await readFile(path.join(root, 'src', 'changelog.html'), 'utf8');
    const html = renderChangelog(page, releases);
    assert.doesNotMatch(html, /The first public version is on its way\./);
    assert.ok(html.indexOf('id="v1-0-10"') < html.indexOf('id="v1-0-2"'));
    assert.match(html, /<a href="#v1-0-2"><span>1\.0\.2<\/span><em>Oct 21<\/em><\/a>/);
    assert.match(html, /<time datetime="2026-10-21">Oct 21, 2026<\/time>/);
    assert.match(html, /<strong>First en<\/strong> First body en\.<\/p><p class="cl-detail">First detail en\.<\/p>/);
    const translated = renderTranslatedHtml(html.replace('<!-- site-header -->', '').replace('<!-- site-footer -->', ''), {
      ...JSON.parse(await readFile(path.join(root, 'src', 'locales', 'ro.json'), 'utf8')),
      ...changelogTranslations(releases, 'ro'),
    }, 'ro');
    assert.match(translated, /<strong>First ro<\/strong> First body ro\./);
    assert.match(translated, /21 oct\. 2026/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a release with a missing language or a misnamed file is refused', async () => {
  const incomplete = release('1.0.2', '2026-10-21');
  delete incomplete.copy.ja;
  assert.throws(() => validateRelease(incomplete, '1.0.2.json'), /missing for ja/);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'changelog-'));
  try {
    await writeFile(path.join(directory, '1.0.3.json'), JSON.stringify(release('1.0.2', '2026-10-21')));
    await assert.rejects(loadReleases(directory), /file name must be 1\.0\.2\.json/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the importer copies the app notes and the CHANGELOG date', async () => {
  const app = await mkdtemp(path.join(os.tmpdir(), 'changelog-app-'));
  const output = await mkdtemp(path.join(os.tmpdir(), 'changelog-out-'));
  try {
    await mkdir(path.join(app, 'lib', 'desktop', 'whats-new'), { recursive: true });
    const notes = release('1.0.2', '2026-10-21');
    await writeFile(path.join(app, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(app, 'lib', 'desktop', 'whats-new', 'v1.0.2.ts'), `export const NOTES = ${JSON.stringify({ version: '1.0.2', copy: notes.copy })}\n`);
    await writeFile(path.join(app, 'CHANGELOG.md'), '# Changelog\n\n## v1.0.2 — 2026-10-21\n\n### Improvements\n- Something.\n');
    const file = await importReleaseNotes(app, '1.0.2', { outputDirectory: output });
    const imported = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(imported.date, '2026-10-21');
    assert.equal(imported.copy.ro.sections[0].title, 'First ro');
    assert.deepEqual((await loadReleases(output)).map(item => item.version), ['1.0.2']);
  } finally {
    await rm(app, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});
