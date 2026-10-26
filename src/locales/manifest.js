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
  { path: '/docs/installation/', file: 'docs/installation/index.html', pageId: 'docs_installation', priority: '0.7' },
  { path: '/docs/first-start/', file: 'docs/first-start/index.html', pageId: 'docs_first_start', priority: '0.7' },
  { path: '/docs/claude-code/', file: 'docs/claude-code/index.html', pageId: 'docs_claude_code', priority: '0.7' },
  { path: '/docs/codex/', file: 'docs/codex/index.html', pageId: 'docs_codex', priority: '0.7' },
  { path: '/docs/first-task/', file: 'docs/first-task/index.html', pageId: 'docs_first_task', priority: '0.7' },
  { path: '/docs/approvals/', file: 'docs/approvals/index.html', pageId: 'docs_approvals', priority: '0.7' },
  { path: '/docs/stop-resume/', file: 'docs/stop-resume/index.html', pageId: 'docs_stop_resume', priority: '0.7' },
  { path: '/docs/files/', file: 'docs/files/index.html', pageId: 'docs_files', priority: '0.7' },
  { path: '/docs/git/', file: 'docs/git/index.html', pageId: 'docs_git', priority: '0.7' },
  { path: '/docs/terminal/', file: 'docs/terminal/index.html', pageId: 'docs_terminal', priority: '0.7' },
  { path: '/docs/browser/', file: 'docs/browser/index.html', pageId: 'docs_browser', priority: '0.7' },
  { path: '/docs/conversations/', file: 'docs/conversations/index.html', pageId: 'docs_conversations', priority: '0.7' },
  { path: '/docs/import/', file: 'docs/import/index.html', pageId: 'docs_import', priority: '0.7' },
  { path: '/docs/automations/', file: 'docs/automations/index.html', pageId: 'docs_automations', priority: '0.7' },
  { path: '/docs/settings/', file: 'docs/settings/index.html', pageId: 'docs_settings', priority: '0.7' },
  { path: '/docs/updates/', file: 'docs/updates/index.html', pageId: 'docs_updates', priority: '0.7' },
  { path: '/docs/uninstall/', file: 'docs/uninstall/index.html', pageId: 'docs_uninstall', priority: '0.7' },
  { path: '/docs/faq/', file: 'docs/faq/index.html', pageId: 'docs_faq', priority: '0.7' },
  { path: '/docs/troubleshooting/', file: 'docs/troubleshooting/index.html', pageId: 'docs_troubleshooting', priority: '0.7' },
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
// The page that starts a download belongs to the download page: it is
// translated like it, but it is not a separate public route in the sitemap.
export const DOWNLOAD_STARTED_PAGE = Object.freeze({ path: '/download/started/', file: 'download/started/index.html', pageId: 'download' });
for (const alias of [DOWNLOAD_STARTED_PAGE.path, DOWNLOAD_STARTED_PAGE.path.slice(0, -1), `${DOWNLOAD_STARTED_PAGE.path}index.html`]) {
  routes.set(alias, { pathname: DOWNLOAD_STARTED_PAGE.path, pageId: DOWNLOAD_STARTED_PAGE.pageId });
}
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
