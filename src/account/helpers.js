import { normalizeProfile } from '../../supabase/functions/codevalanche-account/validation.mjs'

export function normalizeAccountProfile(input) {
  try { normalizeProfile(input); return input } catch { throw { code: 'profile_invalid' } }
}

export function normalizeAccountError(payload, status) {
  const supplied = typeof payload?.error === 'string' ? payload.error : payload?.error?.code || payload?.code
  let code = 'account_service_error'
  if (status === 401) code = 'session_not_found'
  else if (status >= 500) code = 'account_service_unavailable'
  else if (status === 429) code = 'over_request_rate_limit'
  else if (status === 403) code = ['Account blocked', 'account_suspended', 'account_blocked', 'user_banned'].includes(supplied)
    ? 'account_suspended' : 'account_forbidden'
  else if (supplied === 'Invalid profile' || supplied === 'profile_invalid') code = 'profile_invalid'
  return { code, status }
}

export function safeError(error) {
  const messages = { invalid_credentials: 'Email or password is incorrect.', email_not_confirmed: 'Confirm your email before signing in.', weak_password: 'Choose a stronger password with at least 8 characters.', over_email_send_rate_limit: 'Please wait a moment before requesting another email.', over_request_rate_limit: 'Too many attempts. Please try again shortly.', session_not_found: 'Your session has expired. Sign in again.', same_password: 'Choose a different password.', otp_expired: 'This email link has expired. Request a new link.',
    account_suspended: 'Your account is suspended. Contact support or sign out.', user_banned: 'Your account is suspended. Contact support.',
    account_service_unavailable: 'The account service is temporarily unavailable. Your saved session is preserved. Try again shortly.',
    account_forbidden: 'Account access could not be verified. Try again or sign out.', profile_invalid: 'Use a name up to 80 characters and a bio up to 500 characters.' }
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : 'Unable to complete this request. Please try again.'
}
export function identityLabels(identities = []) {
  const labels = { email: 'Email and password', google: 'Google', github: 'GitHub', apple: 'Apple' }
  return [...new Set(identities.map(identity => identity.provider).filter(value => typeof value === 'string'))].map(provider => Object.hasOwn(labels, provider) ? labels[provider] : provider)
}
export function authCallback(currentHref) {
  const current = new URL(currentHref)
  const callback = new URL('/account/', current.origin)
  const id = current.searchParams.get('authorization_id')
  if (id && /^[a-zA-Z0-9_-]{1,200}$/.test(id)) callback.searchParams.set('authorization_id', id)
  return callback
}
