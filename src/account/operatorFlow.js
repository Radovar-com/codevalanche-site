// Company OS connection: which of the three steps (sign in, security code, done)
// the visible card belongs to, and the requested access in plain words. No DOM,
// so the mapping is tested on its own.
export const OPERATOR_STEPS = ['Sign in', 'Security code', 'Done']

export function operatorStep({ consent = false, securityCode = false } = {}) {
  if (consent) return 3
  if (securityCode) return 2
  return 1
}

const SCOPE_WORDS = { email: 'email', profile: 'name' }

// Returns the English source sentence (translated by the caller) and any scope
// that has no plain description, which is then listed as asked rather than hidden.
export function accessSummary(scope = '') {
  const scopes = [...new Set(String(scope).split(/\s+/).filter(Boolean))]
  const seen = new Set(scopes.map(item => SCOPE_WORDS[item]).filter(Boolean))
  const other = scopes.filter(item => item !== 'openid' && !SCOPE_WORDS[item])
  const sentence = seen.has('name') && seen.has('email') ? '{client} will see your name and email address.'
    : seen.has('email') ? '{client} will see your email address.'
      : seen.has('name') ? '{client} will see your name.'
        : '{client} will only confirm that it is you.'
  return { sentence, other }
}
