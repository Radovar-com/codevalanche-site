import { downloadLinks, qualifiedAssets } from '../supabase/functions/_shared/downloadManifest.js';

// The download page shows the Windows installer only when the reviewed manifest
// names a qualified one with its version, file name, size and SHA-256. The button
// goes to a codevalanche.com address that forwards to the installer file.
const SITE = 'https://codevalanche.com';
const VARIANT = name => new RegExp(`<!-- download:${name} -->[\\s\\S]*?<!-- /download:${name} -->`, 'g');
const MARKER = /<!-- \/?download:(?:preparation|release) -->/g;
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
  return html.replace(VARIANT(download ? 'preparation' : 'release'), '').replace(MARKER, '');
}

export function fillDownload(html, download) {
  if (!download) return html;
  const attributes = `href="${escape(download.path)}" data-download-platform="windows" data-download-release="${escape(download.releaseId)}" data-download-artifact="${escape(download.artifactId)}" data-download-architecture="${escape(download.architecture)}" data-release-primary`;
  const values = {
    version: download.version,
    size: download.size,
    sha256: download.sha256,
    'hash-command': `Get-FileHash .\\${download.fileName}`,
  };
  let result = html.replace(/href="#download" data-fill-download/g, attributes);
  for (const [name, value] of Object.entries(values)) result = result.replaceAll(`data-fill="${name}"></`, `data-fill="${name}">${escape(value)}</`);
  if (/data-fill-download|data-fill="[^"]+"><\//.test(result)) throw new Error('The download page has an unfilled value');
  return result;
}

/** Text the download page shows that stays the same in every language. */
export function downloadTranslations(download) {
  return download ? { [download.version]: download.version, [download.size]: download.size } : {};
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
