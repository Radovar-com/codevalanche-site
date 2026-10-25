import {downloadLinks,downloadId} from '../supabase/functions/_shared/downloadManifest.js';
import {DOWNLOAD_STARTED_PAGE,localizedMarketingPath} from './locales/manifest.js';

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

/** The visitor's system, as far as the browser tells: windows, macos, linux, android, ios or other. */
export function visitorPlatform(visitor = {}) {
  const ua = visitor?.userAgent ?? '';
  const platform = visitor?.userAgentData?.platform || visitor?.platform || '';
  if (/Windows Phone/i.test(ua)) return 'other';
  if (/Android/i.test(ua) || /Android/i.test(platform)) return 'android';
  // iPadOS asks for desktop pages as a Mac; only a touch screen tells them apart.
  if (/iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad|iPod|iOS/i.test(platform) || (/Mac/i.test(platform || ua) && visitor?.maxTouchPoints > 1)) return 'ios';
  if (/Macintosh|Mac OS X/i.test(ua) || /^Mac/i.test(platform) || /macOS/i.test(platform)) return 'macos';
  if (/Windows NT/i.test(ua) || /^Win/i.test(platform)) return 'windows';
  if (/Linux|X11|CrOS/i.test(ua) || /Linux|Chrome OS/i.test(platform)) return 'linux';
  return 'other';
}

/** The page that thanks the visitor and starts the download, in the page's language. */
export function startedPath(document, platform = 'windows-x64') {
  return `${localizedMarketingPath(DOWNLOAD_STARTED_PAGE.path, document?.documentElement?.lang || 'en')}?platform=${platform}`;
}

/** The download page in the page's language. */
export function downloadPagePath(document, hash = '') {
  return `${localizedMarketingPath('/download/', document?.documentElement?.lang || 'en')}${hash}`;
}

export function releaseState(manifest, visitor = {}) {
  if (!validManifest(manifest)) return {status:'unavailable', links:{}, primary:null};
  const links = downloadLinks(manifest);
  const windows = links.windows;
  return {status:windows ? 'available' : 'preparation', links, primary:windows && compatibleWindows(visitor, windows.architecture) ? windows : null};
}

function applyDownload(link, platform, asset, href = asset.href) {
  link.href = href;
  link.dataset.downloadPlatform = platform;
  link.dataset.downloadRelease = asset.releaseId;
  link.dataset.downloadArtifact = asset.artifactId;
  link.dataset.downloadArchitecture = asset.architecture;
}

function clearDownload(link) {
  for (const key of ['downloadPlatform', 'downloadRelease', 'downloadArtifact', 'downloadArchitecture']) delete link.dataset[key];
}

export const PLATFORM_ICONS = {
  windows: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 5.1 10.4 4v7.2H3V5.1Zm8.4-1.2L21 2.5v8.7h-9.6V3.9ZM3 12.4h7.4v7.2L3 18.5v-6.1Zm8.4 0H21v9.1l-9.6-1.4v-7.7Z"/></svg>',
  macos: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" focusable="false"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.6-1-2.6-4.1ZM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/><path d="M10.6 17.8h2.8"/></svg>',
};

function setLabel(link, text, icon) {
  link.textContent = '';
  if (icon) {
    const holder = link.ownerDocument.createElement('span');
    holder.className = 'button-icon';
    holder.innerHTML = PLATFORM_ICONS[icon];
    link.append(holder);
  }
  link.append(link.ownerDocument.createTextNode(text));
}

// Shared DOM rendering never waits for analytics, an account API or a release service.
export function renderReleaseActions(document, manifest, visitor = {}, translate = (text,variables={}) => text.replace(/\{(\w+)\}/g,(_,name)=>variables[name]??`{${name}}`)) {
  const state = releaseState(manifest, visitor);
  const platform = visitorPlatform(visitor);
  const status = state.status === 'available' ? 'Windows installer available.'
    : state.status === 'preparation' ? 'Public installer in preparation.' : 'Release information is unavailable.';
  for (const element of document.querySelectorAll('[data-release-status]')) element.textContent = translate(status);
  for (const heading of document.querySelectorAll('[data-release-heading]')) {
    heading.textContent = translate(state.status === 'available' ? 'Codevalanche for Windows.'
      : state.status === 'preparation' ? 'Codevalanche for Windows. Public installer in preparation.'
        : 'Codevalanche for Windows. Release information is unavailable.');
  }
  // Fallback href/text belong to the source document and its current locale.
  // With a published installer every primary button leads somewhere useful:
  // Windows PCs start the download, everyone else sees what is coming for them.
  if (state.status === 'available') for (const link of document.querySelectorAll('a[data-release-primary]')) {
    if (state.primary) {
      applyDownload(link, 'windows', state.primary, startedPath(document, `windows-${state.primary.architecture}`));
      setLabel(link, translate('Download for Windows'), 'windows');
      continue;
    }
    clearDownload(link);
    if (platform === 'macos') {
      link.href = downloadPagePath(document, '#platforms');
      setLabel(link, translate('Coming soon for Mac'), 'macos');
    } else if (platform === 'android' || platform === 'ios') {
      link.href = downloadPagePath(document, '#platforms');
      setLabel(link, translate('Coming soon for phones'), 'phone');
    } else {
      link.href = downloadPagePath(document, '#platforms');
      setLabel(link, translate('See download options'));
    }
  }
  // The download page's Windows card follows the same manifest as every other button.
  if (state.links.windows) for (const link of document.querySelectorAll('a[data-download-card]')) {
    applyDownload(link, 'windows', state.links.windows, startedPath(document, `windows-${state.links.windows.architecture}`));
  }
  for (const card of document.querySelectorAll('[data-dl-platform]')) {
    const cardPlatform = card.dataset.dlPlatform;
    const asset = state.links[cardPlatform];
    const previous = card.querySelector('.dl-card-state');
    if (!previous) continue;
    if (!asset) {
      if (cardPlatform === 'windows') previous.textContent = translate(status);
      continue;
    }
    const link = previous.tagName === 'A' ? previous : document.createElement('a');
    link.className = 'dl-card-state dl-card-live';
    applyDownload(link, cardPlatform, asset, cardPlatform === 'windows' ? startedPath(document, `windows-${asset.architecture}`) : asset.href);
    link.textContent = translate('Download');
    if (link !== previous) previous.replaceWith(link);
    if (cardPlatform === 'windows') {
      const metadata = card.querySelector('[data-release-details]') ?? document.createElement('p');
      metadata.dataset.releaseDetails = '';
      metadata.textContent = translate('Windows · {architecture} · {source}', {architecture:asset.architecture,source:new URL(asset.href).host});
      if (!metadata.parentNode) card.append(metadata);
    }
  }
  // Native rendering can finish after the optional analytics bootstrap snapshot.
  const download = document.querySelector('#download');
  if (download) download.dataset.downloadStatus = download.querySelector('[data-download-platform]') ? 'configured' : 'not_configured';
  return {...state, platform};
}
