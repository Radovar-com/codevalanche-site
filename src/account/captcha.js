let widgetPromise
export function loadTurnstile() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile)
  return widgetPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true
    script.onload = () => { if (globalThis.turnstile) resolve(globalThis.turnstile); else { widgetPromise = null; reject({ code: 'captcha_required' }) } }
    script.onerror = () => { widgetPromise = null; reject({ code: 'captcha_required' }) }
    document.head.append(script)
  })
}
export function createAccountCaptcha({siteKey,container,loadWidget=loadTurnstile}) {
  let widgetId, widget
  return { async challenge() {
    if (!siteKey) return undefined
    widget = await loadWidget(); if (widgetId !== undefined) widget.remove(widgetId)
    return new Promise((resolve, reject) => { const fail = () => reject(Object.assign(new Error('captcha_required'), { code: 'captcha_required' })); widgetId = widget.render(container, { sitekey: siteKey, callback: token => typeof token === 'string' && token.length > 0 ? resolve(token) : fail(), 'error-callback': fail, 'expired-callback': fail }) })
  } }
}
