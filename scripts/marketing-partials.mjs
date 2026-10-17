import { parseFragment, serialize } from 'parse5';
import { resolveMarketingRoute } from '../src/locales/manifest.js';

const SITE_ORIGIN = 'https://codevalanche.com';

export function prepareMarketingPartial(html, pathname) {
  const current = resolveMarketingRoute(pathname);
  const fragment = parseFragment(html);
  const walk = node => {
    if (node.tagName === 'a') {
      const href = node.attrs.find(attribute => attribute.name === 'href');
      // Reusing a partial must never retain the previous page's active state.
      node.attrs = node.attrs.filter(attribute => attribute.name !== 'aria-current');
      if (href && current) {
        if (current.pathname === '/' && href.value.startsWith('/#')) href.value = href.value.slice(1);
        try {
          const url = new URL(href.value, SITE_ORIGIN);
          const route = url.origin === SITE_ORIGIN && !url.search && !url.hash && !href.value.startsWith('#')
            ? resolveMarketingRoute(url.pathname) : null;
          if (route && route.pathname === current.pathname) node.attrs.push({ name: 'aria-current', value: 'page' });
        } catch {}
      }
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(fragment);
  return serialize(fragment);
}
