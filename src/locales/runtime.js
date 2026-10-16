import { LOCALES, localizedMarketingPath, resolveMarketingRoute } from './manifest.js';

const LANGUAGE_COOKIE = 'codevalanche_language';
const initialization = new WeakMap();

function localeByValue(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return LOCALES.find(locale => locale.tag.toLowerCase() === key || locale.slug === key) ?? null;
}

function cookieValue(cookieHeader, name) {
  for (const part of String(cookieHeader ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return ''; }
  }
  return '';
}

export function getPreferredLocale(cookieHeader = '', pathname = '') {
  const route = resolveMarketingRoute(pathname);
  if (route && ['home', 'changelog', 'privacy', 'terms'].includes(route.pageId)) return localeByValue(route.locale) ?? LOCALES[0];
  const saved = localeByValue(cookieValue(cookieHeader, LANGUAGE_COOKIE));
  if (saved) return saved;
  const firstSegment = String(pathname).split('/').filter(Boolean)[0] ?? '';
  return localeByValue(firstSegment) ?? LOCALES[0];
}

export function translateText(sourceText, catalog = {}, variables = {}) {
  if (typeof sourceText !== 'string') return sourceText;
  const leading = sourceText.match(/^\s*/)?.[0] ?? '';
  const trailing = sourceText.match(/\s*$/)?.[0] ?? '';
  const source = sourceText.trim().replace(/\s+/g, ' ');
  if (!source) return sourceText;
  const translated = typeof catalog[source] === 'string' && catalog[source].trim() ? catalog[source] : source;
  const interpolated = translated.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : placeholder);
  return `${leading}${interpolated}${trailing}`;
}

export function localizeDocument(document, catalog, locale, root = document?.documentElement) {
  if (!document || !locale || !root) return;
  document.documentElement.lang = locale.tag;
  document.documentElement.dir = locale.dir;
  const walker = document.createTreeWalker(root, 4);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('script, style, template, code, pre, kbd, samp')) continue;
    if (textNode.parentElement?.closest('ul.lang-grid')) continue;
    textNode.nodeValue = translateText(textNode.nodeValue ?? '', catalog);
  }
  for (const element of root.querySelectorAll?.('[alt], [aria-label], [placeholder], [title]') ?? []) {
    for (const attribute of ['alt', 'aria-label', 'placeholder', 'title']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, translateText(element.getAttribute(attribute), catalog));
    }
  }
  for (const meta of root.querySelectorAll?.('meta[name="description"], meta[name="twitter:title"], meta[name="twitter:description"], meta[property="og:title"], meta[property="og:description"], meta[property="og:image:alt"], meta[name="twitter:image:alt"]') ?? []) {
    meta.content = translateText(meta.content, catalog);
  }
  const origin = document.location?.origin ?? document.defaultView?.location?.origin;
  for (const link of root.querySelectorAll?.('a[href]') ?? []) {
    try {
      if (link.hasAttribute('data-locale') || link.getAttribute('href').startsWith('#')) continue;
      const url = new URL(link.href, origin);
      const route = url.origin === origin ? resolveMarketingRoute(url.pathname) : null;
      if (!route || !['home', 'changelog', 'privacy', 'terms'].includes(route.pageId)) continue;
      url.pathname = localizedMarketingPath(url.pathname, locale.tag);
      link.href = `${url.pathname}${url.search}${url.hash}`;
    } catch {}
  }
  if (root === document.documentElement) document.documentElement.removeAttribute('data-locale-pending');
}

export function initializeLocale(document = globalThis.document, fetcher = globalThis.fetch) {
  if (!document) return Promise.resolve({ locale: LOCALES[0], catalog: {}, status: 'unavailable' });
  const cached = initialization.get(document);
  if (cached) return cached;
  const promise = (async () => {
    const preferred = getPreferredLocale(document.cookie, document.location?.pathname);
    const route = resolveMarketingRoute(document.location?.pathname ?? '');
    const localizedMarketingPage = route && route.locale !== 'en' && ['home', 'changelog', 'privacy', 'terms'].includes(route.pageId);
    document.documentElement.lang = preferred.tag;
    document.documentElement.dir = preferred.dir;
    if (route && ['home', 'changelog', 'privacy', 'terms'].includes(route.pageId)) {
      try {
        const secure = document.location?.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${LANGUAGE_COOKIE}=${encodeURIComponent(preferred.slug || 'en')}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
      } catch {}
    }
    let locale = preferred;
    let catalog = {};
    let status = 'ready';
    if (preferred.slug) {
      try {
        if (typeof fetcher !== 'function') throw new Error('Locale catalog fetch is unavailable');
        const response = await fetcher(`/locales/${preferred.slug}.json`, { credentials: 'same-origin', cache: 'force-cache', signal: AbortSignal.timeout(1500) });
        if (!response.ok) throw new Error(`Locale catalog request failed with ${response.status}`);
        const data = await response.json();
        if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Locale catalog is invalid');
        catalog = data;
      } catch {
        locale = localizedMarketingPage ? preferred : LOCALES[0];
        document.documentElement.lang = locale.tag;
        document.documentElement.dir = locale.dir;
        status = 'unavailable';
      }
    }
    const state = Object.freeze({ locale, catalog, status, translate: (text, variables) => translateText(text, catalog, variables) });
    const view = document.defaultView ?? globalThis.window;
    if (view) {
      view.CodevalancheLocale = state;
      try { view.dispatchEvent(new view.CustomEvent('codevalanche-locale-ready')); } catch {}
    }
    return state;
  })();
  initialization.set(document, promise);
  return promise;
}
