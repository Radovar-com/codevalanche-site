import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
const ORIGIN = 'https://codevalanche.com';

// Inspect every exported document, including routes unreachable from the home
// page. External services are deliberately never requested by this check.
export async function checkInternalLinks(destination) {
  const root = path.resolve(destination);
  const references = [];
  let htmlFiles = 0;
  function add(value, source) {
    if (!value || value.startsWith('#')) return;
    const url = new URL(value, `${ORIGIN}/${source}`);
    if (url.origin !== ORIGIN) return;
    references.push({ source, target: url.pathname });
  }
  async function inspect(relative = '') {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) { await inspect(file); continue; }
      if (!/\.(html|css)$/.test(file)) continue;
      const content = await readFile(path.join(root, file), 'utf8');
      if (file.endsWith('.css')) {
        for (const match of content.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) add(match[1] ?? match[2], file);
        continue;
      }
      htmlFiles++;
      const visit = node => {
        for (const { name, value } of node.attrs ?? []) {
          if (['href', 'src', 'poster'].includes(name)) add(value, file);
          if (name === 'srcset') for (const candidate of value.split(',')) add(candidate.trim().split(/\s+/)[0], file);
        }
        for (const child of node.childNodes ?? []) visit(child);
        if (node.content) visit(node.content);
      };
      visit(parse(content));
    }
  }
  await inspect();
  const exists = new Map();
  const broken = [];
  for (const reference of references) {
    if (!exists.has(reference.target)) {
      const relative = decodeURIComponent(reference.target).replace(/^\/+/, '');
      const target = path.resolve(root, relative, reference.target.endsWith('/') ? 'index.html' : '');
      let valid = false;
      if (target.startsWith(root + path.sep)) try { valid = (await stat(target)).isFile(); } catch {}
      exists.set(reference.target, valid);
    }
    if (!exists.get(reference.target)) broken.push(reference);
  }
  return { htmlFiles, targets: exists.size, broken };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await checkInternalLinks(process.argv[2] ?? 'dist');
  for (const { source, target } of result.broken) console.error(`${source} → ${target}: 404`);
  console.log(`Checked ${result.htmlFiles} HTML files and ${result.targets} internal targets; ${result.broken.length} broken references`);
  if (result.broken.length) process.exitCode = 1;
}
