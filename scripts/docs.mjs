import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath } from '../src/locales/manifest.js';

const origin = 'https://codevalanche.com';
export const GUIDE_PAGES = MARKETING_PAGES.filter(page => page.path.startsWith('/docs/'));
const attrs = node => Object.fromEntries((node?.attrs ?? []).map(a => [a.name, a.value]));
function nodes(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  for (const child of node.childNodes ?? []) nodes(child, predicate, result);
  return result;
}
function text(node) {
  if (!node || ['template','script','style','nav'].includes(node.tagName) || 'hidden' in attrs(node)) return '';
  return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join(' ');
}
const clean = value => value.replace(/\s+/g, ' ').trim();

export function guideSearchIndex(documents) {
  return [...documents].map(([url, html]) => {
    const doc = parse(html);
    const title = clean(text(nodes(doc, n => n.tagName === 'title')[0]));
    const description = attrs(nodes(doc, n => n.tagName === 'meta' && attrs(n).name === 'description')[0]).content;
    const article = nodes(doc, n => n.tagName === 'article')[0];
    return { url, title, description, text: clean(text(article)) };
  });
}

// documents contains all public HTML routes; files contains static asset paths.
// Checking the registry as well as links catches an entirely missing translation.
export function validateGuide({ documents, files, locales = LOCALES }) {
  for (const locale of locales) for (const page of GUIDE_PAGES) {
    const route = localizedMarketingPath(page.path, locale.tag);
    if (!documents.has(route)) throw new Error(`Guide missing page: ${route}`);
  }
  const parsed = new Map([...documents].map(([url, html]) => [url, parse(html)]));
  for (const locale of locales) {
    const titles = new Set(), descriptions = new Set();
    for (const page of GUIDE_PAGES) {
      const route = localizedMarketingPath(page.path, locale.tag);
      const doc = parsed.get(route);
      if (!doc) throw new Error(`Guide missing page: ${route}`);
      const entry = guideSearchIndex(new Map([[route, documents.get(route)]]))[0];
      if (!entry.title || titles.has(entry.title) || !entry.description || descriptions.has(entry.description)) throw new Error(`Guide duplicate or empty metadata: ${route}`);
      titles.add(entry.title); descriptions.add(entry.description);
      for (const node of nodes(doc, n => ['a', 'img', 'source', 'script', 'link'].includes(n.tagName))) {
        const a = attrs(node);
        const references = [a.href, a.src, ...(a.srcset?.split(',').map(s => s.trim().split(/\s+/)[0]) ?? [])].filter(Boolean);
        for (const reference of references) {
          const url = new URL(reference, new URL(route, origin));
          if (url.origin !== origin) continue;
          const target = parsed.get(url.pathname);
          const file = decodeURIComponent(url.pathname).replace(/\/$/, '/index.html');
          if (!target && !files.has(file)) throw new Error(`Guide dead link: ${route} → ${reference}`);
          if (target && url.hash && !nodes(target, n => attrs(n).id === decodeURIComponent(url.hash.slice(1)) || attrs(n).name === decodeURIComponent(url.hash.slice(1))).length) throw new Error(`Guide missing fragment: ${route} → ${reference}`);
        }
      }
    }
  }
}

export async function buildGuide(destination, { englishOnly = false } = {}) {
  const locales = englishOnly ? LOCALES.filter(l => l.tag === 'en') : LOCALES;
  const documents = new Map();
  for (const locale of locales) for (const page of MARKETING_PAGES) {
    documents.set(localizedMarketingPath(page.path, locale.tag), await readFile(path.join(destination, locale.slug, page.file), 'utf8'));
  }
  const files = new Set((await readdir(destination, { recursive:true })).map(file => `/${file.split(path.sep).join('/')}`));
  validateGuide({ documents, files, locales });
  for (const locale of locales) {
    const pages = new Map(GUIDE_PAGES.map(page => {
      const url = localizedMarketingPath(page.path, locale.tag);
      return [url, documents.get(url)];
    }));
    await writeFile(path.join(destination, locale.slug, 'docs/search-index.json'), `${JSON.stringify(guideSearchIndex(pages))}\n`);
  }
  return { pages: GUIDE_PAGES.length * locales.length };
}
