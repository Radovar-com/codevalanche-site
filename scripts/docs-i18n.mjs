// Translations of the docs pages. English lives in content/docs/sections; each
// other language has one JSON file per page in content/docs/i18n/<locale>/,
// plus _site.json for the section names and the words around every page.
//
// A translation records the hash of the English it was made from ("source").
// When the English page changes, the check fails until the page is translated
// again, so a language never shows an older version of a page silently.
//
//   node scripts/docs-i18n.mjs extract <dir>   English sources for translators
//   node scripts/docs-i18n.mjs check [locale]  validate translations
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFragment } from 'parse5';
import { LOCALES } from '../src/locales/manifest.js';
import { DOCS_SECTIONS } from '../content/docs/pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const I18N_DIR = path.join(ROOT, 'content/docs/i18n');
export const DOCS_LOCALES = LOCALES.filter(locale => locale.slug);

// Words around every docs page. Keys are the English text; {n} is a number.
export const CHROME = [
  'Docs', 'Codevalanche Docs', 'Documentation', 'Search the docs', 'Search the docs…', 'No matching page.',
  'All documentation', 'On this page', 'Previous', 'Next', 'Docs home', 'Previous and next page',
  '{n} min read', 'Windows', 'Skip to content', 'The Codevalanche logo.',
];

const PAGE_FIELDS = ['nav', 'title', 'seoTitle', 'description', 'body'];
export const pageFile = slug => `${slug.replaceAll('/', '--')}.json`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

export function englishPage(page) {
  const fields = { nav: page.nav, title: page.title, seoTitle: page.seoTitle ?? page.title, description: page.description };
  if (page.lede) fields.lede = page.lede;
  fields.body = page.body.trim();
  return { source: hash(fields), ...fields };
}

export function englishSite() {
  const fields = { sections: Object.fromEntries(DOCS_SECTIONS.map(section => [section.title, section.title])), chrome: Object.fromEntries(CHROME.map(key => [key, key])) };
  return { source: hash(fields), ...fields };
}

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export function loadSite(slug) {
  const file = path.join(I18N_DIR, slug, '_site.json');
  return existsSync(file) ? readJson(file) : null;
}
export function loadPage(slug, page) {
  const file = path.join(I18N_DIR, slug, pageFile(page.slug));
  return existsSync(file) ? readJson(file) : null;
}

// The shape of the HTML: every element with its attributes, and the exact text
// of code and keys. Words may change; structure, links and code may not.
function shape(html) {
  const out = [];
  const visit = (node, inLiteral) => {
    if (node.nodeName === '#text') {
      if (inLiteral) out.push(`text:${node.value}`);
      return;
    }
    if (!node.tagName) { for (const child of node.childNodes ?? []) visit(child, inLiteral); return; }
    const attrs = (node.attrs ?? []).map(attr => `${attr.name}=${attr.value}`).sort().join(' ');
    out.push(`<${node.tagName} ${attrs}>`);
    const literal = inLiteral || node.tagName === 'code' || node.tagName === 'kbd' || node.tagName === 'svg';
    for (const child of node.childNodes ?? []) visit(child, literal);
    out.push(`</${node.tagName}>`);
  };
  visit(parseFragment(html), false);
  return out;
}
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function checkPage(page, translated) {
  const problems = [];
  const english = englishPage(page);
  if (!translated) return [`${page.slug}: missing`];
  if (translated.source !== english.source) problems.push(`${page.slug}: English changed since this translation (source ${translated.source} ≠ ${english.source})`);
  for (const field of [...PAGE_FIELDS, ...(english.lede ? ['lede'] : [])]) {
    if (typeof translated[field] !== 'string' || !translated[field].trim()) problems.push(`${page.slug}: ${field} is empty`);
  }
  if (problems.length) return problems;
  for (const field of ['nav', 'title', 'seoTitle', 'description']) {
    if (/[<>]/.test(translated[field])) problems.push(`${page.slug}: ${field} must be plain text`);
  }
  if (translated.description.length > 200) problems.push(`${page.slug}: description is longer than 200 characters`);
  for (const field of ['body', ...(english.lede ? ['lede'] : [])]) {
    const a = shape(english[field]);
    const b = shape(translated[field]);
    const at = a.findIndex((item, index) => item !== b[index]);
    if (at !== -1 || a.length !== b.length) {
      const index = at === -1 ? Math.min(a.length, b.length) : at;
      problems.push(`${page.slug}: ${field} HTML differs from English at item ${index}: expected ${JSON.stringify(a[index] ?? 'end')}, found ${JSON.stringify(b[index] ?? 'end')}`);
    }
  }
  if (plain(translated.body) === plain(english.body)) problems.push(`${page.slug}: body is not translated`);
  return problems;
}

export function checkSite(site) {
  const english = englishSite();
  if (!site) return ['_site: missing'];
  const problems = [];
  if (site.source !== english.source) problems.push(`_site: English changed since this translation`);
  for (const group of ['sections', 'chrome']) {
    for (const key of Object.keys(english[group])) {
      const value = site[group]?.[key];
      if (typeof value !== 'string' || !value.trim()) problems.push(`_site: ${group} "${key}" is missing`);
      else if (key.includes('{n}') && !value.includes('{n}')) problems.push(`_site: chrome "${key}" must keep {n}`);
    }
  }
  return problems;
}

export function checkLocale(slug) {
  const pages = DOCS_SECTIONS.flatMap(section => section.pages);
  const problems = [...checkSite(loadSite(slug))];
  const titles = new Set();
  for (const page of pages) {
    const translated = loadPage(slug, page);
    problems.push(...checkPage(page, translated));
    const title = translated?.seoTitle;
    if (title && titles.has(title)) problems.push(`${page.slug}: seoTitle "${title}" is used by another page`);
    if (title) titles.add(title);
  }
  return problems.map(problem => `${slug}/${problem}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, argument] = process.argv.slice(2);
  if (command === 'extract') {
    const dir = path.resolve(argument ?? 'docs-en');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_site.json'), `${JSON.stringify(englishSite(), null, 2)}\n`);
    for (const page of DOCS_SECTIONS.flatMap(section => section.pages)) writeFileSync(path.join(dir, pageFile(page.slug)), `${JSON.stringify(englishPage(page), null, 2)}\n`);
    console.log(`English sources written to ${dir}`);
  } else if (command === 'check') {
    const locales = argument ? [argument] : DOCS_LOCALES.map(locale => locale.slug);
    const problems = locales.flatMap(checkLocale);
    for (const problem of problems) console.log(problem);
    console.log(problems.length ? `${problems.length} problem(s)` : `OK: ${locales.join(', ')}`);
    process.exitCode = problems.length ? 1 : 0;
  } else {
    console.log('usage: node scripts/docs-i18n.mjs extract <dir> | check [locale]');
    process.exitCode = 2;
  }
}
