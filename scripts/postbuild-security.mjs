import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';

const SELF_ORIGIN = 'https://codevalanche.com';
const ALLOWED_SCRIPT_ORIGINS = new Set(['https://challenges.cloudflare.com']);

function inlineScriptHashes(html) {
  const hashes = new Set();
  const document = parse(html);
  const visit = node => {
    for (const attribute of node.attrs ?? []) {
      if (/^on[a-z]+$/i.test(attribute.name)) {
        throw new Error(`Inline event handler is not allowed: ${node.tagName}[${attribute.name}]`);
      }
    }
    if (node.tagName === 'script') {
      const attributes = new Map((node.attrs ?? []).map(attribute => [attribute.name, attribute.value]));
      const type = (attributes.get('type') ?? '').trim().toLowerCase();
      if (!['application/ld+json', 'application/json', 'importmap'].includes(type)) {
        const source = attributes.get('src');
        if (source) {
          let url;
          try {
            url = new URL(source, SELF_ORIGIN);
          } catch {
            throw new Error(`Invalid script URL: ${source}`);
          }
          if (url.origin !== SELF_ORIGIN && !ALLOWED_SCRIPT_ORIGINS.has(url.origin)) {
            throw new Error(`Unreviewed external script origin: ${url.origin}`);
          }
          if (url.protocol !== 'https:' && url.origin !== SELF_ORIGIN) {
            throw new Error(`Unreviewed external script origin: ${url.origin}`);
          }
        } else {
          const code = (node.childNodes ?? []).map(child => child.value ?? '').join('');
          if (code.trim()) hashes.add(`'sha256-${createHash('sha256').update(code).digest('base64')}'`);
        }
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  return [...hashes].sort();
}

function configuredConnectOrigins(configText, extraOrigins) {
  const origins = new Set();
  const config = configText.match(/window\.CODEVALANCHE_CONFIG\s*=\s*\{([^\r\n]+)\}/)?.[1] ?? '';
  if (config) {
    for (const key of ['supabaseUrl', 'apiOrigin']) {
      const value = config.match(new RegExp(`(?:^|,)\\s*${key}\\s*:\\s*(["'])(.*?)\\1`))?.[2];
      if (!value) continue;
      const url = new URL(value);
      if (url.protocol !== 'https:') throw new Error(`CSP connection origin must use HTTPS: ${url.origin}`);
      origins.add(url.origin);
    }
  }
  const analytics = configText.match(/window\.CODEVALANCHE_ANALYTICS\s*=\s*\{([^\r\n]+)\}/)?.[1] ?? '';
  const analyticsBase = analytics.match(/(?:^|,)\s*baseUrl\s*:\s*(["'])(.*?)\1/)?.[2];
  if (analyticsBase) {
    const url = new URL(analyticsBase);
    if (url.protocol !== 'https:') throw new Error(`Analytics CSP connection origin must use HTTPS: ${url.origin}`);
    origins.add(url.origin);
  }
  for (const candidate of extraOrigins.split(',').map(value => value.trim()).filter(Boolean)) {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`Invalid extra CSP connection origin: ${candidate}`);
    }
    origins.add(url.origin);
  }
  return [...origins].sort();
}

// Account pages (sign-in, consent, the account itself) are the only pages that
// load Cloudflare Turnstile, and they allow no inline style except the <style>
// elements the site's own scripts insert (the analytics consent panel), each
// allowed by the hash of its fixed text. Marketing pages get neither the
// challenge origin nor any frame.
export function isAccountPage(relative) {
  return relative === 'account.html' || relative.startsWith('account/');
}

// Hashes of the fixed text of every <style> element a built script creates
// (document.createElement('style') ... .textContent = `...`). A created style
// whose text is not a fixed template cannot be hashed and stops the build.
async function injectedStyleHashes(destination) {
  const hashes = new Set();
  for (const file of await listFilesWithExtension(destination, '.js')) {
    const code = await readFile(file, 'utf8');
    const created = [...code.matchAll(/createElement\(\s*(["'])style\1\s*\)/g)].length;
    if (!created) continue;
    const texts = [...code.matchAll(/createElement\(\s*(["'])style\1\s*\)\s*;?\s*\w+\.textContent\s*=\s*`([^`]*)`/g)];
    if (texts.length !== created || texts.some(match => match[2].includes('${') || match[2].includes('\\'))) {
      throw new Error(`Inserted <style> text is not a fixed template in ${path.relative(destination, file)}`);
    }
    for (const match of texts) hashes.add(`'sha256-${createHash('sha256').update(match[2].replace(/\r\n?/g, '\n')).digest('base64')}'`);
  }
  return [...hashes].sort();
}

function policyFor(html, configText, extraOrigins, { account = true, styleHashes = [] } = {}) {
  const hashes = inlineScriptHashes(html);
  const challenge = account ? [...ALLOWED_SCRIPT_ORIGINS] : [];
  const scriptSources = ["'self'", ...hashes, ...challenge].join(' ');
  const connectSources = ["'self'", ...configuredConnectOrigins(configText, extraOrigins), ...challenge].join(' ');
  return [
    "default-src 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    account ? ["style-src 'self'", ...styleHashes].join(' ') : "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    account ? `frame-src ${challenge.join(' ')}` : "frame-src 'none'",
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');
}

function htmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function addPolicy(html, policy) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${htmlEscape(policy)}">`;
  const existing = /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["'])content-security-policy\1)[^>]*>/i;
  if (existing.test(html)) return html.replace(existing, tag);
  const head = /<head\b[^>]*>/i;
  if (!head.test(html)) throw new Error('Cannot add CSP: HTML document has no head element');
  // Right after <meta charset> when the head declares one (the charset has to stay
  // within the first bytes of the page); otherwise first in <head>. Either way the
  // policy comes before any script.
  const charset = /<meta\s+charset\s*=\s*["']?utf-8["']?\s*\/?>/i;
  const charsetAt = html.search(charset), headEnd = html.search(/<\/head>/i);
  if (charsetAt >= 0 && (headEnd < 0 || charsetAt < headEnd)) return html.replace(charset, match => `${match}${tag}`);
  return html.replace(head, match => `${match}\n    ${tag}`);
}

async function listHtmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(fullPath);
  }
  return files;
}

async function listFilesWithExtension(directory, extension) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesWithExtension(fullPath, extension));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) files.push(fullPath);
  }
  return files;
}

async function validateDynamicScriptOrigins(destination) {
  for (const file of await listFilesWithExtension(destination, '.js')) {
    const code = await readFile(file, 'utf8');
    for (const match of code.matchAll(/\bscript\.src\s*=\s*(["'])(.*?)\1/g)) {
      let url;
      try { url = new URL(match[2], SELF_ORIGIN); } catch { throw new Error(`Invalid dynamic script URL in ${file}`); }
      if (url.origin !== SELF_ORIGIN && !ALLOWED_SCRIPT_ORIGINS.has(url.origin)) {
        throw new Error(`Unreviewed dynamic script origin: ${url.origin}`);
      }
    }
  }
}

export async function applyPostbuildSecurity(destination, { connectOrigins = process.env.CSP_CONNECT_ORIGINS ?? '' } = {}) {
  const files = await listHtmlFiles(destination);
  if (!files.length) throw new Error(`No exported HTML files found in ${destination}`);
  await validateDynamicScriptOrigins(destination);
  const styleHashes = await injectedStyleHashes(destination);
  const configPath = path.join(destination, 'config.js');
  const configText = await readFile(configPath, 'utf8').catch(() => '');
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const relative = path.relative(destination, file).split(path.sep).join('/');
    const secured = addPolicy(html, policyFor(html, configText, connectOrigins, { account: isAccountPage(relative), styleHashes }));
    await writeFile(file, secured);
  }
  return { htmlFiles: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const destination = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const result = await applyPostbuildSecurity(destination);
  console.log(`Applied CSP to ${result.htmlFiles} HTML files`);
}
