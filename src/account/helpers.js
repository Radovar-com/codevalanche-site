import { normalizeProfile } from '../../supabase/functions/codevalanche-account/validation.mjs'

export function normalizeAccountProfile(input) {
  try { normalizeProfile(input); return input } catch { throw { code: 'profile_invalid' } }
}

export function normalizeAccountError(payload, status) {
  const supplied = typeof payload?.error === 'string' ? payload.error : payload?.error?.code || payload?.code
  let code = 'account_service_error'
  if (supplied === 'reauthentication_required' && status === 401) code = supplied
  else if (supplied === 'operation_conflict' && status === 409) code = supplied
  else if (supplied === 'remote_quota_exceeded' && status === 429) code = supplied
  else if (['mfa_required','recovery_restricted','account_deletion_pending','email_verification_required'].includes(supplied) && status === 403) code = supplied
  // The account function asks for the authenticator (aal2) before it answers.
  else if (status === 401 && (payload?.mfaRequired === true || supplied === 'mfa_required')) code = 'mfa_required'
  else if (status === 401) code = 'session_not_found'
  else if (status >= 500) code = 'account_service_unavailable'
  else if (status === 429) code = 'over_request_rate_limit'
  else if (status === 403) code = ['Account blocked', 'account_suspended', 'account_blocked', 'user_banned'].includes(supplied)
    ? 'account_suspended' : 'account_forbidden'
  else if (supplied === 'Invalid profile' || supplied === 'profile_invalid') code = 'profile_invalid'
  return { code, status }
}

// Which account server contract the page talks to (config.js accountServer).
// "v1" (default) = the account function that is live today: only its actions are
// called and features that need newer server actions stay hidden. "v2" = the newer
// server (API v2 operations, recovery codes, activity, analytics consent).
export function accountServerVersion(config) {
  return config?.accountServer === 'v2' ? 'v2' : 'v1'
}
// The actions the live (v1) account function answers; the page calls no other.
export const V1_ACCOUNT_ACTIONS = Object.freeze(['get-account', 'update-profile', 'sign-out-current', 'sign-out-others', 'revoke-session', 'request-deletion', 'cancel-deletion', 'consent', 'feedback', 'event'])
export function safeError(error) {
  const messages = { invalid_credentials: 'Email or password is incorrect.', user_not_found: 'Email or password is incorrect.', email_not_confirmed: 'Confirm your email before signing in.', weak_password: 'Choose a stronger password with at least 12 characters.', captcha_failed: 'The security check did not pass. Please try again.', over_email_send_rate_limit: 'Please wait a moment before requesting another email.', over_request_rate_limit: 'Too many attempts. Please try again shortly.', session_not_found: 'Your session has expired. Sign in again.', same_password: 'Choose a different password.', otp_expired: 'This email link has expired. Request a new link.',
    account_suspended: 'Your account is suspended. Contact support or sign out.', user_banned: 'Your account is suspended. Contact support.',
    account_service_unavailable: 'The account service is temporarily unavailable. Your saved session is preserved. Try again shortly.',
    account_forbidden: 'Account access could not be verified. Try again or sign out.', profile_invalid: 'Use a name up to 80 characters and a bio up to 500 characters.',
    reauthentication_required: 'Sign in again and verify your authenticator to continue.', mfa_required: 'Verify your authenticator to continue.', recovery_restricted: 'Finish recovery, then sign in again to use sensitive account services.', recovery_invalid_or_expired: 'This recovery link is invalid or expired. Request a new link.', mfa_verification_failed: 'That authenticator code could not be verified. Try a new code.',
    remote_quota_exceeded: 'Your remote limit is reached. Stop and revoke remain available.', account_deletion_pending: 'Account deletion is pending. Sign in again to cancel before deletion starts.', email_verification_required: 'Verify your email before using sensitive online access.',
    operation_conflict: 'The request was refused because another account operation is pending or deletion has started. Refresh your account before trying again.',
    account_operation_unknown: 'The account request result could not be confirmed. Refresh your account to check its current state. Local projects are preserved.' }
  messages.captcha_required = 'Complete the verification challenge to continue. Try again if it expired.'
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
// New passwords (sign-up, choosing a new one) need 12 characters; Supabase Auth
// enforces the same minimum (supabase/config.toml). Sign-in is never checked
// here, so accounts created under the older minimum keep working.
export const MIN_PASSWORD_LENGTH = 12
export function passwordProblem(password, mode) {
  if ((mode === 'signup' || mode === 'update') && String(password || '').length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
  return ''
}
// Cloudflare Turnstile is off until a public site key is configured. Once
// Supabase Auth CAPTCHA is on it checks these three flows.
export const captchaModes = new Set(['signin', 'signup', 'reset'])
export function turnstileSiteKey(config) {
  const key = typeof config?.turnstileSiteKey === 'string' ? config.turnstileSiteKey.trim() : ''
  return /^[0-9]x[0-9A-Za-z_-]{20,64}$/.test(key) ? key : ''
}
// Languages the account email templates exist in (supabase/templates).
export const EMAIL_LOCALES = ['en', 'ro']
export function emailLocaleFor(languages = []) {
  for (const language of languages) {
    const base = String(language || '').toLowerCase().split('-')[0]
    if (EMAIL_LOCALES.includes(base)) return base
  }
  return 'en'
}
