// Keep the query in memory: no URL parameters, storage or network requests.
const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function searchGuide(pages, query) {
  if (typeof query !== 'string' || query.length > 160) return [];
  const words = normalize(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!words.length) return [];
  return pages.map((page, order) => {
    const title = normalize(page.title);
    const description = normalize(page.description);
    const text = normalize(`${page.title} ${page.description} ${page.text}`);
    return { page, order, match: words.every(word => text.includes(word)), score: words.reduce((sum, word) => sum + (title.includes(word) ? 4 : description.includes(word) ? 2 : 1), 0) };
  }).filter(item => item.match).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 20).map(item => item.page);
}
