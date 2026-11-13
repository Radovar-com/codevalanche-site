// Writes src/docs/index.html, the translated docs home, from the docs navigation.
// Run after changing content/docs: node scripts/docs-hub.mjs
// (scripts/docs-hub.test.mjs fails when the committed hub is out of date.)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOCS_SECTIONS } from '../content/docs/pages.mjs';
import { docsNavigation, SEARCH_DIALOG } from './docs-render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HUB_FILE = path.join(ROOT, 'src', 'docs', 'index.html');
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PATHS = [
  ['/docs/install/', 'Install on Windows', 'Download, install and connect your first AI in a few minutes.'],
  ['/docs/your-ais/', 'Connect your AIs', 'Claude Code, Codex, Gemini CLI, API keys and several accounts.'],
  ['/docs/projects/coordinator/', 'The Coordinator', 'Give one goal; several agents do the work and it gets checked.'],
  ['/docs/local-models/', 'Local models', 'Run models on your own PC, private and offline.'],
];

export function renderHub() {
  const description = 'Learn Codevalanche: install it, connect Claude Code, Codex or local models, run projects with the Coordinator, and fix problems.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a0b0c">
  <meta name="description" content="${description}">
  <link rel="canonical" href="https://codevalanche.com/docs/">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://codevalanche.com/docs/">
  <meta property="og:title" content="Documentation | Codevalanche">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://codevalanche.com/assets/codevalanche-link-preview.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="The Codevalanche logo.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Documentation | Codevalanche">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://codevalanche.com/assets/codevalanche-link-preview.png">
  <meta name="twitter:image:alt" content="The Codevalanche logo.">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <script>(function(){document.documentElement.setAttribute("data-theme","dark");document.documentElement.classList.add("js")})()</script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/product-pages.css">
  <link rel="stylesheet" href="/home.css">
  <link rel="stylesheet" href="/docs/docs.css">
  <title>Documentation | Codevalanche</title>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <!-- site-header -->
  <div class="docs-shell docs-shell-hub">
    ${docsNavigation('/docs/')}
    <main class="docs-article" id="main">
      <header id="hero" data-analytics-section="hero">
      <p class="kicker">Documentation</p>
      <h1>Learn Codevalanche.</h1>
      <p class="docs-lede">Install it, connect the AIs you already use, give a project one goal and let the agents work. Every page describes the app as it is today.</p>
      </header>
      <section data-analytics-section="workflow">
      <h2 id="start">Pick a starting point</h2>
      <div class="docs-cards">${PATHS.map(([href, title, text]) => `<a href="${href}"><strong>${esc(title)}</strong><span>${esc(text)}</span></a>`).join('')}</div>
      </section>
      <section data-analytics-section="details">
      <h2 id="all">All documentation</h2>
      <div class="docs-hub-sections">${DOCS_SECTIONS.map(section => `<section><h3>${esc(section.title)}</h3><ul>${section.pages.map(page => `<li><a href="/docs/${page.slug}/">${esc(page.nav)}</a></li>`).join('')}</ul></section>`).join('')}</div>
      </section>
      <section data-analytics-section="faq">
      <h2 id="help">Need help?</h2>
      <div class="docs-cards"><a href="/docs/troubleshooting/"><strong>Fix a problem</strong><span>Solutions for install, connection, local model and agent problems.</span></a><a href="/docs/faq/"><strong>Questions</strong><span>Short answers to common questions.</span></a></div>
      <p>Write to us:</p>
      <p><a href="mailto:info@radovar.com" data-contact-id="info">info@radovar.com</a></p>
      </section>
    </main>
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

export async function hubIsCurrent() {
  return (await readFile(HUB_FILE, 'utf8')) === renderHub();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await writeFile(HUB_FILE, renderHub());
  console.log(`Wrote ${path.relative(ROOT, HUB_FILE)}`);
}
