// Provider-generated SVG stays in an image, never in page HTML or a remote QR service.
export function authenticatorQrSource(value) {
  if (typeof value !== 'string' || value.length > 200000) return ''
  const prefix = /^data:image\/svg\+xml(?:;(?:utf-8|charset=utf-8))?,/i.exec(value)
  if (!prefix) return ''
  const payload = value.slice(prefix[0].length)
  try {
    const svg = payload.trimStart().startsWith('<') ? payload : decodeURIComponent(payload)
    if (!/<svg(?:\s|>)/i.test(svg)) return ''
    // Escape #, percent signs and Unicode so the browser cannot truncate the QR.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch { return '' }
}
