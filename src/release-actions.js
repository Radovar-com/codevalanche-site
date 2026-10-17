import {downloadLinks,downloadId} from '../supabase/functions/_shared/downloadManifest.js';

function validManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.assets) || !Array.isArray(manifest.allowedOrigins)) return false;
  try {
    if (!manifest.allowedOrigins.every(origin => new URL(origin).origin === origin && new URL(origin).protocol === 'https:')) return false;
    if (!manifest.assets.every(asset => asset && ['codevalanche','radovar'].includes(asset.siteId)
      && ['windows','mac-arm','mac-intel','linux'].includes(asset.platform)
      && ['x64','arm64','x86','universal','unknown'].includes(asset.architecture)
      && downloadId(asset.releaseId) && downloadId(asset.artifactId)
      && typeof asset.qualified === 'boolean' && typeof asset.targetUrl === 'string')) return false;
    // Configuration validity is separate from approved-origin/asset eligibility.
    for (const asset of manifest.assets) {
      const target = new URL(asset.targetUrl);
      if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) return false;
    }
    if (manifest.assets.length === 0 && manifest.gatewayBaseUrl === '') return true;
    const gateway = new URL(manifest.gatewayBaseUrl);
    return gateway.protocol === 'https:' && !gateway.username && !gateway.password && !gateway.search && !gateway.hash
      && gateway.pathname.endsWith('/download-redirect/v1');
  } catch { return false; }
}

function compatibleWindows(visitor, architecture) {
  const ua = visitor?.userAgent ?? '';
  const platform = visitor?.userAgentData?.platform || visitor?.platform || '';
  if (visitor?.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua)) return false;
  if (/Mac|Linux|Android|iOS/i.test(platform) || /Macintosh|Mac OS X|Linux/i.test(ua)) return false;
  if (!/^Win/i.test(platform) && !/Windows NT/i.test(ua)) return false;
  const arm = /ARM64|aarch64/i.test(ua);
  const x64 = /Win64|x64|WOW64|x86_64/i.test(ua);
  // A platform alone cannot prove an architecture. Do not guess ARM/x64 compatibility.
  return architecture === 'universal' || (architecture === 'arm64' && arm)
    || (architecture === 'x64' && x64 && !arm) || (architecture === 'x86' && !arm);
}

export function releaseState(manifest, visitor = {}) {
  if (!validManifest(manifest)) return {status:'unavailable', links:{}, primary:null};
  const links = downloadLinks(manifest);
  const windows = links.windows;
  return {status:windows ? 'available' : 'preparation', links, primary:windows && compatibleWindows(visitor, windows.architecture) ? windows : null};
}

function applyDownload(link, platform, asset) {
  link.href = asset.href;
  link.dataset.downloadPlatform = platform;
  link.dataset.downloadRelease = asset.releaseId;
  link.dataset.downloadArtifact = asset.artifactId;
  link.dataset.downloadArchitecture = asset.architecture;
}

// Shared DOM rendering never waits for analytics, an account API or a release service.
export function renderReleaseActions(document, manifest, visitor = {}, translate = (text,variables={}) => text.replace(/\{(\w+)\}/g,(_,name)=>variables[name]??`{${name}}`)) {
  const state = releaseState(manifest, visitor);
  const status = state.status === 'available' ? 'Windows installer available.'
    : state.status === 'preparation' ? 'Public installer in preparation.' : 'Release information is unavailable.';
  for (const element of document.querySelectorAll('[data-release-status]')) element.textContent = translate(status);
  for (const heading of document.querySelectorAll('[data-release-heading]')) {
    heading.textContent = translate(state.status === 'available' ? 'Codevalanche for Windows.'
      : state.status === 'preparation' ? 'Codevalanche for Windows. Public installer in preparation.'
        : 'Codevalanche for Windows. Release information is unavailable.');
  }
  // Fallback href/text belong to the source document and its current locale.
  if (state.primary) for (const link of document.querySelectorAll('a[data-release-primary]')) {
    applyDownload(link, 'windows', state.primary);
    link.textContent = translate('Download for Windows');
  }
  for (const card of document.querySelectorAll('[data-dl-platform]')) {
    const platform = card.dataset.dlPlatform;
    const asset = state.links[platform];
    const previous = card.querySelector('.dl-card-state');
    if (!previous) continue;
    if (!asset) {
      if (platform === 'windows') previous.textContent = translate(status);
      continue;
    }
    const link = previous.tagName === 'A' ? previous : document.createElement('a');
    link.className = 'dl-card-state dl-card-live';
    applyDownload(link, platform, asset);
    link.textContent = translate('Download');
    if (link !== previous) previous.replaceWith(link);
    if (platform === 'windows') {
      const metadata = card.querySelector('[data-release-details]') ?? document.createElement('p');
      metadata.dataset.releaseDetails = '';
      metadata.textContent = translate('Windows · {architecture} · {source}', {architecture:asset.architecture,source:new URL(asset.href).host});
      if (!metadata.parentNode) card.append(metadata);
    }
  }
  return state;
}
