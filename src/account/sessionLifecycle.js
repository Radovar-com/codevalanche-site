import { NavigatorLockAcquireTimeoutError } from '@supabase/supabase-js'

const lockTails = new Map()
const INTENT_KEY = 'codevalanche-account-logout-intent'

/** The SDK and password/signup writers must share one credential lock. */
export function createAccountSessionLifecycle(storageKey) {
  let memoryIntent = null, storageAvailable = true, initializing = false
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
    // The SDK caches initializePromise, including rejections. Its initial
    // acquisition must remain resumable; page reads have their own deadline.
    if (initializing) timeout = -1
    const unavailable = () => new NavigatorLockAcquireTimeoutError('Credential operation already in progress.')
    if (globalThis.navigator?.locks?.request) {
      const controller = new AbortController()
      let acquired = false
      const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null
      try {
        return await navigator.locks.request(name, { mode: 'exclusive', ...(timeout === 0 ? { ifAvailable: true } : timeout > 0 ? { signal: controller.signal } : {}) }, async held => {
          if (!held) throw unavailable()
          acquired = true; clearTimeout(timer)
          return work()
        })
      } catch (error) { if (!acquired && controller.signal.aborted) throw unavailable(); throw error }
      finally { clearTimeout(timer) }
    }
    if (timeout === 0 && lockTails.has(name)) throw unavailable()
    let expired = false, timer
    const run = () => { if (expired) throw unavailable(); clearTimeout(timer); return work() }
    const pending = (lockTails.get(name) || Promise.resolve()).then(run, run)
    const tail = pending.catch(() => undefined)
    lockTails.set(name, tail)
    // Keep the queue entry until the previous holder actually releases it,
    // even when this caller's acquisition deadline has already elapsed.
    void tail.then(() => { if (lockTails.get(name) === tail) lockTails.delete(name) })
    try {
      return await (timeout > 0 ? Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(unavailable()) }, timeout)
      })]) : pending)
    } finally { clearTimeout(timer) }
  }
  async function initialize(work) {
    initializing = true
    try { return await work() } finally { initializing = false }
  }
  return { lock, initialize, logoutIntent, setLogoutIntent, writeUnprotectedSdkSession: work => lock(`lock:${storageKey}`, -1, work) }
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

/** A stuck peer must not leave account reads on a permanent loading screen. */
export async function readAccountSession(client) {
  let timer
  try {
    return await Promise.race([client.auth.getSession(), new Promise((_, reject) => {
      timer = setTimeout(() => reject({ code: 'account_service_unavailable' }), 8000)
    })])
  } catch (error) {
    if (error?.isAcquireTimeout) throw { code: 'account_service_unavailable' }
    throw error
  } finally { clearTimeout(timer) }
}
