// Renders the documentation from content/docs: one page per entry, with the
// shared navigation, search, "On this page", previous/next and per-page SEO.
// Pages are written in English. The /docs/ hub is a translated marketing page
// (src/docs/index.html); it is generated from the same navigation.
import { DOCS_SECTIONS, DOCS_UPDATED, DOCS_VERSION } from '../content/docs/pages.mjs';

export const SITE_ORIGIN = 'https://codevalanche.com';
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = html => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export const DOCS_PAGES = DOCS_SECTIONS.flatMap(section => section.pages.map(page => ({
  ...page,
  section: section.title,
  path: `/docs/${page.slug}/`,
  file: `docs/${page.slug}/index.html`,
})));

for (const page of DOCS_PAGES) {
  for (const field of ['slug', 'nav', 'title', 'description', 'body']) if (!page[field]) throw new Error(`Docs page ${page.slug ?? '?'} has no ${field}`);
  if (page.description.length > 170) throw new Error(`Docs page ${page.slug} description is longer than 170 characters`);
}
const slugs = new Set(DOCS_PAGES.map(page => page.slug));
if (slugs.size !== DOCS_PAGES.length) throw new Error('Two docs pages share a slug');

export function navHtml(currentPath) {
  return DOCS_SECTIONS.map(section => `<h2>${esc(section.title)}</h2>
        <ul>${section.pages.map(page => {
          const href = `/docs/${page.slug}/`;
          return `<li><a href="${href}"${href === currentPath ? ' aria-current="page"' : ''}>${esc(page.nav)}</a></li>`;
        }).join('')}</ul>`).join('\n        ');
}

export function docsNavigation(currentPath) {
  return `<nav class="docs-nav" aria-label="Documentation">
      <button class="docs-search" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search the docs</span><kbd>Ctrl K</kbd></button>
      <button class="docs-nav-toggle" type="button" aria-expanded="false"><span>All documentation</span><span aria-hidden="true">+</span></button>
      <div>
        ${navHtml(currentPath)}
      </div>
    </nav>`;
}

export const SEARCH_DIALOG = '<dialog class="docs-dialog" aria-label="Search the docs"><input type="search" placeholder="Search the docs…" aria-label="Search the docs"><ul data-empty="No matching page."></ul></dialog>';

// Every internal link must lead to a docs page or a public site page.
export function checkLinks(page, knownPaths) {
  for (const match of page.body.matchAll(/href="(\/[^"#?]*)/g)) {
    const target = match[1];
    if (target.startsWith('/docs/') && !knownPaths.has(target)) throw new Error(`Docs page ${page.slug} links to missing ${target}`);
  }
}

function headings(body) {
  return [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(match => ({ id: match[1], text: strip(match[2]).trim() }));
}

function readingMinutes(body) {
  return Math.max(2, Math.round(strip(body).split(/\s+/).filter(Boolean).length / 200));
}

function faqSchema(body) {
  const items = [...body.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  if (!items.length) return [];
  return [{ '@type': 'FAQPage', mainEntity: items.map(([, question, answer]) => ({ '@type': 'Question', name: strip(question).trim(), acceptedAnswer: { '@type': 'Answer', text: strip(answer).replace(/\s+/g, ' ').trim() } })) }];
}

export function renderDocsPage(page) {
  const index = DOCS_PAGES.indexOf(page);
  const previous = DOCS_PAGES[index - 1];
  const next = DOCS_PAGES[index + 1];
  const url = `${SITE_ORIGIN}${page.path}`;
  const seoTitle = `${page.seoTitle ?? page.title} | Codevalanche Docs`;
  const toc = headings(page.body);
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: seoTitle, inLanguage: 'en', isPartOf: { '@id': `${SITE_ORIGIN}/#website` } },
    { '@type': 'TechArticle', headline: page.title, description: page.description, url, inLanguage: 'en', dateModified: DOCS_UPDATED, about: { '@id': 'https://radovar.com/#codevalanche' }, publisher: { '@id': 'https://radovar.com/#organization' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Docs', item: `${SITE_ORIGIN}/docs/` },
      { '@type': 'ListItem', position: 2, name: page.section },
      { '@type': 'ListItem', position: 3, name: page.title, item: url },
    ] },
    ...faqSchema(page.body),
  ] };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a0b0c">
  <meta name="description" content="${esc(page.description)}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="en" href="${url}">
  <link rel="alternate" hreflang="x-default" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(seoTitle)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/codevalanche-link-preview.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="The Codevalanche logo.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(seoTitle)}">
  <meta name="twitter:description" content="${esc(page.description)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}/assets/codevalanche-link-preview.png">
  <meta name="twitter:image:alt" content="The Codevalanche logo.">
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
  <a class="skip-link" href="#main">Skip to content</a>
  <!-- site-header -->
  <div class="docs-shell">
    ${docsNavigation(page.path)}
    <main class="docs-article" id="main">
      <ol class="docs-crumbs"><li><a href="/docs/">Docs</a></li><li>${esc(page.section)}</li><li aria-current="page">${esc(page.nav)}</li></ol>
      <p class="kicker">${esc(page.section)}</p>
      <h1>${esc(page.title)}</h1>
      <p class="docs-lede">${page.lede ?? esc(page.description)}</p>
      <p class="docs-meta">${readingMinutes(page.body)} min read · Codevalanche ${DOCS_VERSION} · Windows</p>
      ${page.body.trim()}
      <nav class="docs-pager" aria-label="Previous and next page">
        ${previous ? `<a href="${previous.path}"><span>Previous</span>${esc(previous.nav)}</a>` : '<a href="/docs/"><span>Previous</span>Docs home</a>'}
        ${next ? `<a class="next" href="${next.path}"><span>Next</span>${esc(next.nav)}</a>` : ''}
      </nav>
    </main>
    <aside class="docs-toc" aria-label="On this page">
      <p>On this page</p>
      <ul>${toc.map(item => `<li><a href="#${item.id}">${esc(item.text)}</a></li>`).join('')}</ul>
    </aside>
  </div>
  ${SEARCH_DIALOG}
  <!-- site-footer -->
  <script src="/config.js"></script>
  <script src="/downloads.js"></script>
  <script type="module" src="/site.js"></script>
  <script type="module" src="/docs/docs.js"></script>
</body>
</html>
`;
}

// Plain text of every page for the docs search and llms-full.txt.
export function docsSearchIndex() {
  return DOCS_PAGES.map(page => ({ title: page.title, nav: page.nav, href: page.path, section: page.section, text: strip(page.body).replace(/\s+/g, ' ').trim() }));
}
