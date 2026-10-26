import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const rendering = await import('./optimize-rendering.mjs').catch(() => ({}));

test('font payload stays within the subset budget without dropping font-display or Unicode ranges', async () => {
  const directory = new URL('../src/assets/fonts/', import.meta.url);
  const fonts = (await readdir(directory)).filter(name => name.endsWith('.woff2'));
  let bytes = 0;
  for (const file of fonts) bytes += (await readFile(new URL(file, directory))).length;
  assert.ok(bytes <= 200_000, `${bytes} font bytes exceeds subset budget`);
  const css = await readFile(new URL('fonts.css', directory), 'utf8');
  for (const face of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    assert.match(face[1], /font-display:\s*swap/);
    assert.match(face[1], /unicode-range:/);
  }
});
test('rendering export eliminates the CSS import waterfall and preloads only a used heading font', async () => {
  assert.equal(typeof rendering.optimizeRendering, 'function');
  const root = await mkdtemp(path.join(tmpdir(), 'rendering-'));
  const put = async (file, content) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), content); };
  try {
    await put('assets/fonts/fonts.css', '@font-face { font-family: Test; font-display: swap; src: url(/assets/fonts/test.woff2); }');
    await put('styles.css', '@import url("/assets/fonts/fonts.css");\nbody { color: #ffffff; } @media (max-width: 700px) { body { color: #000000; } }');
    for (const [file, lang] of [['index.html','en'],['ro/index.html','ro'],['ar/index.html','ar'],['download/index.html','en'],['ro/download/index.html','ro'],['ar/download/index.html','ar']]) await put(file, `<html lang="${lang}"><head><link rel="stylesheet" href="/styles.css"></head><body><script src="/config.js"></script><script src="/downloads.js"></script><script type="module" src="/site.js"></script></body></html>`);
    await rendering.optimizeRendering(root);
    const css = await readFile(path.join(root, 'styles.css'), 'utf8');
    assert.ok(!css.includes('@import'));
    assert.match(css, /@font-face/);
    assert.match(css, /@media/);
    assert.ok(css.length < 250);
    for (const file of ['index.html','ro/index.html']) {
      const html = await readFile(path.join(root, file), 'utf8');
      assert.equal((html.match(/rel="preload"/g) ?? []).length, 1);
      assert.match(html, /as="font"[^>]*crossorigin/);
      assert.match(html, /<script src="\/config.js" defer/);
      assert.match(html, /<script src="\/downloads.js" defer/);
    }
    assert.doesNotMatch(await readFile(path.join(root, 'ar/index.html'), 'utf8'), /rel="preload"/);
    for (const file of ['download/index.html','ro/download/index.html','ar/download/index.html']) {
      const html = await readFile(path.join(root, file), 'utf8');
      assert.equal((html.match(/rel="preload"/g) ?? []).length, 1);
      assert.match(html, /geist-4\.woff2/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('a variable font is declared once for its complete used weight range', async () => {
  const css = await readFile(new URL('../src/assets/fonts/fonts.css', import.meta.url), 'utf8');
  const urls = [...css.matchAll(/src:\s*url\(([^)]+)\)/g)].map(match => match[1]);
  assert.equal(urls.length, new Set(urls).size, 'duplicate weight declarations delay font CSS discovery');
});
