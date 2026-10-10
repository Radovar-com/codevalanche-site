import { NavigatorLockAcquireTimeoutError } from '@supabase/supabase-js'

const lockTails = new Map()
const INTENT_KEY = 'codevalanche-account-logout-intent'

/** The SDK and password/signup writers must share one credential lock. */
export function createAccountSessionLifecycle(storageKey) {
  let memoryIntent = null, storageAvailable = true
  function logoutIntent() {
    if (storageAvailable) {
      try { const value = localStorage.getItem(INTENT_KEY); memoryIntent = ['pending', 'complete'].includes(value) ? value : null }
      catch { storageAvailable = false }
    }
    return memoryIntent
  }
  function setLogoutIntent(value) {
    memoryIntent = value
    try { if (value) localStorage.setItem(INTENT_KEY, value); else localStorage.removeItem(INTENT_KEY) }
    catch { storageAvailable = false }
  }
  async function lock(name, timeout, work) {
    if (globalThis.navigator?.locks?.request) {
      return navigator.locks.request(name, { mode: 'exclusive', ...(timeout === 0 ? { ifAvailable: true } : {}) }, async held => {
        if (!held) throw new NavigatorLockAcquireTimeoutError('Credential operation already in progress.')
        return work()
      })
    }
    if (timeout === 0 && lockTails.has(name)) throw new NavigatorLockAcquireTimeoutError('Credential operation already in progress.')
    const pending = (lockTails.get(name) || Promise.resolve()).then(work, work)
    const tail = pending.catch(() => undefined)
    lockTails.set(name, tail)
    try { return await pending } finally { if (lockTails.get(name) === tail) lockTails.delete(name) }
  }
  return { lock, logoutIntent, setLogoutIntent, writeUnprotectedSdkSession: work => lock(`lock:${storageKey}`, -1, work) }
}

/** Bound SDK network work as well as account API calls. */
export async function accountAuthFetch(input, init = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000)
  const abort = () => controller.abort()
  if (init.signal?.aborted) abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    // SDK JSON parsing happens after fetch resolves headers; keep the deadline
    // until the entire body arrives while preserving the original Response.
    if (response.body) await response.clone().arrayBuffer()
    return response
  }
  finally { clearTimeout(timeout); init.signal?.removeEventListener('abort', abort) }
}
