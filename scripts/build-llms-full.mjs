import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath } from '../src/locales/manifest.js';

const SITE_ORIGIN = 'https://codevalanche.com';

function textContent(node, excluded = false) {
  const skip = excluded || ['script', 'style', 'svg'].includes(node.tagName);
  if (skip) return '';
  if (node.nodeName === '#text') return (node.value ?? '').replace(/\s+/g, ' ').trim();
  return (node.childNodes ?? []).map(child => textContent(child, skip)).filter(Boolean).join(' ');
}

function pageTitle(document) {
  const find = node => {
    if (node.tagName === 'title') return (node.childNodes ?? []).map(child => child.value ?? '').join('').trim();
    for (const child of node.childNodes ?? []) { const title = find(child); if (title) return title; }
    return '';
  };
  return find(document);
}

export function renderLlmsFull(documents) {
  const sections = ['# Codevalanche public site content', '', `Source: ${SITE_ORIGIN}/`, ''];
  for (const document of documents) {
    const parsed = parse(document.html);
    sections.push(`## ${document.locale} — ${document.title}`);
    sections.push(`URL: ${SITE_ORIGIN}${document.url}`);
    sections.push('');
    sections.push(textContent(parsed).replace(/\s+/g, ' ').trim());
    sections.push('');
  }
  return `${sections.join('\n')}\n`;
}

export async function buildLlmsFull(destination, outputFile = path.join(destination, 'llms-full.txt')) {
  const documents = [];
  for (const page of MARKETING_PAGES) {
    for (const locale of LOCALES) {
      const url = localizedMarketingPath(page.path, locale.tag);
      const relativePath = page.path === '/'
        ? path.join(locale.slug, 'index.html')
        : path.join(locale.slug, page.file);
      const html = await readFile(path.join(destination, relativePath), 'utf8');
      const parsed = parse(html);
      documents.push({ locale: locale.tag, url, title: pageTitle(parsed), html });
    }
  }
  const content = renderLlmsFull(documents);
  await writeFile(outputFile, content);
  return { pages: documents.length, outputFile };
}
