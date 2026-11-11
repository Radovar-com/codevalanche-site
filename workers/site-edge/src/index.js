import { withAssetCache } from '../../../cloudflare/cache-policy.mjs';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath, resolveMarketingRoute } from '../../../src/locales/manifest.js';

const ROUTE_COOKIE = 'codevalanche_route_checked';
const LANGUAGE_COOKIE = 'codevalanche_language';
const YEAR = 60 * 60 * 24 * 365;

// Deliberately map only supported languages with a clear country-level default.
// Multilingual countries such as Belgium, Canada and Switzerland stay in English.
export const COUNTRY_LOCALE = Object.freeze({
  AT: 'de',
  BR: 'pt-BR',
  CN: 'zh-Hans',
  DE: 'de',
  ES: 'es',
  FR: 'fr',
  ID: 'id',
  IT: 'it',
  JP: 'ja',
  KR: 'ko',
  RO: 'ro',
  RU: 'ru',
  TR: 'tr',
  TW: 'zh-Hant',
  VN: 'vi',
});

function cookieValue(request, name) {
  const cookies = request.headers.get('cookie') ?? '';
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return '';
}

function appendCookie(headers, requestUrl, name, value, httpOnly = true) {
  const secure = requestUrl.protocol === 'https:' ? '; Secure' : '';
  headers.append('set-cookie', `${name}=${value}; Max-Age=${YEAR}; Path=/${httpOnly ? '; HttpOnly' : ''}; SameSite=Lax${secure}`);
}

function contentSecurityPolicy(html) {
  const meta = html.match(/<meta\b[^>]*http-equiv\s*=\s*(["'])content-security-policy\1[^>]*>/i)?.[0];
  if (!meta) return '';
  const content = meta.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2];
  return content?.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&#x27;/gi, "'") ?? '';
}

async function addResponseHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=()');
  if (env.HSTS_ENABLED === 'true' && new URL(request.url).protocol === 'https:') {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }

  const isHtml = (headers.get('content-type') ?? '').toLowerCase().includes('text/html');
  if (isHtml && request.method !== 'HEAD' && response.body) {
    const bytes = await response.arrayBuffer();
    const html = new TextDecoder().decode(bytes);
    const csp = contentSecurityPolicy(html);
    if (csp) headers.set('content-security-policy', csp);
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
  }
  if ([204, 304].includes(response.status) || request.method === 'HEAD') {
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function checkedResponse(requestUrl, status, location, locale) {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    location,
  });
  appendCookie(headers, requestUrl, ROUTE_COOKIE, '1');
  appendCookie(headers, requestUrl, LANGUAGE_COOKIE, locale, false);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=()');
  return new Response(null, { status, headers });
}

function originRequest(request, requestUrl, env) {
  if (typeof env.SITE_ORIGIN !== 'string' || !env.SITE_ORIGIN.trim()) {
    throw new TypeError('SITE_ORIGIN must be configured to a verified static origin before the Worker can proxy requests');
  }
  const origin = new URL(env.SITE_ORIGIN);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new TypeError('SITE_ORIGIN must be an HTTPS origin without a path or credentials');
  }
  const basePath = String(env.SITE_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');
  const suffix = requestUrl.pathname.replace(/^\/+|\/+$/g, '');
  const joinedPath = [basePath, suffix].filter(Boolean).join('/');
  origin.pathname = joinedPath ? `/${joinedPath}${requestUrl.pathname.endsWith('/') ? '/' : ''}` : '/';
  origin.search = requestUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  return new Request(origin, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const route = resolveMarketingRoute(requestUrl.pathname);
    const isMarketingRoute = route !== null && MARKETING_PAGES.some(page => page.pageId === route.pageId);
    const htmlNavigation = ['GET', 'HEAD'].includes(request.method)
      && (request.headers.get('accept') ?? '').toLowerCase().includes('text/html')
      && isMarketingRoute;

    if (htmlNavigation) {
      const checked = cookieValue(request, ROUTE_COOKIE) === '1';
      const languagePreference = cookieValue(request, LANGUAGE_COOKIE).toLowerCase();
      const hasLanguagePreference = languagePreference === 'en' || Boolean(LOCALES.some(item => item.slug && item.slug === languagePreference));
      const locale = route.locale === 'en'
        ? (COUNTRY_LOCALE[String(request.cf?.country ?? '').toUpperCase()] ?? '')
        : '';
      if (!checked && !hasLanguagePreference && route.locale === 'en' && locale) {
        const localizedPath = localizedMarketingPath(requestUrl.pathname, locale);
        const target = new URL(localizedPath, requestUrl.origin);
        target.search = requestUrl.search;
        return checkedResponse(requestUrl, 302, target.href, locale.toLowerCase());
      }

      const selectedLocale = route.locale === 'en' ? 'en' : route.locale.toLowerCase();
      const response = await (env.fetch ?? fetch)(originRequest(request, requestUrl, env));
      const secured = await addResponseHeaders(response, request, env);
      const headers = new Headers(secured.headers);
      headers.set('cache-control', 'private, no-store');
      appendCookie(headers, requestUrl, ROUTE_COOKIE, '1');
      appendCookie(headers, requestUrl, LANGUAGE_COOKIE, selectedLocale, false);
      return new Response(secured.body, { status: secured.status, statusText: secured.statusText, headers });
    }

    const response = await (env.fetch ?? fetch)(originRequest(request, requestUrl, env));
    return withAssetCache(await addResponseHeaders(response, request, env), request);
  },
};
