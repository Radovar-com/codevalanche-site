import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';
import { parse, parseFragment, serialize } from 'parse5';
import { MARKETING_PAGES, DOWNLOAD_STARTED_PAGE, LOCALES } from '../src/locales/manifest.js';

// Keep critical layout in a regular render-blocking stylesheet. Inline its font
// declarations during export so CSS discovery does not add another network hop.
export async function optimizeRendering(destination) {
  async function styles(relative = '') {
    for (const entry of await readdir(path.join(destination, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) { await styles(file); continue; }
      if (!file.endsWith('.css')) continue;
      let css = await readFile(path.join(destination, file), 'utf8');
      if (file === 'styles.css') css = css.replace('@import url("/assets/fonts/fonts.css");', await readFile(path.join(destination, 'assets/fonts/fonts.css'), 'utf8'));
      const result = await transform(css, { loader: 'css', minify: true, target: 'es2022', legalComments: 'inline' });
      await writeFile(path.join(destination, file), result.code);
    }
  }
  await styles();
  const latinHeadings = new Set(['en', 'de', 'es', 'fr', 'id', 'it', 'pt-BR', 'ro', 'tr', 'vi']);
  for (const locale of LOCALES) for (const page of [...MARKETING_PAGES, DOWNLOAD_STARTED_PAGE]) {
    const file = path.join(destination, locale.slug, page.file);
    let html;
    try { html = await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const document = parse(html);
    function visit(node) {
      if (node.tagName === 'head' && (page.path === '/download/' || latinHeadings.has(locale.tag))) {
        const font = page.path === '/download/' ? 'geist-4.woff2' : 'newsreader-latin.woff2';
        const link = parseFragment(`<link rel="preload" href="/assets/fonts/${font}" as="font" type="font/woff2" crossorigin>`).childNodes[0];
        link.parentNode = node;
        const charset = node.childNodes.findIndex(child => child.tagName === 'meta' && child.attrs.some(attr => attr.name === 'charset'));
        node.childNodes.splice(charset + 1, 0, link);
      }
      if (node.tagName === 'script') {
        const attrs = new Map(node.attrs.map(attr => [attr.name, attr.value]));
        if (attrs.has('src') && !attrs.has('type') && !attrs.has('defer')) node.attrs.push({ name: 'defer', value: '' });
      }
      for (const child of node.childNodes ?? []) visit(child);
    }
    visit(document);
    await writeFile(file, serialize(document));
  }
}
