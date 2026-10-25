import { parse, parseFragment, serialize } from 'parse5';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath, resolveMarketingRoute } from '../src/locales/manifest.js';

const SITE_ORIGIN = 'https://codevalanche.com';
const INDEXABLE_PAGE_IDS = new Set(MARKETING_PAGES.map(page => page.pageId));

function localeFor(value) {
  const key = String(value ?? '').toLowerCase();
  return LOCALES.find(locale => locale.tag.toLowerCase() === key || locale.slug === key) ?? null;
}

function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes ?? []) walk(child, callback);
}

function attributes(node) {
  return new Map((node.attrs ?? []).map(attribute => [attribute.name, attribute.value]));
}

function setAttribute(node, name, value) {
  node.attrs ??= [];
  const existing = node.attrs.find(attribute => attribute.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
}

function removeAttribute(node, name) {
  if (node.attrs) node.attrs = node.attrs.filter(attribute => attribute.name !== name);
}

function upsertMeta(document, keyName, keyValue, content) {
  let meta = findElement(document, (node, attrs) => node.tagName === 'meta' && (attrs.get(keyName) ?? '').toLowerCase() === keyValue.toLowerCase());
  if (!meta) {
    const head = findElement(document, node => node.tagName === 'head');
    if (!head) throw new Error('Cannot add social metadata: HTML document has no head element');
    meta = element('meta', [[keyName, keyValue], ['content', content]]);
    meta.parentNode = head;
    head.childNodes.push(meta);
  } else setAttribute(meta, 'content', content);
  return meta;
}

function findElement(document, predicate) {
  let found = null;
  walk(document, node => { if (!found && node.tagName && predicate(node, attributes(node))) found = node; });
  return found;
}

function getText(node) {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(getText).join('');
}

function element(tagName, attrs = [], text = null) {
  const node = { nodeName: tagName, tagName, attrs: attrs.map(([name, value]) => ({ name, value })), namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: [] };
  if (text !== null) node.childNodes.push({ nodeName: '#text', value: text, parentNode: node });
  return node;
}

export function rewriteLocalizedLinks(html, targetLocale) {
  const locale = localeFor(targetLocale);
  if (!locale) throw new Error(`Unknown locale: ${targetLocale}`);
  const document = parse(html);
  walk(document, node => {
    if (node.tagName !== 'a') return;
    const attrs = attributes(node);
    if (attrs.has('data-locale')) return;
    const href = attrs.get('href');
    if (!href || href.startsWith('#')) return;
    try {
      const url = new URL(href, SITE_ORIGIN);
      const route = url.origin === SITE_ORIGIN ? resolveMarketingRoute(url.pathname) : null;
      if (!route || !INDEXABLE_PAGE_IDS.has(route.pageId)) return;
      const pathname = localizedMarketingPath(url.pathname, locale.tag);
      setAttribute(node, 'href', `${pathname}${url.search}${url.hash}`);
    } catch {}
  });
  return serialize(document);
}

export function ensureLanguagePicker(html, pickerHtml) {
  const document = parse(html);
  const existing = findElement(document, (node, attrs) => node.tagName === 'details' && (attrs.get('class') ?? '').split(/\s+/).includes('lang-picker'));
  if (existing) return serialize(document);
  const footer = findElement(document, (node, attrs) => node.tagName === 'div' && (attrs.get('class') ?? '').split(/\s+/).includes('footer-bottom'));
  if (!footer) throw new Error('Cannot add language picker: footer-bottom is missing');
  const fragment = parseFragment(pickerHtml);
  for (const child of fragment.childNodes ?? []) child.parentNode = footer;
  footer.childNodes.push(...fragment.childNodes);
  return serialize(document);
}

export function rewriteFooterLanguageLinks(html, canonicalPath, currentLocale) {
  const locale = localeFor(currentLocale);
  const route = resolveMarketingRoute(canonicalPath);
  if (!locale) throw new Error(`Unknown locale: ${currentLocale}`);
  if (!route || !INDEXABLE_PAGE_IDS.has(route.pageId)) throw new Error(`Unknown footer route: ${canonicalPath}`);
  const document = parse(html);
  const picker = findElement(document, (node, attrs) => node.tagName === 'details' && (attrs.get('class') ?? '').split(/\s+/).includes('lang-picker'));
  if (!picker) throw new Error(`Language picker is missing from ${canonicalPath}`);
  const summary = findElement(picker, node => node.tagName === 'summary');
  if (summary) {
    for (const child of summary.childNodes ?? []) {
      if (child.nodeName === '#text' && child.value?.trim()) {
        const leading = child.value.match(/^\s*/)?.[0] ?? '';
        const trailing = child.value.match(/\s*$/)?.[0] ?? '';
        child.value = `${leading}${locale.label}${trailing}`;
        break;
      }
    }
  }
  if (summary) removeAttribute(summary, 'aria-label');
  const list = findElement(picker, (node, attrs) => node.tagName === 'ul' && (attrs.get('class') ?? '').split(/\s+/).includes('lang-grid'));
  if (!list) throw new Error('Language picker has no language list');
  for (const item of list.childNodes ?? []) {
    if (item.tagName !== 'li') continue;
    const itemAttrs = attributes(item);
    const codeElement = findElement(item, node => node.tagName === 'em');
    const rawCode = getText(codeElement ?? { childNodes: [] }).trim();
    const target = itemAttrs.get('class')?.split(/\s+/).includes('is-site') || rawCode.toLowerCase() === 'this site'
      ? LOCALES[0]
      : localeFor(rawCode);
    if (!target) throw new Error(`Unknown locale entry in footer picker: ${rawCode}`);
    if (codeElement && target.tag === 'en') codeElement.childNodes = [{ nodeName: '#text', value: 'en', parentNode: codeElement }];
    const active = target.tag === locale.tag;
    if (active) setAttribute(item, 'class', [...new Set([...(itemAttrs.get('class') ?? '').split(/\s+/).filter(Boolean).filter(value => value !== 'is-site'), 'is-site'])].join(' '));
    else setAttribute(item, 'class', (itemAttrs.get('class') ?? '').split(/\s+/).filter(value => value && value !== 'is-site').join(' '));
    const href = localizedMarketingPath(route.pathname, target.tag);
    let link = findElement(item, (node, attrs) => node.tagName === 'a' && attrs.has('data-locale'));
    if (link) {
      setAttribute(link, 'href', href);
      setAttribute(link, 'data-locale', target.slug || 'en');
    } else {
      link = element('a', [['href', href], ['data-locale', target.slug || 'en']]);
      link.childNodes = item.childNodes ?? [];
      for (const child of link.childNodes) child.parentNode = link;
      link.parentNode = item;
      item.childNodes = [link];
    }
    if (active) setAttribute(link, 'aria-current', 'page');
    else removeAttribute(link, 'aria-current');
  }
  return serialize(document);
}

function pageWebData(document, canonicalUrl, locale) {
  const title = findElement(document, node => node.tagName === 'title');
  return {
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: getText(title ?? { childNodes: [] }).trim(),
    inLanguage: locale.tag,
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    about: { '@id': 'https://radovar.com/#codevalanche' },
  };
}

function appendWebPageSchema(document, pageData) {
  let script = findElement(document, (node, attrs) => node.tagName === 'script' && (attrs.get('type') ?? '').toLowerCase() === 'application/ld+json');
  let graph;
  if (script) {
    const jsonText = (script.childNodes ?? []).map(child => child.value ?? '').join('');
    let schema;
    try { schema = JSON.parse(jsonText); } catch { throw new Error('Existing JSON-LD script is not valid JSON'); }
    if (Array.isArray(schema['@graph'])) graph = schema['@graph'];
    else if (schema['@type']) graph = [schema];
    else graph = [];
    graph = graph.filter(item => item?.['@type'] !== 'WebPage');
    graph.push(pageData);
    schema['@context'] ??= 'https://schema.org';
    schema['@graph'] = graph;
    script.childNodes = [{ nodeName: '#text', value: JSON.stringify(schema), parentNode: script }];
  } else {
    const head = findElement(document, node => node.tagName === 'head');
    if (!head) throw new Error('Cannot add structured data: HTML document has no head element');
    script = element('script', [['type', 'application/ld+json']], JSON.stringify({ '@context': 'https://schema.org', '@graph': [pageData] }));
    script.parentNode = head;
    head.childNodes.push(script);
  }
}

export function applyLocalizedMetadata(html, canonicalPath, targetLocale) {
  const locale = localeFor(targetLocale);
  if (!locale) throw new Error(`Unknown locale: ${targetLocale}`);
  const route = resolveMarketingRoute(canonicalPath);
  if (!route || !INDEXABLE_PAGE_IDS.has(route.pageId)) throw new Error(`Unknown indexable marketing path: ${canonicalPath}`);
  const document = parse(html);
  const htmlElement = findElement(document, node => node.tagName === 'html');
  if (!htmlElement) throw new Error('Cannot add locale metadata: HTML document has no html element');
  setAttribute(htmlElement, 'lang', locale.tag);
  setAttribute(htmlElement, 'dir', locale.dir);

  const localizedPath = localizedMarketingPath(route.pathname, locale.tag);
  const canonicalUrl = new URL(localizedPath, SITE_ORIGIN).href;
  const canonical = findElement(document, (node, attrs) => node.tagName === 'link' && (attrs.get('rel') ?? '').split(/\s+/).includes('canonical'));
  if (!canonical) throw new Error(`Missing canonical link for ${route.pathname}`);
  setAttribute(canonical, 'href', canonicalUrl);
  const titleElement = findElement(document, node => node.tagName === 'title');
  const title = getText(titleElement ?? { childNodes: [] }).trim();
  const descriptionElement = findElement(document, (node, attrs) => node.tagName === 'meta' && (attrs.get('name') ?? '').toLowerCase() === 'description');
  const description = attributes(descriptionElement ?? { attrs: [] }).get('content') ?? '';
  if (!title || !description) throw new Error(`Missing title or description for ${route.pathname}`);
  upsertMeta(document, 'property', 'og:type', 'website');
  upsertMeta(document, 'property', 'og:url', canonicalUrl);
  upsertMeta(document, 'property', 'og:title', title);
  upsertMeta(document, 'property', 'og:description', description);
  const hasImage = Boolean(findElement(document, (node, attrs) => node.tagName === 'meta' && (attrs.get('property') ?? '').toLowerCase() === 'og:image'));
  upsertMeta(document, 'name', 'twitter:card', hasImage ? 'summary_large_image' : 'summary');
  upsertMeta(document, 'name', 'twitter:title', title);
  upsertMeta(document, 'name', 'twitter:description', description);

  walk(document, node => {
    if (node.tagName !== 'link') return;
    const attrs = attributes(node);
    if ((attrs.get('rel') ?? '').split(/\s+/).includes('alternate') && attrs.has('hreflang')) node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node);
  });
  for (const language of LOCALES) {
    const href = new URL(localizedMarketingPath(route.pathname, language.tag), SITE_ORIGIN).href;
    const link = element('link', [['rel', 'alternate'], ['hreflang', language.tag], ['href', href]]);
    link.parentNode = findElement(document, node => node.tagName === 'head');
    link.parentNode.childNodes.push(link);
  }
  const fallback = element('link', [['rel', 'alternate'], ['hreflang', 'x-default'], ['href', new URL(route.pathname, SITE_ORIGIN).href]]);
  fallback.parentNode = findElement(document, node => node.tagName === 'head');
  fallback.parentNode.childNodes.push(fallback);

  appendWebPageSchema(document, pageWebData(document, canonicalUrl, locale));
  return serialize(document);
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function buildLocalizedSitemap() {
  const urls = [];
  for (const page of MARKETING_PAGES) {
    for (const locale of LOCALES) {
      const location = new URL(localizedMarketingPath(page.path, locale.tag), SITE_ORIGIN).href;
      const alternates = LOCALES.map(language => {
        const href = new URL(localizedMarketingPath(page.path, language.tag), SITE_ORIGIN).href;
        return `    <xhtml:link rel="alternate" hreflang="${escapeXml(language.tag)}" href="${escapeXml(href)}" />`;
      });
      alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(new URL(page.path, SITE_ORIGIN).href)}" />`);
      urls.push(`  <url>\n    <loc>${escapeXml(location)}</loc>\n${alternates.join('\n')}\n    <priority>${page.priority}</priority>\n  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}
