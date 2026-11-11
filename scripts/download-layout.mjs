import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parse, parseFragment, serialize } from 'parse5';
import { LOCALES } from '../src/locales/manifest.js';
import { releaseState } from '../src/release-actions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) { const found = find(child, predicate); if (found) return found; }
}

export async function prepareDownloadLayout(destination, manifest) {
  if (releaseState(manifest).status !== 'available') return;
  const runtimeKeys = JSON.parse(await readFile(path.join(ROOT, 'src/locales/runtime-strings.en.json'), 'utf8'));
  const sources = (await Promise.all(['release-actions.js', 'download-experience.js'].map(file => readFile(path.join(ROOT, 'src', file), 'utf8')))).join('\n');
  const keys = runtimeKeys.filter(key => sources.includes(key));
  const bundle = (await build({ entryPoints: [path.join(ROOT, 'scripts/download-layout-client.js')], bundle: true, write: false, format: 'iife', minify: true, charset: 'utf8', target: 'es2022', legalComments: 'none' })).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  for (const locale of LOCALES) {
    const source = locale.slug ? JSON.parse(await readFile(path.join(ROOT, 'src/locales', `${locale.slug}.json`), 'utf8')) : {};
    const catalog = Object.fromEntries(keys.map(key => {
      if (locale.slug && typeof source[key] !== 'string') throw new Error(`Missing native download layout string: ${locale.tag}: ${key}`);
      return [key, locale.slug ? source[key] : key];
    }));
    const payload = JSON.stringify({ manifest, catalog }).replaceAll('<', '\\u003c');
    for (const page of ['index.html', 'download/index.html']) {
      const file = path.join(destination, locale.slug, page);
      let html;
      try { html = await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const document = parse(html);
      const main = find(document, node => node.tagName === 'main');
      const hero = main && find(main, node => node.tagName === 'section');
      if (!hero) continue;
      // Parser-blocking own code after the hero initializes its existing controls
      // before the first paint. The CSP pass hashes it exactly like the theme boot.
      const fragment = parseFragment(`<script id="download-layout-data" type="application/json">${payload}</script><script>${bundle}</script>`);
      for (const node of fragment.childNodes) node.parentNode = hero;
      hero.childNodes.push(...fragment.childNodes);
      await writeFile(file, serialize(document));
    }
  }
}
