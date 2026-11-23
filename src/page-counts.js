import {resolveMarketingRoute} from './locales/manifest.js';

const PAGES = new Set(['home', 'how_it_works', 'agents', 'multiple_accounts', 'local_ai', 'docs', 'download', 'security', 'changelog', 'privacy', 'terms']);
const LOCALES = new Set(['en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'ro', 'ru', 'tr', 'vi', 'zh-Hans', 'zh-Hant']);
const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|yandex\.[a-z]+|baidu\.com|ecosia\.org|search\.brave\.com|startpage\.com|qwant\.com)$/;
const SOCIAL = /(^|\.)(x\.com|t\.co|twitter\.com|linkedin\.com|lnkd\.in|facebook\.com|instagram\.com|reddit\.com|news\.ycombinator\.com|youtube\.com|tiktok\.com|threads\.net|bsky\.app|mastodon\.social|discord\.com|t\.me|whatsapp\.com)$/;
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|phind\.com|you\.com)$/;

/** Where the visitor came from, as one coarse bucket. The referrer itself is never sent. */
export function referrerSource(referrer, origin) {
  if (!referrer) return 'direct';
  let url;
  try { url = new URL(referrer); } catch { return 'other'; }
  if (url.origin === origin) return 'internal';
  const host = url.hostname.toLowerCase();
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
  if (SEARCH.test(host)) return 'search';
  if (SOCIAL.test(host)) return 'social';
  if (AI.test(host)) return 'ai';
  return 'other';
}

function pageIdFor(pathname) {
  if (pathname.startsWith('/account')) return 'account';
  const id = resolveMarketingRoute(pathname)?.pageId;
  return PAGES.has(id) ? id : 'other';
}

function send(host, config, body) {
  host.fetch(`${config.supabaseUrl}/rest/v1/rpc/count_site_page`, {
    method: 'POST',
    headers: {apikey: config.supabasePublishableKey, 'content-type': 'application/json'},
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  }).catch(() => {});
}

/**
 * Adds one to today's count for this page, and one visit when the page was
 * opened from outside the site. Nothing identifies the visitor: no cookie, no
 * stored identifier, no address kept by the site. Works whatever the visitor
 * chose for optional analytics. Global Privacy Control, Do Not Track and
 * automated browsers are not counted.
 */
export function countPage({window: host = globalThis.window} = {}) {
  try {
    const nav = host.navigator ?? {};
    if (nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.webdriver === true) return [];
    const config = host.CODEVALANCHE_CONFIG ?? {};
    if (!/^https:\/\//.test(config.supabaseUrl ?? '') || !config.supabasePublishableKey) return [];
    const lang = host.document?.documentElement?.lang || 'en';
    const locale = LOCALES.has(lang) ? lang : 'en';
    const page = pageIdFor(host.location.pathname);
    const source = referrerSource(host.document?.referrer ?? '', host.location.origin);
    const sent = [];
    // A reload is not a new page view.
    const navigation = host.performance?.getEntriesByType?.('navigation')?.[0];
    if (navigation?.type === 'reload' || navigation?.type === 'back_forward') return sent;
    send(host, config, {p_site: 'codevalanche', p_page: page, p_metric: 'page_view', p_source: source, p_locale: locale});
    sent.push('page_view');
    if (source !== 'internal') {
      send(host, config, {p_site: 'codevalanche', p_page: page, p_metric: 'visit', p_source: source, p_locale: locale});
      sent.push('visit');
    }
    return sent;
  } catch {
    return [];
  }
}
