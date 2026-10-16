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
  else if (supplied === 'export_too_large' && status === 413) code = supplied
  else if (['mfa_required','recovery_restricted','account_deletion_pending','email_verification_required'].includes(supplied) && status === 403) code = supplied
  else if (status === 401) code = 'session_not_found'
  else if (status >= 500) code = 'account_service_unavailable'
  else if (status === 429) code = 'over_request_rate_limit'
  else if (status === 403) code = ['Account blocked', 'account_suspended', 'account_blocked', 'user_banned'].includes(supplied)
    ? 'account_suspended' : 'account_forbidden'
  else if (supplied === 'Invalid profile' || supplied === 'profile_invalid') code = 'profile_invalid'
  return { code, status }
}

export function safeError(error) {
  const messages = { invalid_credentials: 'Email or password is incorrect.', user_not_found: 'Email or password is incorrect.', email_not_confirmed: 'Confirm your email before signing in.', weak_password: 'Choose a stronger password with at least 15 characters.', over_email_send_rate_limit: 'Please wait a moment before requesting another email.', over_request_rate_limit: 'Too many attempts. Please try again shortly.', session_not_found: 'Your session has expired. Sign in again.', same_password: 'Choose a different password.', otp_expired: 'This email link has expired. Request a new link.',
    account_suspended: 'Your account is suspended. Contact support or sign out.', user_banned: 'Your account is suspended. Contact support.',
    account_service_unavailable: 'The account service is temporarily unavailable. Your saved session is preserved. Try again shortly.',
    account_forbidden: 'Account access could not be verified. Try again or sign out.', profile_invalid: 'Use a name up to 80 characters and a bio up to 500 characters.',
    reauthentication_required: 'Sign in again and verify your authenticator to continue.', mfa_required: 'Verify your authenticator to continue.', recovery_restricted: 'Finish recovery, then sign in again to use sensitive account services.', recovery_invalid_or_expired: 'This recovery link is invalid or expired. Request a new link.', mfa_verification_failed: 'That authenticator code could not be verified. Try a new code.',
    remote_quota_exceeded: 'Your remote limit is reached. Stop and revoke remain available.', account_deletion_pending: 'Account deletion is pending. Sign in again to cancel before deletion starts.', email_verification_required: 'Verify your email before using sensitive online access.',
    export_too_large: 'Your account data is too large to download here. Contact support for a complete copy.',
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
