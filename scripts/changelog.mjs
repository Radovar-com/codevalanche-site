import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCALES } from '../src/locales/manifest.js';

// The changelog lists only versions that were really published. Each one is a
// file in content/releases/, imported from the app's own release notes, so the
// website says exactly what the app's "What's new" card says, in every language.
const VERSION = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const RAIL = /<!-- changelog-rail:start -->[\s\S]*?<!-- changelog-rail:end -->/;
const RELEASES = /<!-- changelog-releases:start -->[\s\S]*?<!-- changelog-releases:end -->/;

const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const normalized = value => String(value).trim().replace(/\s+/g, ' ');
const anchor = version => `v${version.replace(/\./g, '-')}`;
const compareVersions = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
};

function formatDate(date, tag, withYear) {
  return new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

function checkCopy(copy, where) {
  if (!copy || typeof copy.headline !== 'string' || !copy.headline.trim()) throw new Error(`${where}: headline is missing`);
  if (!Array.isArray(copy.sections) || copy.sections.length === 0) throw new Error(`${where}: sections are missing`);
  if (copy.sections.length > ROMAN.length) throw new Error(`${where}: more than ${ROMAN.length} sections`);
  copy.sections.forEach((section, index) => {
    for (const field of ['title', 'body']) {
      if (typeof section?.[field] !== 'string' || !section[field].trim()) throw new Error(`${where}: section ${index + 1} has no ${field}`);
    }
    if (section.detail !== undefined && (typeof section.detail !== 'string' || !section.detail.trim())) throw new Error(`${where}: section ${index + 1} has an empty detail`);
  });
}

export function validateRelease(release, file = 'release') {
  if (!VERSION.test(release?.version ?? '')) throw new Error(`${file}: version must look like 1.2.3`);
  if (!DATE.test(release.date ?? '') || Number.isNaN(Date.parse(`${release.date}T00:00:00Z`))) throw new Error(`${file}: date must be YYYY-MM-DD`);
  const english = release.copy?.en;
  checkCopy(english, `${file} (en)`);
  const missing = LOCALES.filter(locale => !release.copy[locale.tag]).map(locale => locale.tag);
  if (missing.length) throw new Error(`${file}: notes are missing for ${missing.join(', ')}`);
  for (const locale of LOCALES) {
    const copy = release.copy[locale.tag];
    checkCopy(copy, `${file} (${locale.tag})`);
    if (copy.sections.length !== english.sections.length) throw new Error(`${file} (${locale.tag}): ${copy.sections.length} sections, English has ${english.sections.length}`);
    copy.sections.forEach((section, index) => {
      if (Boolean(section.detail) !== Boolean(english.sections[index].detail)) throw new Error(`${file} (${locale.tag}): section ${index + 1} detail does not match English`);
    });
  }
  return release;
}

export async function loadReleases(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const releases = [];
  for (const name of names.filter(item => item.endsWith('.json'))) {
    const release = validateRelease(JSON.parse(await readFile(path.join(directory, name), 'utf8')), name);
    if (name !== `${release.version}.json`) throw new Error(`${name}: file name must be ${release.version}.json`);
    releases.push(release);
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

function renderRail(releases) {
  const links = releases.map(release => `<a href="#${anchor(release.version)}"><span>${release.version}</span><em>${escape(formatDate(release.date, 'en', false))}</em></a>`);
  return `<nav class="cl-rail-list">${links.join('')}</nav>`;
}

function renderRelease(release) {
  const id = anchor(release.version);
  const copy = release.copy.en;
  const items = copy.sections.map((section, index) => `
            <li><span class="cl-num" aria-hidden="true">${ROMAN[index]}</span><div><p class="cl-line"><strong>${escape(section.title)}</strong> ${escape(section.body)}</p>${section.detail ? `<p class="cl-detail">${escape(section.detail)}</p>` : ''}</div></li>`).join('');
  return `
        <article class="cl-release" id="${id}" aria-labelledby="${id}-title">
          <header class="cl-release-head">
            <time datetime="${release.date}">${escape(formatDate(release.date, 'en', true))}</time>
            <h2 id="${id}-title"><span>Codevalanche</span> <span class="cl-version">${release.version}</span></h2>
            <p class="cl-headline">${escape(copy.headline)}</p>
          </header>
          <ol class="cl-items">${items}
          </ol>
        </article>`;
}

/** Replaces the "first version coming soon" placeholder with the published versions. */
export function renderChangelog(html, releases) {
  if (!RAIL.test(html) || !RELEASES.test(html)) throw new Error('The changelog page has lost its release markers');
  if (releases.length === 0) return html;
  return html.replace(RAIL, () => renderRail(releases)).replace(RELEASES, () => releases.map(renderRelease).join(''));
}

/** English text on the rendered page mapped to the same text in one locale. */
export function changelogTranslations(releases, tag) {
  const entries = {};
  const add = (english, localized) => { entries[normalized(english)] = normalized(localized); };
  add('Codevalanche', 'Codevalanche');
  ROMAN.forEach(numeral => add(numeral, numeral));
  for (const release of releases) {
    const english = release.copy.en;
    const copy = release.copy[tag] ?? english;
    add(release.version, release.version);
    add(formatDate(release.date, 'en', true), formatDate(release.date, tag, true));
    add(formatDate(release.date, 'en', false), formatDate(release.date, tag, false));
    add(english.headline, copy.headline);
    english.sections.forEach((section, index) => {
      add(section.title, copy.sections[index].title);
      add(section.body, copy.sections[index].body);
      if (section.detail) add(section.detail, copy.sections[index].detail);
    });
  }
  return entries;
}
