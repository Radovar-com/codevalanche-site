import { createClient } from '@supabase/supabase-js'
import { safeError, identityLabels, authCallback, passwordProblem, MIN_PASSWORD_LENGTH, captchaModes, turnstileSiteKey, emailLocaleFor } from './helpers.js'
const $ = (id) => document.getElementById(id)
const config = window.CODEVALANCHE_CONFIG
const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
const redirectTo = authCallback(location.href)
const authorizationId = redirectTo.searchParams.get('authorization_id')
const recoveryRedirect = new URL(redirectTo); recoveryRedirect.searchParams.set('flow', 'recovery')
let mode = 'signin', user = null, recovery = new URL(location.href).searchParams.get('flow') === 'recovery', busy = false
function notice(message = '', error = false) { $('status').textContent = message; $('status').dataset.error = String(error) }
// Cloudflare Turnstile: inert until config.turnstileSiteKey is set. Tokens are
// single-use, so every widget is reset after each attempt.
const siteKey = turnstileSiteKey(config)
const captchaWidgets = new Map()
let turnstileLoading = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return turnstileLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_unavailable'))
    script.onerror = () => { turnstileLoading = null; script.remove(); reject(new Error('turnstile_unavailable')) }
    document.head.append(script)
  })
}
async function showCaptcha(id, visible) {
  $(id).hidden = !siteKey || !visible
  if (!siteKey || !visible || captchaWidgets.has(id)) return
  const entry = { widget: null, token: '' }
  captchaWidgets.set(id, entry)
  try {
    const turnstile = await loadTurnstile()
    entry.widget = turnstile.render($(id), { sitekey: siteKey, callback: token => { entry.token = token }, 'expired-callback': () => { entry.token = '' }, 'error-callback': () => { entry.token = '' } })
  } catch { captchaWidgets.delete(id); notice('The security check could not load. Check your connection and try again.', true) }
}
function captchaFor(id) {
  if (!siteKey) return undefined
  const token = captchaWidgets.get(id)?.token
  if (!token) throw { code: 'captcha_required' }
  return token
}
function resetCaptcha(id) {
  const entry = captchaWidgets.get(id)
  if (!entry) return
  entry.token = ''
  try { if (entry.widget !== null) window.turnstile?.reset(entry.widget) } catch {}
}
// Language of the account emails (supabase/templates): the browser's, when a
// template exists for it.
function emailLocale() { return emailLocaleFor(navigator.languages?.length ? navigator.languages : [navigator.language]) }
function setMode(next) {
  mode = next
  const reset = next === 'reset', signup = next === 'signup', update = next === 'update'
  $('auth-title').textContent = reset ? 'Reset password' : signup ? 'Create your account' : update ? 'Choose a new password' : 'Sign in'
  $('auth-submit').textContent = reset ? 'Send reset link' : signup ? 'Create account' : update ? 'Save password' : 'Sign in'
  $('auth-description').textContent = reset ? 'We’ll email you a link to choose a new password.' : signup ? `Your Codevalanche account. Use a password with at least ${MIN_PASSWORD_LENGTH} characters.` : update ? `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.` : 'Welcome back to Codevalanche.'
  // Only new passwords need the minimum; older accounts still sign in.
  if (signup || update) $('password').minLength = MIN_PASSWORD_LENGTH; else $('password').removeAttribute('minlength')
  void showCaptcha('captcha', captchaModes.has(next))
  $('social-auth').hidden = reset || update
  $('forgot-row').hidden = next !== 'signin'; $('signup-prompt').hidden = next !== 'signin'
  $('password').type = 'password'; $('password-toggle').setAttribute('aria-label', 'Show password'); $('password-toggle').setAttribute('aria-pressed', 'false')
  $('name-field').hidden = !signup; $('email-field').hidden = update; $('email').required = !update
  $('password-field').hidden = reset; $('password').required = !reset; $('password').autocomplete = signup || update ? 'new-password' : 'current-password'
  document.querySelectorAll('[data-mode]').forEach(button => button.hidden = update || (next === 'signin' ? button.dataset.mode === 'signin' : button.dataset.mode !== 'signin'))
  $('resend').hidden = true; $('password').value = ''
}
async function api(action, data = {}) {
  const { data: { session } } = await client.auth.getSession()
  if (!session) throw { code: 'session_not_found' }
  const response = await fetch(`${config.supabaseUrl}/functions/v1/codevalanche-account`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, ...data }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw { code: result.error?.code || result.code || 'account_service_error' }
  return result
}
async function action(work) {
  if (busy) return
  busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true); notice()
  try { await work() } catch (error) { notice(safeError(error), true) }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false) }
}
function list(id, values) { $(id).replaceChildren(...values.map(value => { const li = document.createElement('li'); li.textContent = value; return li })) }
async function render(session) {
  user = session?.user || null
  $('auth').hidden = Boolean(user) && !recovery; $('profile').hidden = !user || recovery; $('stage').classList.toggle('signed-in', Boolean(user) && !recovery)
  $('consent').hidden = true
  if (authorizationId && user && !recovery) { $('profile').hidden = true; await showConsent(); return }
  if (recovery && user) { setMode('update'); return }
  if (!user) { setMode('signin'); return }
  void showCaptcha('profile-captcha', true)
  $('profile-email').textContent = user.email || ''; $('display-name').value = user.user_metadata?.display_name || ''
  list('methods', identityLabels(user.identities)); list('sessions', ['Loading sessions…'])
  try {
    const account = await api('get-account')
    if (!user || user.id !== session.user.id) return
    $('display-name').value = account.user?.displayName || ''; $('bio').value = account.user?.bio || ''; $('cancel-deletion').hidden = !account.deletion
    list('sessions', account.sessions?.length ? account.sessions.map(s => `${s.current ? 'This session' : s.label || 'Signed-in session'}${s.userAgent ? ` · ${s.userAgent}` : ''}${s.createdAt ? ` · Started ${new Date(s.createdAt).toLocaleDateString()}` : ''}`) : ['No session details available.'])
    if (account.deletion?.scheduledFor) notice(`Account deletion requested for ${new Date(account.deletion.scheduledFor).toLocaleDateString()}.`)
  } catch { list('sessions', ['Session details are temporarily unavailable. You can still sign out.']) }
}
$('password-toggle').addEventListener('click', () => {
  const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'
  $('password-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password'); $('password-toggle').setAttribute('aria-pressed', String(show))
})
$('google-signin').addEventListener('click', () => void action(async () => {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabasePublishableKey } })
  const settings = response.ok ? await response.json() : null
  if (!settings?.external?.google) { notice('Google sign-in is not available yet. Use email to continue.', true); return }
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo.href } })
  if (error) throw error
}))
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { notice(); setMode(button.dataset.mode) }))
$('auth-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => {
  const email = $('email').value.trim(), password = $('password').value, displayName = $('name').value.trim()
  const problem = passwordProblem(password, mode)
  if (problem) { notice(problem, true); $('password').focus(); return }
  const captchaToken = captchaModes.has(mode) ? captchaFor('captcha') : undefined
  let result
  try {
    if (mode === 'signin') result = await client.auth.signInWithPassword({ email, password, options: { captchaToken } })
    if (mode === 'signup') result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo.href, captchaToken, data: { display_name: displayName, locale: emailLocale() } } })
    if (mode === 'reset') result = await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect.href, captchaToken })
    if (mode === 'update') result = await client.auth.updateUser({ password })
  } finally { resetCaptcha('captcha') }
  if (result.error) { if (result.error.code === 'email_not_confirmed') $('resend').hidden = false; throw result.error }
  $('password').value = ''
  if (mode === 'signup' && !result.data.session) { notice('Check your email to confirm your account, then return here to sign in.'); $('resend').hidden = false }
  else if (mode === 'reset') notice('If an account exists for this email, a reset link is on its way. Open it in this browser.')
  else if (mode === 'update') { recovery = false; history.replaceState(null, '', '/account/'); await render((await client.auth.getSession()).data.session); notice('Password updated.') }
}) })
$('resend').addEventListener('click', () => void action(async () => {
  const email = $('email').value.trim(), captchaToken = captchaFor('captcha')
  let result
  try { result = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo.href, captchaToken } }) } finally { resetCaptcha('captcha') }
  if (result.error) throw result.error; notice('If confirmation is needed, a new email is on its way.')
}))
$('profile-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => { await api('update-profile', { displayName: $('display-name').value.trim(), bio: $('bio').value.trim() }); notice('Profile saved.') }) })
$('logout').addEventListener('click', () => void action(async () => { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw error; notice('Signed out.') }))
$('logout-others').addEventListener('click', () => void action(async () => { await api('sign-out-others'); await render((await client.auth.getSession()).data.session); notice('Other sessions signed out. Existing access tokens may remain valid until they expire.') }))
$('change-password').addEventListener('click', () => void action(async () => {
  const captchaToken = captchaFor('profile-captcha')
  let result
  try { result = await client.auth.resetPasswordForEmail(user.email, { redirectTo: recoveryRedirect.href, captchaToken }) } finally { resetCaptcha('profile-captcha') }
  if (result.error) throw result.error; notice('Check your email for a password reset link. Open it in this browser.')
}))
$('delete-form').addEventListener('submit', event => { event.preventDefault(); if ($('delete-confirm').value !== 'DELETE') return; void action(async () => { await api('request-deletion', { confirmation: 'DELETE' }); $('delete-confirm').value = ''; $('cancel-deletion').hidden = false; notice('Your account deletion request has been recorded.') }) })
client.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') recovery = true; if (['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY', 'USER_UPDATED'].includes(event)) setTimeout(() => { void render(session) }, 0) })
try { const { data, error } = await client.auth.getSession(); if (error) throw error; notice(); await render(data.session); if (new URL(location.href).searchParams.has('error')) notice('This email link is invalid or expired. Request a new link.', true) } catch (error) { $('auth').hidden = false; setMode('signin'); notice(safeError(error), true) }

$('cancel-deletion').addEventListener('click', () => void action(async () => { await api('cancel-deletion'); $('cancel-deletion').hidden = true; notice('Account deletion cancelled.') }))
async function showConsent() {
  try { const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId); if (error) throw error
    if (data.redirect_url) { location.assign(data.redirect_url); return }
    $('consent-client').textContent = (data.client.name || 'This application') + ' wants to access your Codevalanche account.'
    $('consent-scope').textContent = 'Requested access: ' + data.scope
    $('consent').hidden = false
  } catch { notice('This connection request is invalid or expired. Start sign-in again from the app.', true) }
}
for (const decision of ['approve','deny']) $(decision).addEventListener('click', () => void action(async () => {
  const method = decision === 'approve' ? 'approveAuthorization' : 'denyAuthorization'
  const { data, error } = await client.auth.oauth[method](authorizationId, { skipBrowserRedirect: true })
  if (error) throw error
  if (data.redirect_url) location.assign(data.redirect_url)
}))
