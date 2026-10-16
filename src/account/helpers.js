export function safeError(error) {
  const messages = { invalid_credentials: 'Email or password is incorrect.', email_not_confirmed: 'Confirm your email before signing in.', weak_password: 'Choose a stronger password with at least 12 characters.', captcha_failed: 'The security check did not pass. Please try again.', captcha_required: 'Complete the security check, then try again.', over_email_send_rate_limit: 'Please wait a moment before requesting another email.', over_request_rate_limit: 'Too many attempts. Please try again shortly.', session_not_found: 'Your session has expired. Sign in again.', same_password: 'Choose a different password.', otp_expired: 'This email link has expired. Request a new link.' }
  return messages[error?.code] || 'Unable to complete this request. Please try again.'
}
export function identityLabels(identities = []) {
  return [...new Set(identities.map(identity => identity.provider).filter(value => typeof value === 'string'))].map(provider => ({ email: 'Email and password', google: 'Google', github: 'GitHub', apple: 'Apple' })[provider] || provider)
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
