/** Download only a recognized export for the currently displayed account. */
export function downloadAccountData(data, userId, document = globalThis.document, url = globalThis.URL) {
  if (data?.schemaVersion !== 1 || data?.account?.id !== userId || !Number.isFinite(Date.parse(data.exportedAt))) {
    throw { code: 'account_service_unavailable' }
  }
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
  const objectUrl = url.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `codevalanche-account-data-${new Date(data.exportedAt).toISOString().slice(0, 10)}.json`
  try { document.body.append(link); link.click() }
  finally { link.remove(); setTimeout(() => url.revokeObjectURL(objectUrl), 1000) }
}
