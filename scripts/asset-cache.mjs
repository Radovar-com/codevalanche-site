import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { parse, serialize } from 'parse5';

const ORIGIN = 'https://codevalanche.com';
const CONTENT_HASH_ASSETS = ['/account/app.js', '/account/account.css', '/config.js'];
const PRESERVE_GENERATED = new Set(['/account/app.js', '/analytics/owned-analytics.js']);

async function listFiles(root, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

function stampUrl(value, base, assets, revision, overrides = new Map()) {
  try {
    const url = new URL(value, new URL(base, ORIGIN));
    if (url.origin !== ORIGIN || !assets.has(url.pathname) || !/\.(?:js|css)$/.test(url.pathname)) return value;
    url.searchParams.set('v', overrides.get(url.pathname) ?? revision);
    return `${value.split(/[?#]/)[0]}${url.search}${url.hash}`;
  } catch { return value; }
}

// Run once on a fresh export, after bundling and before CSP generation. One
// revision keeps shared modules at one URL even when reached by different roots.
export async function versionSiteAssets(destination) {
  const files = await listFiles(destination);
  const assets = new Map();
  const digest = createHash('sha256');
  for (const file of files.filter(file => /\.(?:css|js|json)$/.test(file))) {
    const bytes = await readFile(path.join(destination, file));
    assets.set(`/${file}`, bytes);
    digest.update(file).update('\0').update(bytes).update('\0');
  }
  const revision = digest.digest('hex').slice(0, 16);
  for (const [file, bytes] of assets) {
    if (!file.endsWith('.js') || PRESERVE_GENERATED.has(file)) continue;
    let changed = false;
    // esbuild parses actual import syntax; strings and comments that merely
    // resemble specifiers cannot be rewritten accidentally.
    const result = await build({
      stdin: { contents: bytes.toString('utf8'), sourcefile: file, resolveDir: destination },
      bundle: true, write: false, format: 'esm', target: ['es2022'], legalComments: 'eof',
      plugins: [{ name: 'version-local-imports', setup(api) {
        api.onResolve({ filter: /.*/ }, args => {
          const versioned = stampUrl(args.path, file, assets, revision);
          if (versioned !== args.path) changed = true;
          return { path: versioned, external: true };
        });
      } }],
    });
    if (changed) await writeFile(path.join(destination, file.slice(1)), result.outputFiles[0].contents);
  }
  // Retain the established account/config keys as hashes of their final bytes.
  const overrides = new Map();
  for (const file of CONTENT_HASH_ASSETS) if (assets.has(file)) {
    const bytes = await readFile(path.join(destination, file.slice(1)));
    overrides.set(file, createHash('sha256').update(bytes).digest('hex').slice(0, 16));
  }
  let htmlFiles = 0;
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const document = parse(await readFile(path.join(destination, file), 'utf8'));
    const walk = node => {
      if (node.tagName === 'html') {
        node.attrs = node.attrs.filter(attribute => attribute.name !== 'data-asset-revision');
        node.attrs.push({ name: 'data-asset-revision', value: revision });
      }
      const attrs = new Map((node.attrs ?? []).map(attribute => [attribute.name, attribute]));
      const resource = node.tagName === 'script' ? attrs.get('src')
        : node.tagName === 'link' && (attrs.get('rel')?.value ?? '').split(/\s+/).includes('stylesheet') ? attrs.get('href') : null;
      if (resource) resource.value = stampUrl(resource.value, `/${file}`, assets, revision, overrides);
      for (const child of node.childNodes ?? []) walk(child);
    };
    walk(document);
    await writeFile(path.join(destination, file), serialize(document));
    htmlFiles++;
  }
  return { revision, htmlFiles };
}
