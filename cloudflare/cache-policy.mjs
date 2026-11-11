// Browser caching only: no Cache API writes and no shared cache for cookie or
// authenticated responses. HTML and discovery documents must revalidate.
export function withAssetCache(response, request) {
  const result = new Response(response.body, response);
  const headers = result.headers;
  const previous = headers.get('cache-control') ?? '';
  if (request.headers.has('authorization') || headers.has('set-cookie') || /\b(?:private|no-store)\b/i.test(previous)) {
    headers.set('cache-control', 'private, no-store');
  } else if (!['GET', 'HEAD'].includes(request.method) || ![200, 304].includes(response.status)) {
    headers.set('cache-control', 'no-store');
  } else {
    const url = new URL(request.url);
    const asset = /\.(?:css|js|woff2|webp|png|svg)$/i.test(url.pathname);
    const revision = url.searchParams.getAll('v');
    headers.set('cache-control', asset
      ? revision.length === 1 && /^[a-f0-9]{16}$/.test(revision[0])
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600, must-revalidate'
      : 'no-cache');
  }
  return result;
}
