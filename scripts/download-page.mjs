import { downloadLinks, qualifiedAssets } from '../supabase/functions/_shared/downloadManifest.js';
import { anchor, formatDate } from './changelog.mjs';

// The download page shows the Windows installer only when the reviewed manifest
// names a qualified one with its version, file name, size and SHA-256. The buttons
// open the thank-you page, which starts the download; its "Download again" link
// goes to a codevalanche.com address that forwards to the installer file.
const SITE = 'https://codevalanche.com';
const VARIANT = name => new RegExp(`<!-- download:${name} -->[\\s\\S]*?<!-- /download:${name} -->`, 'g');
const MARKER = /<!-- \/?download:(?:preparation|release) -->/g;
export const STARTED_HREF = '/download/started/?platform=windows-x64';
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function windowsDownload(manifest) {
  const link = downloadLinks(manifest).windows;
  if (!link) return null;
  const gateway = new URL(manifest.gatewayBaseUrl);
  if (gateway.origin !== SITE) throw new Error(`The download gateway must be on ${SITE} so no other address appears on the site`);
  const asset = qualifiedAssets(manifest).find(item => item.siteId === 'codevalanche' && item.platform === 'windows'
    && item.releaseId === link.releaseId && item.artifactId === link.artifactId);
  const display = asset?.display;
  if (!/^\d+\.\d+\.\d+$/.test(display?.version ?? '')) throw new Error('The Windows download needs display.version');
  if (display.fileName !== decodeURIComponent(new URL(asset.targetUrl).pathname.split('/').pop())) throw new Error('display.fileName must be the installer file the download goes to');
  if (!Number.isInteger(display.sizeBytes) || display.sizeBytes <= 0) throw new Error('The Windows download needs display.sizeBytes');
  if (!/^[0-9a-f]{64}$/.test(display.sha256 ?? '')) throw new Error('The Windows download needs a lowercase display.sha256');
  return {
    ...link,
    path: `${new URL(link.href).pathname}/`,
    targetUrl: asset.targetUrl,
    version: display.version,
    fileName: display.fileName,
    size: `${Math.round(display.sizeBytes / (1024 * 1024))} MB`,
    sha256: display.sha256,
  };
}

/** Keeps the "in preparation" or the "download" version of a page. */
export function selectDownloadVariant(html, download) {
  const result = html.replace(VARIANT(download ? 'preparation' : 'release'), '').replace(MARKER, '');
  // Without an installer the thank-you page only says what is available instead.
  return download ? result : result.replace('data-started-missing hidden', 'data-started-missing');
}

const formatCount = (count, tag) => new Intl.NumberFormat(tag).format(count);
const COUNT_TEXT = 'Downloaded {count} times.';

/** Published versions, newest first, each linking to its notes on the changelog. */
export function releaseHistory(releases) {
  if (!releases.length) return '';
  const items = releases.map((release, index) => `<li><a class="dl-history-link" href="/changelog.html#${anchor(release.version)}"><span class="dl-history-version">${escape(release.version)}</span>${index === 0 ? '<span class="dl-badge">Latest</span>' : ''}<span class="dl-history-title">${escape(release.copy.en.headline)}</span><time datetime="${release.date}">${escape(formatDate(release.date, 'en', true))}</time></a></li>`);
  return `<ol class="dl-history">${items.join('')}</ol>`;
}

/** The public download count, shown only once it is at least the minimum. */
export function countLine(count, minimum) {
  return Number.isInteger(count) && Number.isInteger(minimum) && count >= minimum
    ? `<p class="dl-count">${COUNT_TEXT.replace('{count}', formatCount(count, 'en'))}</p>` : '';
}

export function fillDownload(html, download, { releases = [], count = null, minimum = null } = {}) {
  if (!download) return html;
  const attributes = `data-download-platform="windows" data-download-release="${escape(download.releaseId)}" data-download-artifact="${escape(download.artifactId)}" data-download-architecture="${escape(download.architecture)}"`;
  const values = {
    version: download.version,
    size: download.size,
    sha256: download.sha256,
    'hash-command': `Get-FileHash .\\${download.fileName}`,
  };
  let result = html
    .replace(/href="#download" data-fill-download-card/g, `href="${STARTED_HREF}" ${attributes} data-download-card`)
    .replace(/href="#download" data-fill-download/g, `href="${STARTED_HREF}" ${attributes} data-release-primary`)
    .replace(/href="#download" data-download-retry/g, `href="${escape(download.path)}" data-download-retry`)
    .replace('<!-- download:history -->', () => releaseHistory(releases))
    .replace('<!-- download:count -->', () => countLine(count, minimum));
  for (const [name, value] of Object.entries(values)) result = result.replaceAll(`data-fill="${name}"></`, `data-fill="${name}">${escape(value)}</`);
  if (/data-fill-download|href="#download" data-download-retry|<!-- download:(?:history|count) -->|data-fill="[^"]+"><\//.test(result)) throw new Error('The download page has an unfilled value');
  return result;
}

/** Text the download pages show that is the same, or only formatted, in every language. */
export function downloadTranslations(download, { count = null, minimum = null, tag = 'en', catalog = {} } = {}) {
  if (!download) return {};
  const entries = { [download.version]: download.version, [download.size]: download.size };
  if (countLine(count, minimum)) entries[COUNT_TEXT.replace('{count}', formatCount(count, 'en'))] = (catalog[COUNT_TEXT] ?? COUNT_TEXT).replace('{count}', formatCount(count, tag));
  return entries;
}

/**
 * The real number of times the published Windows installers were downloaded,
 * read from the release host named in the manifest. Null when it cannot be read;
 * the page then simply leaves the line out.
 */
export async function publicDownloadCount(manifest, { fetch = globalThis.fetch, token = '' } = {}) {
  const host = qualifiedAssets(manifest).find(asset => asset.siteId === 'codevalanche' && asset.platform === 'windows');
  const match = host && /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases\/download\//.exec(host.targetUrl);
  if (!match) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/releases?per_page=100`, {
      headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const releases = await response.json();
    if (!Array.isArray(releases)) return null;
    return releases.filter(release => !release.draft && !release.prerelease)
      .flatMap(release => release.assets ?? [])
      .filter(asset => /^Codevalanche-Desktop-Setup-.+-stable-.+\.exe$/.test(asset.name ?? '') && Number.isInteger(asset.download_count))
      .reduce((total, asset) => total + asset.download_count, 0);
  } catch {
    return null;
  }
}

/** The small page at the download address: it forwards to the installer. */
export function redirectPage(download) {
  const target = escape(download.targetUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<title>Downloading Codevalanche</title>
</head>
<body>
<p>Your download of Codevalanche ${escape(download.version)} is starting.</p>
<p><a href="/download/">Back to the download page</a></p>
</body>
</html>
`;
}
