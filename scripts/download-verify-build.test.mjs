import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { LOCALES } from '../src/locales/manifest.js';
import { loadReleases } from './changelog.mjs';

const root = new URL('../', import.meta.url);
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
const nodes = (node, predicate, found = []) => {
  if (predicate(node)) found.push(node);
  for (const child of node.childNodes ?? []) nodes(child, predicate, found);
  return found;
};
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

test('built verification pages expose every release hash unchanged in all 17 languages with localized discovery', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const releases = await loadReleases(fileURLToPath(new URL('content/releases/', root)));
  for (const locale of LOCALES) {
    const prefix = locale.slug ? `${locale.slug}/` : '';
    const html = await readFile(new URL(`dist/${prefix}download/verify/index.html`, root), 'utf8');
    const document = parse(html);
    const cards = nodes(document, node => attr(node, 'data-verify-version') !== undefined);
    assert.deepEqual(cards.map(card => attr(card, 'data-verify-version')), releases.map(release => release.version));
    for (const [index, release] of releases.entries()) {
      const codes = nodes(cards[index], node => node.tagName === 'code').map(text);
      assert.ok(codes.includes(release.installer.sha256), `${locale.tag}/${release.version}: displayed hash equals release data`);
      assert.ok(codes.includes(release.installer.fileName), `${locale.tag}/${release.version}: exact filename`);
      const command = codes.find(code => code.startsWith('Get-FileHash '));
      assert.ok(command.includes('-Algorithm SHA256 -LiteralPath'), 'the algorithm is explicit');
      assert.ok(command.includes(release.installer.fileName), 'the command hashes the named installer');
    }
    assert.equal(attr(nodes(document, node => node.tagName === 'html')[0], 'dir'), locale.dir);
    const canonical = nodes(document, node => node.tagName === 'link' && attr(node, 'rel') === 'canonical');
    assert.equal(attr(canonical[0], 'href'), `https://codevalanche.com/${prefix}download/verify/`);
    const alternates = nodes(document, node => node.tagName === 'link' && attr(node, 'hreflang') !== undefined);
    assert.equal(alternates.length, 18);
    const download = await readFile(new URL(`dist/${prefix}download/index.html`, root), 'utf8');
    assert.ok(download.includes(`href="/${prefix}download/verify/"`), 'the download page points to its own language');
    const sitemap = await readFile(new URL('dist/sitemap.xml', root), 'utf8');
    assert.ok(sitemap.includes(`<loc>https://codevalanche.com/${prefix}download/verify/</loc>`));
    const csp = nodes(document, node => node.tagName === 'meta' && attr(node, 'http-equiv')?.toLowerCase() === 'content-security-policy');
    const security = attr(csp[0], 'content');
    assert.ok(security.includes("script-src 'self'"));
    const scripts = security.split(';').find(directive => directive.trim().startsWith('script-src '));
    assert.ok(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"));
    const downloadCsp = nodes(parse(download), node => node.tagName === 'meta' && attr(node, 'http-equiv')?.toLowerCase() === 'content-security-policy');
    // Script hashes are computed per page: the download page also hashes its own
    // inline download script. Every other directive is inherited unchanged and
    // verification allows no script the download page does not.
    const directives = policy => Object.fromEntries(policy.split(';').map(part => part.trim()).filter(Boolean).map(part => [part.split(/\s+/)[0], part.split(/\s+/).slice(1)]));
    const own = directives(security);
    const inherited = directives(attr(downloadCsp[0], 'content'));
    assert.deepEqual(Object.keys(own), Object.keys(inherited), 'verification keeps every download CSP directive');
    for (const [name, sources] of Object.entries(own)) {
      if (name === 'script-src') assert.ok(sources.every(source => inherited[name].includes(source)), 'verification allows no extra script');
      else assert.deepEqual(sources, inherited[name], `verification inherits ${name} unchanged`);
    }
  }
});
