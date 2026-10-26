import { searchGuide } from './search-core.js';

const region = document.querySelector('[data-doc-search]');
if (region) {
  if (matchMedia('(max-width: 760px)').matches) document.querySelector('[data-doc-contents]').open = false;
  const input = region.querySelector('input');
  const status = region.querySelector('[data-doc-status]');
  const results = region.querySelector('[data-doc-results]');
  const message = key => region.querySelector(`[data-doc-${key}]`).textContent;
  let index;
  const render = () => {
    const matches = searchGuide(index, input.value);
    results.replaceChildren();
    results.hidden = !matches.length;
    status.textContent = input.value.trim() ? (matches.length ? message('count').replace('{count}', String(matches.length)) : message('empty')) : '';
    for (const page of matches) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      const description = document.createElement('p');
      // The index is a build artifact, but still restrict links to this guide.
      const url = new URL(page.url, location.origin);
      const prefix = document.documentElement.lang === 'en' ? '/docs/' : `/${document.documentElement.lang.toLowerCase()}/docs/`;
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) continue;
      link.href = url.pathname;
      link.textContent = page.title;
      description.textContent = page.description;
      item.append(link, description);
      results.append(item);
    }
  };
  // A relative URL follows the current page's locale, including nested topics.
  const guideRoot = region.closest('main').querySelector('.kicker a').href;
  region.hidden = false;
  input.disabled = true;
  fetch(new URL('search-index.json', guideRoot), { credentials: 'omit', cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error('Search index unavailable');
      return response.json();
    }).then(pages => {
      if (!Array.isArray(pages) || pages.some(page => !['url', 'title', 'description', 'text'].every(key => typeof page[key] === 'string'))) throw new Error('Invalid guide index');
      index = pages;
      input.disabled = false;
      input.addEventListener('input', render);
      render();
    }).catch(() => { status.textContent = message('error'); });
}
