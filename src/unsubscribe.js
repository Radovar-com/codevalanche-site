// Release email unsubscribe page. Opening the link changes nothing, so a mail
// scanner that fetches it cannot unsubscribe anyone; the button does.
const root = document.querySelector('[data-unsubscribe]')
const token = new URLSearchParams(location.search).get('t') || ''
const show = (state) => {
  for (const name of ['ask', 'done', 'failed']) root.querySelector(`[data-unsubscribe-${name}]`).hidden = name !== state
}
if (root) {
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,}$/i.test(token)) show('failed')
  const button = root.querySelector('[data-unsubscribe-confirm]')
  let busy = false
  button.addEventListener('click', async () => {
    if (busy) return
    busy = true
    try {
      const base = window.CODEVALANCHE_CONFIG?.supabaseUrl
      const response = await fetch(`${base}/functions/v1/release-announcements?unsubscribe=${encodeURIComponent(token)}`, { method: 'POST' })
      const body = await response.json().catch(() => null)
      show(response.ok && body?.unsubscribed ? 'done' : 'failed')
    } catch {
      show('failed')
    } finally {
      busy = false
    }
  })
}
