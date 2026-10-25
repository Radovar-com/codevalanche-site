import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath } from '../src/locales/manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ORIGIN = 'https://codevalanche.com';

function walk(node, predicate, output = []) {
  if (predicate(node)) output.push(node);
  for (const child of node.childNodes ?? []) walk(child, predicate, output);
  return output;
}

function attrs(node) {
  return new Map((node.attrs ?? []).map(attribute => [attribute.name, attribute.value]));
}

function text(node) {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(text).join('');
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`SEO export validation failed: ${message}`);
}

export function validateSitemapLocations(sitemap, canonicalUrls) {
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  requireValue(locations.length === canonicalUrls.size, 'sitemap route count does not match exported public pages');
  const localeSlugs = new Set(LOCALES.filter(locale => locale.slug).map(locale => locale.slug));
  for (const location of locations) {
    const segments = new URL(location).pathname.toLowerCase().split('/').filter(Boolean);
    if (localeSlugs.has(segments[0])) segments.shift();
    requireValue(!/^(?:account(?:\.html)?|authorize|signed-in|admin-accounts|insights)$/.test(segments[0] ?? ''), 'sitemap contains an account route');
  }
  for (const url of canonicalUrls) requireValue(locations.includes(url), `sitemap is missing ${url}`);
}

// Discover documents independently of the route manifest: a newly copied page
// must never bypass the sitemap and reciprocal alternate checks below.
export async function validatePublicPageInventory(destination) {
  const registered = new Set(MARKETING_PAGES.flatMap(page => LOCALES.map(locale => path.posix.join(locale.slug, page.file))));
  async function inspect(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) { await inspect(path.join(directory, entry.name), file); continue; }
      if (!file.endsWith('.html')) continue;
      const document = parse(await readFile(path.join(destination, file), 'utf8'));
      const noindex = walk(document, node => node.tagName === 'meta' && /^(robots|googlebot)$/i.test(attrs(node).get('name') ?? ''))
        .some(node => /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(attrs(node).get('content') ?? ''));
      if (registered.has(file)) requireValue(!noindex, `public page ${file} has noindex`);
      else requireValue(noindex, `unregistered indexable page ${file}: register it for sitemap and hreflang export`);
    }
  }
  await inspect(destination);
}

export async function validateSeoExport(destination) {
  await validatePublicPageInventory(destination);
  const canonicalUrls = new Set();
  const titles = new Set();
  const descriptions = new Set();
  for (const page of MARKETING_PAGES) {
    for (const locale of LOCALES) {
      const urlPath = localizedMarketingPath(page.path, locale.tag);
      const relative = page.path === '/'
        ? path.join(locale.slug, 'index.html')
        : path.join(locale.slug, page.file);
      const html = await readFile(path.join(destination, relative), 'utf8');
      const document = parse(html);
      const htmlRoot = walk(document, node => node.tagName === 'html')[0];
      const rootAttrs = attrs(htmlRoot ?? {});
      requireValue(rootAttrs.get('lang') === locale.tag, `${relative} has wrong lang`);
      requireValue(rootAttrs.get('dir') === locale.dir, `${relative} has wrong direction`);

      const canonicalNodes = walk(document, node => node.tagName === 'link' && (attrs(node).get('rel') ?? '').split(/\s+/).includes('canonical'));
      const canonicalUrl = new URL(urlPath, SITE_ORIGIN).href;
      requireValue(canonicalNodes.length === 1 && attrs(canonicalNodes[0]).get('href') === canonicalUrl, `${relative} has wrong canonical`);
      canonicalUrls.add(canonicalUrl);

      const title = walk(document, node => node.tagName === 'title')[0];
      const description = walk(document, node => node.tagName === 'meta' && attrs(node).get('name') === 'description')[0];
      requireValue(Boolean(text(title).trim()), `${relative} has no title`);
      requireValue(Boolean(attrs(description ?? {}).get('content')?.trim()), `${relative} has no description`);
      const titleKey = `${locale.tag}:${text(title).trim()}`;
      const descriptionKey = `${locale.tag}:${attrs(description).get('content').trim()}`;
      requireValue(!titles.has(titleKey), `${relative} has a duplicate title within its language`);
      requireValue(!descriptions.has(descriptionKey), `${relative} has a duplicate description within its language`);
      titles.add(titleKey);
      descriptions.add(descriptionKey);
      for (const [kind, key] of [['property', 'og:url'], ['property', 'og:title'], ['property', 'og:description'], ['name', 'twitter:card'], ['name', 'twitter:title'], ['name', 'twitter:description']]) {
        const meta = walk(document, node => node.tagName === 'meta' && (attrs(node).get(kind) ?? '').toLowerCase() === key)[0];
        requireValue(Boolean(attrs(meta ?? {}).get('content')?.trim()), `${relative} is missing ${key}`);
      }
      requireValue(attrs(walk(document, node => node.tagName === 'meta' && attrs(node).get('property') === 'og:url')[0] ?? {}).get('content') === canonicalUrl, `${relative} has inconsistent og:url`);

      const alternates = walk(document, node => node.tagName === 'link' && (attrs(node).get('rel') ?? '').split(/\s+/).includes('alternate') && attrs(node).has('hreflang'));
      requireValue(alternates.length === LOCALES.length + 1, `${relative} has ${alternates.length} hreflang links`);
      for (const language of LOCALES) {
        const alternate = alternates.find(node => attrs(node).get('hreflang') === language.tag);
        const expected = new URL(localizedMarketingPath(page.path, language.tag), SITE_ORIGIN).href;
        requireValue(alternate && attrs(alternate).get('href') === expected, `${relative} has inconsistent ${language.tag} alternate`);
      }
      const fallback = alternates.find(node => attrs(node).get('hreflang') === 'x-default');
      requireValue(fallback && attrs(fallback).get('href') === new URL(page.path, SITE_ORIGIN).href, `${relative} has inconsistent x-default`);

      const schemaScripts = walk(document, node => node.tagName === 'script' && (attrs(node).get('type') ?? '').toLowerCase() === 'application/ld+json');
      const schemas = schemaScripts.map(script => JSON.parse((script.childNodes ?? []).map(child => child.value ?? '').join('')));
      const graph = schemas.flatMap(schema => Array.isArray(schema['@graph']) ? schema['@graph'] : [schema]);
      const webPages = graph.filter(item => item?.['@type'] === 'WebPage');
      requireValue(webPages.some(item => item['@id'] === `${canonicalUrl}#webpage` && item.url === canonicalUrl && item.inLanguage === locale.tag), `${relative} is missing route WebPage schema`);
      const csp = walk(document, node => node.tagName === 'meta' && (attrs(node).get('http-equiv') ?? '').toLowerCase() === 'content-security-policy')[0];
      requireValue(Boolean(attrs(csp ?? {}).get('content')?.includes("script-src 'self'")), `${relative} has no strict CSP`);
      const localeBootstrap = walk(document, node => node.tagName === 'script' && (attrs(node).get('src') ?? '').split('?')[0] === '/locales/bootstrap.js')[0];
      requireValue(Boolean(localeBootstrap), `${relative} has no locale runtime bootstrap`);
    }
  }

  const sitemap = await readFile(path.join(destination, 'sitemap.xml'), 'utf8');
  validateSitemapLocations(sitemap, canonicalUrls);

  const robots = await readFile(path.join(destination, 'robots.txt'), 'utf8');
  for (const route of ['/account/', '/admin-accounts/', '/insights/']) requireValue(robots.includes(`Disallow: ${route}`), `robots.txt does not exclude ${route}`);
  requireValue(robots.includes('https://codevalanche.com/sitemap.xml'), 'robots.txt has no sitemap reference');
  const [llms, full] = await Promise.all([
    readFile(path.join(destination, 'llms.txt'), 'utf8'),
    readFile(path.join(destination, 'llms-full.txt'), 'utf8'),
  ]);
  requireValue(llms.includes('/llms-full.txt') && llms.includes('/sitemap.xml'), 'llms.txt is missing discovery links');
  requireValue((full.match(/^## /gm) ?? []).length === canonicalUrls.size, 'llms-full.txt does not cover every public route');
  requireValue(!/\/account\/(?:authorize|signed-in)/i.test(full), 'llms-full.txt includes an account callback route');
  return { publicPages: canonicalUrls.size, localeAlternates: LOCALES.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await validateSeoExport(path.join(ROOT, 'dist'));
  console.log(`Verified ${result.publicPages} public routes across ${result.localeAlternates} locale variants`);
}
