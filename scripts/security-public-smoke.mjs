import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// No CLI/environment URL input, discovery, browser execution or asset fetching.
export const PUBLIC_TARGETS = Object.freeze([
  'https://codevalanche.com/',
  'https://codevalanche.com/account/',
  'https://codevalanche.com/security/',
  'https://radovar.com/',
  'https://radovar.com/security/',
]);
const ALLOWLIST = new Set(PUBLIC_TARGETS);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TRACKER = /(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com|connect\.facebook\.net|static\.hotjar\.com|script\.hotjar\.com|clarity\.ms|plausible\.io|cdn\.segment\.com|static\.cloudflareinsights\.com|\bgtag\s*\(|\bfbq\s*\()/i;
const NON_EXECUTABLE = new Set(['application/json', 'application/ld+json', 'importmap']);
const trimAscii = value => value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
const trimOws = value => value.replace(/^[\t ]+|[\t ]+$/g, '');

function approvedUrl(input, base) {
  try {
    const url = new URL(input, base);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && ALLOWLIST.has(url.href) ? url.href : null;
  } catch { return null; }
}

function directives(policy) {
  const result = new Map();
  let duplicate = false;
  for (const part of policy.split(';')) {
    const [name, ...values] = trimAscii(part).split(/[\t\n\f\r ]+/);
    if (!name) continue;
    if (!/^[a-z0-9-]+$/i.test(name)) continue;
    const lower = name.toLowerCase();
    if (result.has(lower)) duplicate = true;
    else result.set(lower, values);
  }
  return { values: result, duplicate };
}
const only = (values, expected) => values?.length === 1 && expected.includes(values[0]);

function headerIssues(headers) {
  const issues = [];
  if (trimOws(headers.get('x-frame-options') ?? '').toUpperCase() !== 'DENY') issues.push('x_frame_options_not_deny');
  if (trimOws(headers.get('x-content-type-options') ?? '').toLowerCase() !== 'nosniff') issues.push('nosniff_missing');
  const hsts = headers.get('strict-transport-security') ?? '';
  const hstsParts = hsts.split(';').map(trimOws).filter(Boolean);
  const hstsNames = hstsParts.map(value => trimOws(value.split('=')[0]).toLowerCase());
  const maxAge = hstsParts.filter((_value, index) => hstsNames[index] === 'max-age');
  const ageMatch = maxAge[0]?.match(/^max-age[\t ]*=[\t ]*(?:"(\d+)"|(\d+))$/i);
  const age = ageMatch ? Number(ageMatch[1] ?? ageMatch[2]) : NaN;
  const invalidSubdomains = hstsParts.some((value, index) => hstsNames[index] === 'includesubdomains' && !/^includesubdomains$/i.test(value));
  if (/[^\x20-\x7e\t]/.test(hsts) || invalidSubdomains || maxAge.length !== 1 || new Set(hstsNames).size !== hstsNames.length || !Number.isSafeInteger(age) || age < 31_536_000) issues.push('hsts_missing_or_short');
  const policies = (headers.get('content-security-policy') ?? '').split(',').map(directives);
  const strict = policies.some(policy => !policy.duplicate
    && only(policy.values.get('frame-ancestors'), ["'none'"])
    && only(policy.values.get('object-src'), ["'none'"])
    && only(policy.values.get('base-uri'), ["'self'", "'none'"]));
  if (!strict) issues.push('header_csp_missing_or_weak');
  return issues;
}

async function boundedText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('response_body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function requestPage(initial, method, fetchImpl) {
  let current = initial;
  const report = { status: null, redirects: 0, headerIssues: [], issues: [], isHtml: null };
  try {
    for (let count = 0; count <= MAX_REDIRECTS; count++) {
      const response = await fetchImpl(current, {
        method, redirect: 'manual', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20_000),
        headers: { accept: 'text/html', 'user-agent': 'Codevalanche-public-security-smoke/1.0' },
      });
      report.status = response.status;
      if (REDIRECTS.has(response.status)) {
        if (response.body) await response.body.cancel();
        if (count === MAX_REDIRECTS) { report.issues.push('redirect_limit'); return report; }
        const next = approvedUrl(response.headers.get('location') ?? '', current);
        if (!response.headers.get('location') || !next) { report.issues.push('redirect_outside_allowlist'); return report; }
        current = next;
        report.redirects++;
        continue;
      }
      if (response.status !== 200) {
        if (response.body) await response.body.cancel();
        report.issues.push('unexpected_http_status');
        return report;
      }
      if (current !== initial) report.issues.push('canonical_target_changed');
      report.headerIssues = headerIssues(response.headers);
      report.isHtml = /^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '');
      if (method === 'GET' && report.isHtml) report.html = await boundedText(response);
      else if (response.body) await response.body.cancel();
      return report;
    }
  } catch (error) { report.issues.push(error.message === 'response_body_too_large' ? error.message : 'request_failed'); }
  return report;
}

function htmlInventory(html, target) {
  const document = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: true });
  const fallbackDocument = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false });
  const issues = new Set();
  const metas = [];
  const scripts = [];
  const counts = { totalScripts: 0, inlineExecutableScripts: 0, sameOriginScripts: 0, approvedExternalScripts: 0 };
  const pageOrigin = new URL(target).origin;
  const approvedExternal = target === 'https://codevalanche.com/account/' ? new Set(['https://challenges.cloudflare.com']) : new Set();
  const visit = (node, inHead = false, inertPolicy = false, active = true) => {
    const head = inHead || node.tagName === 'head';
    const inert = inertPolicy || ['template', 'noscript'].includes(node.tagName);
    const attributes = new Map((node.attrs ?? []).map(attribute => [attribute.name, attribute.value]));
    if ((node.attrs ?? []).some(attribute => /^on[a-z]+$/i.test(attribute.name))) issues.add('inline_event_handler');
    if (node.tagName === 'meta') {
      const equiv = attributes.get('http-equiv')?.toLowerCase();
      if (equiv === 'content-security-policy' && !inert && active) {
        metas.push({ policy: attributes.get('content') ?? '', offset: node.sourceCodeLocation?.startOffset ?? Infinity });
        if (!head || node.parentNode?.tagName !== 'head') issues.add('csp_meta_not_in_head');
      }
      if (equiv === 'refresh') issues.add('meta_refresh_not_allowed');
    }
    if (node.tagName === 'base' && attributes.has('href')) {
      try { if (new URL(attributes.get('href'), target).origin !== pageOrigin) issues.add('external_base_origin'); }
      catch { issues.add('external_base_origin'); }
    }
    if (['img', 'iframe', 'embed', 'object', 'source', 'link'].includes(node.tagName)) {
      if (TRACKER.test(`${attributes.get('src') ?? ''} ${attributes.get('href') ?? ''} ${attributes.get('data') ?? ''} ${attributes.get('srcset') ?? ''}`)) issues.add('tracker_injection_detected');
    }
    if (node.tagName === 'script') {
      if (active) counts.totalScripts++;
      const type = (attributes.get('type') ?? '').trim().toLowerCase();
      if (!NON_EXECUTABLE.has(type)) {
        const code = (node.childNodes ?? []).map(child => child.value ?? '').join('');
        const src = attributes.get('src') ?? attributes.get('href');
        if (active) scripts.push({ code, src, offset: node.sourceCodeLocation?.startOffset ?? Infinity });
        if (TRACKER.test(`${src ?? ''}\n${code}`)) issues.add('tracker_injection_detected');
        if (src) {
          let url;
          try { url = new URL(src, target); } catch {}
          if (!url || url.protocol !== 'https:' || url.username || url.password || (url.origin !== pageOrigin && !approvedExternal.has(url.origin))) issues.add('external_script_origin_not_approved');
          else if (active && url.origin === pageOrigin) counts.sameOriginScripts++;
          else if (active) counts.approvedExternalScripts++;
        } else if (active && code.trim()) counts.inlineExecutableScripts++;
      }
    }
    for (const child of node.childNodes ?? []) visit(child, head, inert, active);
    if (node.content) visit(node.content, head, inert, active);
  };
  visit(document);
  // Fallback parsing inventories noscript pixels too, but may never replace the
  // scripting-enabled tree used for active scripts and effective CSP metadata.
  visit(fallbackDocument, false, false, false);
  if (metas.length !== 1) issues.add('csp_meta_count');
  else {
    const meta = metas[0];
    if (scripts.some(script => script.offset < meta.offset)) issues.add('csp_meta_after_script');
    const policy = directives(meta.policy);
    if (policy.duplicate) issues.add('csp_meta_duplicate_directive');
    if (!only(policy.values.get('object-src'), ["'none'"]) || !only(policy.values.get('base-uri'), ["'self'", "'none'"])) issues.add('csp_meta_object_or_base_weak');
    const allowedSource = value => value === "'self'" || /^'sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}'$/.test(value) || approvedExternal.has(value);
    const sourceLists = [policy.values.get('script-src'), ...(policy.values.has('script-src-elem') ? [policy.values.get('script-src-elem')] : [])];
    if (sourceLists.some(sources => !sources?.length || !(only(sources, ["'none'"]) || sources.every(allowedSource)))) issues.add('csp_script_sources_not_strict');
    const effective = policy.values.get('script-src-elem') ?? policy.values.get('script-src') ?? [];
    for (const script of scripts.filter(script => !script.src && script.code.trim())) {
      const valid = ['sha256', 'sha384', 'sha512'].some(algorithm => effective.includes(`'${algorithm}-${createHash(algorithm).update(script.code).digest('base64')}'`));
      if (!valid) issues.add('inline_script_hash_missing');
    }
  }
  return { issues: [...issues], inventory: counts };
}

export async function probePublicTarget(target, { requireHeaders = false, fetchImpl = fetch } = {}) {
  if (!approvedUrl(target)) throw new Error('target_not_allowlisted');
  const [get, head] = await Promise.all([requestPage(target, 'GET', fetchImpl), requestPage(target, 'HEAD', fetchImpl)]);
  const issues = [...get.issues.map(issue => `get:${issue}`), ...head.issues.map(issue => `head:${issue}`)];
  if (requireHeaders) issues.push(...get.headerIssues.map(issue => `get:${issue}`), ...head.headerIssues.map(issue => `head:${issue}`));
  let inventory = null;
  if (get.status === 200 && !get.issues.length) {
    if (!get.isHtml) issues.push('html:content_type_not_html');
    else {
      const html = htmlInventory(get.html ?? '', target);
      inventory = html.inventory;
      issues.push(...html.issues.map(issue => `html:${issue}`));
    }
  }
  delete get.html;
  return { target, passed: issues.length === 0, issues, get, head, inventory };
}

export async function runPublicSmoke(options = {}) {
  const targets = await Promise.all(PUBLIC_TARGETS.map(target => probePublicTarget(target, options)));
  return {
    version: 1, observedAt: new Date().toISOString(),
    mode: options.requireHeaders ? 'require_live_headers' : 'diagnostic_source_inventory',
    passed: targets.every(target => target.passed), targets,
    browserExecutionPerformed: false, authenticatedRequestsPerformed: false, eventPostsPerformed: false,
    externalNotificationDeliveryVerified: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--require-headers') || args.length > 1) { process.stderr.write('public_smoke_arguments_invalid\n'); process.exitCode = 1; }
  else runPublicSmoke({ requireHeaders: args.includes('--require-headers') }).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.passed ? 0 : 1;
  }).catch(() => { process.stderr.write('public_smoke_unavailable\n'); process.exitCode = 1; });
}
