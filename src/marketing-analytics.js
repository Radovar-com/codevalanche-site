import { resolveMarketingRoute } from './locales/manifest.js';

// Guide chapters retain distinct URLs and SEO identities, while consent and
// navigation use the existing server-owned docs measurement category.
export function marketingAnalyticsPageId(pathname) {
  const route = resolveMarketingRoute(pathname);
  return route?.pathname.startsWith('/docs/') ? 'docs' : route?.pageId;
}
