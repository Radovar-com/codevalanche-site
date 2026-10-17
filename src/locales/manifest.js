export const LOCALES = Object.freeze([
  { tag: 'en', slug: '', label: 'English', dir: 'ltr' },
  { tag: 'ar', slug: 'ar', label: 'العربية الفصحى', dir: 'rtl' },
  { tag: 'de', slug: 'de', label: 'Deutsch', dir: 'ltr' },
  { tag: 'es', slug: 'es', label: 'Español', dir: 'ltr' },
  { tag: 'fr', slug: 'fr', label: 'Français', dir: 'ltr' },
  { tag: 'hi', slug: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { tag: 'id', slug: 'id', label: 'Bahasa Indonesia', dir: 'ltr' },
  { tag: 'it', slug: 'it', label: 'Italiano', dir: 'ltr' },
  { tag: 'ja', slug: 'ja', label: '日本語', dir: 'ltr' },
  { tag: 'ko', slug: 'ko', label: '한국어', dir: 'ltr' },
  { tag: 'pt-BR', slug: 'pt-br', label: 'Português (Brasil)', dir: 'ltr' },
  { tag: 'ro', slug: 'ro', label: 'Română', dir: 'ltr' },
  { tag: 'ru', slug: 'ru', label: 'Русский', dir: 'ltr' },
  { tag: 'tr', slug: 'tr', label: 'Türkçe', dir: 'ltr' },
  { tag: 'vi', slug: 'vi', label: 'Tiếng Việt', dir: 'ltr' },
  { tag: 'zh-Hans', slug: 'zh-hans', label: '简体中文', dir: 'ltr' },
  { tag: 'zh-Hant', slug: 'zh-hant', label: '繁體中文', dir: 'ltr' },
]);

const localeBySlug = new Map(LOCALES.filter(locale => locale.slug).map(locale => [locale.slug, locale]));
const localeByTag = new Map(LOCALES.map(locale => [locale.tag.toLowerCase(), locale]));
export const MARKETING_PAGES = Object.freeze([
  { path: '/', file: 'index.html', pageId: 'home', priority: '1.0' },
  { path: '/how-it-works/', file: 'how-it-works/index.html', pageId: 'how_it_works', priority: '0.8' },
  { path: '/agents/', file: 'agents/index.html', pageId: 'agents', priority: '0.8' },
  { path: '/features/multiple-accounts/', file: 'features/multiple-accounts/index.html', pageId: 'multiple_accounts', priority: '0.8' },
  { path: '/local-ai/', file: 'local-ai/index.html', pageId: 'local_ai', priority: '0.8' },
  { path: '/docs/', file: 'docs/index.html', pageId: 'docs', priority: '0.8' },
  { path: '/download/', file: 'download/index.html', pageId: 'download', priority: '0.8' },
  { path: '/security/', file: 'security/index.html', pageId: 'security', priority: '0.8' },
  { path: '/changelog.html', file: 'changelog.html', pageId: 'changelog', priority: '0.7' },
  { path: '/privacy.html', file: 'privacy.html', pageId: 'privacy', priority: '0.5' },
  { path: '/terms.html', file: 'terms.html', pageId: 'terms', priority: '0.4' },
]);
// Only registered directory pages gain index aliases. Account callback paths
// deliberately stay outside this public-page resolver.
const routes = new Map(MARKETING_PAGES.flatMap(page => {
  const aliases = page.path === '/' ? ['/', '/index.html', '//']
    : page.path.endsWith('/') ? [page.path, page.path.slice(0, -1), `${page.path}index.html`]
      : [page.path, `${page.path}/`];
  return aliases.map(alias => [alias, { pathname: page.path, pageId: page.pageId }]);
}));
routes.set('/account.html', { pathname: '/account.html', pageId: 'account_entry_legacy' });
routes.set('/account.html/', routes.get('/account.html'));

export function resolveMarketingRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null;

  const segments = pathname.split('/');
  const locale = localeBySlug.get(segments[1].toLowerCase()) ?? LOCALES[0];
  const localized = locale.slug !== '';
  const routeSegments = localized ? segments.slice(2) : segments.slice(1);
  const route = routes.get(`/${routeSegments.join('/')}`);
  return route ? { locale: locale.tag, ...route } : null;
}

export function localizedMarketingPath(pathname, targetLocale) {
  const locale = localeByTag.get(String(targetLocale ?? '').toLowerCase())
    ?? localeBySlug.get(String(targetLocale ?? '').toLowerCase());
  const route = resolveMarketingRoute(pathname);
  if (!locale || !route || !MARKETING_PAGES.some(page => page.pageId === route.pageId)) return '/';
  return `${locale.slug ? `/${locale.slug}` : ''}${route.pathname}`;
}
