// Two-step verification (Supabase Auth MFA, TOTP) rules for the account function.
//
// The authenticator itself is Supabase Auth MFA: the account page enrols and
// verifies it with supabase-js, and a verified code raises the session to aal2.
// This module adds what Auth does not have: recovery codes, and the rule that a
// session of a user with a verified authenticator must be aal2 before the
// account function answers it.

// Crockford base32 (no i, l, o, u): unbiased with one byte & 31, easy to type.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
export const RECOVERY_CODE_COUNT = 10
const RECOVERY_CODE_LENGTH = 10 // 50 bits each

/** Ten fresh codes, formatted "xxxxx-xxxxx". */
export function generateRecoveryCodes(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const codes = new Set()
  while (codes.size < RECOVERY_CODE_COUNT) {
    const bytes = random(RECOVERY_CODE_LENGTH)
    let code = ''
    for (const byte of bytes) code += ALPHABET[byte & 31]
    codes.add(`${code.slice(0, 5)}-${code.slice(5)}`)
  }
  return [...codes]
}

/** The canonical 10-character form, or '' when the text cannot be a recovery code. */
export function normalizeRecoveryCode(input) {
  if (typeof input !== 'string' || input.length > 32) return ''
  const compact = input.toLowerCase().replace(/[\s-]/g, '').replace(/o/g, '0').replace(/[il]/g, '1')
  return compact.length === RECOVERY_CODE_LENGTH && [...compact].every((c) => ALPHABET.includes(c)) ? compact : ''
}

/** SHA-256 hex of "<user id>:<normalized code>"; the only form that is stored. */
export async function hashRecoveryCode(userId, normalizedCode) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${normalizedCode}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Verified TOTP factors of the Auth user (getUser returns them in user.factors). */
export function verifiedTotpFactors(user) {
  return (Array.isArray(user?.factors) ? user.factors : []).filter((f) => f && f.factor_type === 'totp' && f.status === 'verified')
}

// Answered for a session that has not passed the authenticator yet.
const BEFORE_AAL2 = new Set(['sign-out-current', 'mfa-recovery-redeem'])
// Changing two-step verification always needs a fresh aal2 session, whatever issued the token.
const MFA_MANAGEMENT = new Set(['mfa-recovery-codes', 'mfa-disable'])

/**
 * null when the action may run; otherwise the answer to send.
 *
 * Tokens issued to an OAuth client (claim client_id, e.g. the desktop app) are
 * held to aal2 only when the operator turned enforceOAuth on, after checking
 * that such tokens carry aal2 for a user who passed the authenticator on the
 * consent page (README, operator step). Until then the consent page itself asks
 * for the authenticator before it approves, and installed apps keep working.
 */
export function mfaGate({ user, claims, action, enforceOAuth = false }) {
  const aal2 = claims?.aal === 'aal2'
  if (action === 'export-account' && (user?.factors || []).some(f => f.status === 'verified') && !aal2) return { status: 401, body: { error: 'MFA required', mfaRequired: true } }
  if (MFA_MANAGEMENT.has(action) && !aal2) return { status: 401, body: { error: 'MFA required', mfaRequired: true } }
  if (!verifiedTotpFactors(user).length || aal2 || BEFORE_AAL2.has(action)) return null
  const oauthClient = typeof claims?.client_id === 'string' && claims.client_id.length > 0
  if (oauthClient && !enforceOAuth) return null
  return { status: 401, body: { error: 'MFA required', mfaRequired: true } }
}
