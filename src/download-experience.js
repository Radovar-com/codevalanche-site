import {downloadLinks,qualifiedAssets} from '../supabase/functions/_shared/downloadManifest.js';
import {downloadPagePath,releaseState,visitorPlatform} from './release-actions.js';

const METRICS = new Set(['download_page_view', 'download_started', 'download_retry']);
const PLATFORMS = new Set(['windows', 'windows-x64', 'macos', 'linux', 'android', 'ios', 'other']);

/**
 * Adds one to a daily count for the download pages. Nothing identifies the
 * visitor: no cookie, no stored identifier, no address kept by the site. A
 * visitor who asks not to be tracked (Global Privacy Control or Do Not Track)
 * is not counted.
 */
export function countDownload(metric, platform, {window: host = globalThis.window} = {}) {
  try {
    if (!METRICS.has(metric) || !PLATFORMS.has(platform)) return false;
    if (host.navigator?.globalPrivacyControl === true || host.navigator?.doNotTrack === '1') return false;
    const config = host.CODEVALANCHE_CONFIG ?? {};
    if (!/^https:\/\//.test(config.supabaseUrl ?? '') || !config.supabasePublishableKey) return false;
    const locale = host.document?.documentElement?.lang || 'en';
    host.fetch(`${config.supabaseUrl}/rest/v1/rpc/codevalanche_count_download`, {
      method: 'POST',
      headers: {apikey: config.supabasePublishableKey, 'content-type': 'application/json'},
      body: JSON.stringify({p_metric: metric, p_platform: platform, p_locale: locale}),
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

const DETECTED = {
  windows: 'We detected Windows. The recommended download is highlighted below.',
  macos: 'We detected a Mac. The Mac app is coming soon; the Windows app is ready today.',
  android: 'You are on a phone. Codevalanche runs on a Windows PC, and the phone app is coming soon.',
  ios: 'You are on a phone. Codevalanche runs on a Windows PC, and the phone app is coming soon.',
  linux: 'Codevalanche is available for Windows 11 today.',
  other: 'Codevalanche is available for Windows 11 today.',
};
const CARD = {windows: 'windows', macos: 'macos', android: 'mobile', ios: 'mobile'};

/** The download page: says what it detected and highlights the matching card. */
export function renderDownloadLanding(document, manifest, visitor, translate, {count = true, window: host = globalThis.window} = {}) {
  const landing = document.querySelector('[data-download-landing]');
  if (!landing) return null;
  const state = releaseState(manifest, visitor);
  if (state.status !== 'available') return null;
  const platform = visitorPlatform(visitor);
  const detected = document.querySelector('[data-detected]');
  if (detected) {
    detected.textContent = translate(DETECTED[platform]);
    detected.hidden = false;
  }
  for (const card of document.querySelectorAll('[data-platform-card]')) {
    const yours = card.dataset.platformCard === CARD[platform];
    card.classList.toggle('is-yours', yours);
    const badge = card.querySelector('[data-for-you]');
    if (badge) badge.hidden = !yours;
  }
  const copy = document.querySelector('[data-copy-link]');
  if (copy && !copy.dataset.ready) {
    copy.dataset.ready = 'true';
    copy.hidden = !(platform === 'android' || platform === 'ios');
    copy.addEventListener('click', async () => {
      const status = document.querySelector('[data-copy-status]');
      const url = new URL(downloadPagePath(document), host.location.origin).href;
      try {
        await host.navigator.clipboard.writeText(url);
        if (status) status.textContent = translate('Link copied. Open it on your PC to download.');
      } catch {
        if (status) status.textContent = url;
      }
    });
  }
  if (count && !landing.dataset.counted) {
    landing.dataset.counted = 'true';
    countDownload('download_page_view', platform, {window: host});
  }
  return platform;
}

/** The thank-you page: starts the requested download, or says it is not available. */
export function startRequestedDownload(document, manifest, {window: host = globalThis.window, delay = 700} = {}) {
  const root = document.querySelector('[data-download-started]');
  if (!root || root.dataset.handled) return null;
  root.dataset.handled = 'true';
  const requested = new URLSearchParams(host.location.search).get('platform');
  const link = downloadLinks(manifest).windows;
  const asset = link && qualifiedAssets(manifest).find(item => item.siteId === 'codevalanche' && item.platform === 'windows'
    && item.releaseId === link.releaseId && item.artifactId === link.artifactId);
  const ok = document.querySelector('[data-started-ok]');
  const missing = document.querySelector('[data-started-missing]');
  if (requested !== `windows-${asset?.architecture}` || !ok) {
    if (ok) ok.hidden = true;
    for (const element of document.querySelectorAll('.page-body > :not(#while-you-wait)')) element.hidden = true;
    if (missing) missing.hidden = false;
    return null;
  }
  // Straight to the file: the site's gateway is a page of its own and would
  // replace this one, while a file download leaves this page on screen.
  const start = () => host.location.assign(asset.targetUrl);
  countDownload('download_started', requested, {window: host});
  host.setTimeout(start, delay);
  document.querySelector('[data-download-retry]')?.addEventListener('click', event => {
    event.preventDefault();
    countDownload('download_retry', requested, {window: host});
    start();
  });
  return requested;
}
