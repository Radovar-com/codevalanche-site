// Renders the documentation from content/docs: one page per entry, with the
// shared navigation, search, "On this page", previous/next and per-page SEO.
// Pages are written in English (content/docs/sections) and translated into
// every site language (content/docs/i18n, see scripts/docs-i18n.mjs). The
// /docs/ hub is a translated marketing page (src/docs/index.html) generated
// from the same navigation.
import { DOCS_SECTIONS, DOCS_UPDATED, DOCS_VERSION } from '../content/docs/pages.mjs';
import { LOCALES } from '../src/locales/manifest.js';
import { CHROME, DOCS_LOCALES, loadPage, loadSite } from './docs-i18n.mjs';

export const SITE_ORIGIN = 'https://codevalanche.com';
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = html => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const ENGLISH = LOCALES[0];
const prefixOf = locale => (locale.slug ? `/${locale.slug}` : '');
const englishChrome = Object.fromEntries(CHROME.map(key => [key, key]));

// The docs of one language, as sections of pages. English when locale is omitted.
export function docsSections(locale = ENGLISH) {
  const site = locale.slug ? loadSite(locale.slug) : null;
  if (locale.slug && !site) throw new Error(`Docs translation ${locale.slug}/_site.json is missing: see scripts/docs-i18n.mjs`);
  const chrome = site ? { ...englishChrome, ...site.chrome } : englishChrome;
  const prefix = prefixOf(locale);
  return DOCS_SECTIONS.map(section => {
    const title = site?.sections?.[section.title] ?? section.title;
    return {
      title,
      pages: section.pages.map(page => {
        const translated = locale.slug ? loadPage(locale.slug, page) : null;
        if (locale.slug && !translated) throw new Error(`Docs page ${page.slug} has no ${locale.slug} translation: see scripts/docs-i18n.mjs`);
        const text = translated ?? { ...page, seoTitle: page.seoTitle ?? page.title };
        const localize = html => (prefix ? html.replace(/href="\/docs\//g, `href="${prefix}/docs/`) : html);
        return {
          slug: page.slug,
          nav: text.nav,
          title: text.title,
          seoTitle: text.seoTitle,
          description: text.description,
          lede: page.lede ? localize(text.lede) : undefined,
          body: localize(text.body),
          section: title,
          path: `${prefix}/docs/${page.slug}/`,
          file: `${locale.slug ? `${locale.slug}/` : ''}docs/${page.slug}/index.html`,
          locale,
          chrome,
        };
      }),
    };
  });
}

export const docsPagesFor = locale => docsSections(locale).flatMap(section => section.pages);
export const DOCS_PAGES = docsPagesFor(ENGLISH);
// Every docs page in every language whose translation is present.
export function allDocsPages() {
  return [...DOCS_PAGES, ...DOCS_LOCALES.flatMap(locale => docsPagesFor(locale))];
}

for (const page of DOCS_PAGES) {
  for (const field of ['slug', 'nav', 'title', 'description', 'body']) if (!page[field]) throw new Error(`Docs page ${page.slug ?? '?'} has no ${field}`);
  if (page.description.length > 170) throw new Error(`Docs page ${page.slug} description is longer than 170 characters`);
}
const slugs = new Set(DOCS_PAGES.map(page => page.slug));
if (slugs.size !== DOCS_PAGES.length) throw new Error('Two docs pages share a slug');

export function navHtml(currentPath, sections = docsSections()) {
  return sections.map(section => `<h2>${esc(section.title)}</h2>
        <ul>${section.pages.map(page => `<li><a href="${page.path}"${page.path === currentPath ? ' aria-current="page"' : ''}>${esc(page.nav)}</a></li>`).join('')}</ul>`).join('\n        ');
}

export function docsNavigation(currentPath, sections = docsSections(), chrome = englishChrome) {
  return `<nav class="docs-nav" aria-label="${esc(chrome.Documentation)}">
      <button class="docs-search" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>${esc(chrome['Search the docs'])}</span><kbd>Ctrl K</kbd></button>
      <button class="docs-nav-toggle" type="button" aria-expanded="false"><span>${esc(chrome['All documentation'])}</span><span aria-hidden="true">+</span></button>
      <div>
        ${navHtml(currentPath, sections)}
      </div>
    </nav>`;
}

const searchDialog = chrome => `<dialog class="docs-dialog" aria-label="${esc(chrome['Search the docs'])}"><input type="search" placeholder="${esc(chrome['Search the docs…'])}" aria-label="${esc(chrome['Search the docs'])}"><ul data-empty="${esc(chrome['No matching page.'])}"></ul></dialog>`;
export const SEARCH_DIALOG = searchDialog(englishChrome);

// Every internal link must lead to a docs page or a public site page.
export function checkLinks(page, knownPaths) {
  for (const match of page.body.matchAll(/href="(\/[^"#?]*)/g)) {
    const target = match[1];
    if (/^(?:\/[a-z-]+)?\/docs\/./.test(target) && !knownPaths.has(target)) throw new Error(`Docs page ${page.path} links to missing ${target}`);
  }
}

function headings(body) {
  return [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(match => ({ id: match[1], text: strip(match[2]).trim() }));
}

// Words for languages that separate them with spaces; characters for the others.
function readingMinutes(body, tag) {
  const text = strip(body);
  const units = /^(ja|zh)/i.test(tag) ? text.replace(/\s+/g, '').length / 500 : text.split(/\s+/).filter(Boolean).length / 200;
  return Math.max(2, Math.round(units));
}

function faqSchema(body) {
  const items = [...body.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  if (!items.length) return [];
  return [{ '@type': 'FAQPage', mainEntity: items.map(([, question, answer]) => ({ '@type': 'Question', name: strip(question).trim(), acceptedAnswer: { '@type': 'Answer', text: strip(answer).replace(/\s+/g, ' ').trim() } })) }];
}

export function renderDocsPage(page, pages = docsPagesFor(page.locale ?? ENGLISH)) {
  const locale = page.locale ?? ENGLISH;
  const chrome = page.chrome ?? englishChrome;
  const index = pages.findIndex(item => item.path === page.path);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  const url = `${SITE_ORIGIN}${page.path}`;
  const hub = `${prefixOf(locale)}/docs/`;
  const seoTitle = `${page.seoTitle ?? page.title} | ${chrome['Codevalanche Docs']}`;
  const toc = headings(page.body);
  const alternates = LOCALES.map(language => `<link rel="alternate" hreflang="${language.tag}" href="${SITE_ORIGIN}${prefixOf(language)}/docs/${page.slug}/">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/docs/${page.slug}/">`).join('\n  ');
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: seoTitle, inLanguage: locale.tag, isPartOf: { '@id': `${SITE_ORIGIN}/#website` } },
    { '@type': 'TechArticle', headline: page.title, description: page.description, url, inLanguage: locale.tag, dateModified: DOCS_UPDATED, about: { '@id': 'https://radovar.com/#codevalanche' }, publisher: { '@id': 'https://radovar.com/#organization' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: chrome.Docs, item: `${SITE_ORIGIN}${hub}` },
      { '@type': 'ListItem', position: 2, name: page.section },
      { '@type': 'ListItem', position: 3, name: page.title, item: url },
    ] },
    ...faqSchema(page.body),
  ] };
  return `<!doctype html>
<html lang="${locale.tag}" dir="${locale.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a0b0c">
  <meta name="description" content="${esc(page.description)}">
  <link rel="canonical" href="${url}">
  ${alternates}
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(seoTitle)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/codevalanche-link-preview.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(chrome['The Codevalanche logo.'])}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(seoTitle)}">
  <meta name="twitter:description" content="${esc(page.description)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}/assets/codevalanche-link-preview.png">
  <meta name="twitter:image:alt" content="${esc(chrome['The Codevalanche logo.'])}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <script>(function(){document.documentElement.setAttribute("data-theme","dark");document.documentElement.classList.add("js")})()</script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/product-pages.css">
  <link rel="stylesheet" href="/home.css">
  <link rel="stylesheet" href="/docs/docs.css">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <title>${esc(seoTitle)}</title>
</head>
<body>
  <a class="skip-link" href="#main">${esc(chrome['Skip to content'])}</a>
  <!-- site-header -->
  <div class="docs-shell">
    ${docsNavigation(page.path, docsSections(locale), chrome)}
    <main class="docs-article" id="main">
      <ol class="docs-crumbs"><li><a href="${hub}">${esc(chrome.Docs)}</a></li><li>${esc(page.section)}</li><li aria-current="page">${esc(page.nav)}</li></ol>
      <p class="kicker">${esc(page.section)}</p>
      <h1>${esc(page.title)}</h1>
      <p class="docs-lede">${page.lede ?? esc(page.description)}</p>
      <p class="docs-meta">${esc(chrome['{n} min read'].replace('{n}', readingMinutes(page.body, locale.tag)))} · Codevalanche ${DOCS_VERSION} · ${esc(chrome.Windows)}</p>
      ${page.body.trim()}
      <nav class="docs-pager" aria-label="${esc(chrome['Previous and next page'])}">
        ${previous ? `<a href="${previous.path}"><span>${esc(chrome.Previous)}</span>${esc(previous.nav)}</a>` : `<a href="${hub}"><span>${esc(chrome.Previous)}</span>${esc(chrome['Docs home'])}</a>`}
        ${next ? `<a class="next" href="${next.path}"><span>${esc(chrome.Next)}</span>${esc(next.nav)}</a>` : ''}
      </nav>
    </main>
    <aside class="docs-toc" aria-label="${esc(chrome['On this page'])}">
      <p>${esc(chrome['On this page'])}</p>
      <ul>${toc.map(item => `<li><a href="#${item.id}">${esc(item.text)}</a></li>`).join('')}</ul>
    </aside>
  </div>
  ${searchDialog(chrome)}
  <!-- site-footer -->
  <script src="/config.js"></script>
  <script src="/downloads.js"></script>
  <script type="module" src="/site.js"></script>
  <script type="module" src="/docs/docs.js"></script>
</body>
</html>
`;
}

// Plain text of every page of one language for the docs search and llms-full.txt.
export function docsSearchIndex(pages = DOCS_PAGES) {
  return pages.map(page => ({ title: page.title, nav: page.nav, href: page.path, section: page.section, text: strip(page.body).replace(/\s+/g, ' ').trim() }));
}

const docsPagePaths = new Set(DOCS_PAGES.map(page => page.path));
// In a translated page, links to docs pages lead to the same language.
export function localizeDocsLinks(html, locale) {
  const prefix = prefixOf(locale);
  if (!prefix) return html;
  return html.replace(/href="(\/docs\/[^"#?]+\/)((?:[?#][^"]*)?)"/g, (match, target, rest) => (docsPagePaths.has(target) ? `href="${prefix}${target}${rest}"` : match));
}

// The footer language menu of a docs page leads to the same page in each language.
export function pointLanguagesAtDocsPage(html, slug) {
  return html.replace(/<details class="lang-picker">[\s\S]*?<\/details>/, picker => picker.replace(/href="((?:\/[a-z-]+)?)\/docs\/"/g, `href="$1/docs/${slug}/"`));
}
