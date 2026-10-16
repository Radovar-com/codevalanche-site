import { createClient } from '@supabase/supabase-js'
import { safeError, identityLabels, authCallback, normalizeAccountError, normalizeAccountProfile } from './helpers.js'
import { createAccountSessionLifecycle, accountAuthFetch } from './sessionLifecycle.js'
import { createAccountSecurity } from './security.js'
import { recoveryCallback, exchangeRecovery, validateNewPassword, recoveryNotice } from './recovery.js'
import { createAccountCaptcha } from './captcha.js'
import { createAccountAnalytics } from './analytics.js'
import { initializeLocale, localizeDocument } from '../locales/runtime.js'
const localeState = await initializeLocale(document)
localizeDocument(document, localeState.catalog, localeState.locale)
const t = localeState.translate
const $ = (id) => document.getElementById(id)
const config = window.CODEVALANCHE_CONFIG
const accountAnalytics = createAccountAnalytics({ config: window.CODEVALANCHE_ANALYTICS })
const captcha = createAccountCaptcha({ siteKey: config.captchaSiteKey, container: $('captcha') })
const storageKey = `sb-${new URL(config.supabaseUrl).hostname.split('.')[0]}-auth-token`
const lifecycle = createAccountSessionLifecycle(storageKey)
const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey, lock: lifecycle.lock }, global: { fetch: accountAuthFetch } })
const redirectTo = authCallback(location.href)
const authorizationId = redirectTo.searchParams.get('authorization_id')
// Social sign-in returns to /account/?authorization_id. Give that preserved
// connection context the same explicit reauthentication action as /authorize/.
if (authorizationId && !$('operator-reauth')) {
  const button = document.createElement('button'); button.id = 'operator-reauth'; button.type = 'button'; button.className = 'cr-btn cr-btn-primary'; button.hidden = true; button.textContent = t('Sign in again')
  $('account-state-logout').before(button)
}
const recoveryRedirect = new URL(redirectTo); recoveryRedirect.searchParams.set('flow', 'recovery')
let mode = 'signin', user = null, recovery = new URL(location.href).searchParams.get('flow') === 'recovery', busy = false
let accountStatus = 'signed-out', renderGeneration = 0, currentSession = null, operatorConsent = false
let cleanupPromise = null, cleanupPending = false, ownedSignin = false
const security = createAccountSecurity(client, { isRecovery: () => recovery, assertRemoval: () => apiV2('security.mfa.remove-authorize') })
function notice(message = '', error = false) { $('status').textContent = t(message); $('status').dataset.error = String(error) }
function noticeTranslated(message = '', error = false) { $('status').textContent = message; $('status').dataset.error = String(error) }
function applyControls() {
  [...document.querySelectorAll('button')].filter(button => !button.closest('[data-owned-consent]')).forEach(button => { button.disabled = busy || cleanupPending })
  document.querySelectorAll('#profile input, #profile textarea, #profile button').forEach(control => { control.disabled = busy || accountStatus !== 'ready' })
  $('account-state-retry').disabled = busy || cleanupPending || accountStatus === 'loading'
  if ($('mfa-enroll')) $('mfa-enroll').disabled = busy || cleanupPending || accountStatus !== 'ready'
  if ($('mfa-remove')) $('mfa-remove').disabled = busy || cleanupPending || accountStatus !== 'ready'
  if (mode === 'update') $('auth-submit').disabled = busy || cleanupPending || accountStatus !== 'ready'
}
function setAccountStatus(next) {
  if (next !== 'ready') accountAnalytics.suspend()
  accountStatus = next
  const gated = ['loading', 'suspended', 'deletion-pending', 'unavailable', 'signing-out', 'logout-failed'].includes(next)
  $('auth').hidden = (gated && next !== 'logout-failed') || (Boolean(user) && !recovery) || (recovery && user && next !== 'ready')
  $('profile').hidden = next !== 'ready' || Boolean(authorizationId) || recovery
  $('account-state').hidden = !gated
  $('consent').hidden = true
  if ($('mfa-section')) $('mfa-section').hidden = !user || recovery || !['ready', 'deletion-pending'].includes(next)
  if ($('account-state-cancel')) $('account-state-cancel').hidden = next !== 'deletion-pending'
  if ($('operator-reauth')) $('operator-reauth').hidden = true
  $('stage').classList.toggle('signed-in', Boolean(user) && !recovery)
  const content = next === 'signing-out' ? ['Signing out', 'Finishing local session cleanup…']
    : next === 'logout-failed' ? ['Sign-out incomplete', 'Your account view is closed. Try again to finish signing out, or sign in explicitly.']
      : next === 'suspended' ? ['Account suspended', 'Your account access is blocked. Contact support. You can still sign out.']
      : next === 'deletion-pending' ? ['Account deletion pending', 'Sign in again and verify any enrolled authenticator to cancel before deletion starts. Local projects are preserved.']
    : next === 'loading' ? ['Opening your account', 'Checking account access…']
      : ['Account temporarily unavailable', 'Your saved session is preserved. Try again or sign out.']
  $('account-state-title').textContent = t(content[0]); $('account-state-description').textContent = t(content[1])
  applyControls()
}
function invalidateAccountView() {
  security.clear()
  renderGeneration++
  currentSession = null; user = null
  setAccountStatus('signed-out'); setMode('signin')
}
function handleAccountRefusal(error) {
  if (error?.code === 'account_request_superseded') return
  if (error?.code === 'session_not_found') {
    void cleanUpLocalSession().catch(() => undefined)
  } else if (error?.code === 'account_suspended') setAccountStatus('suspended')
  else if (error?.code === 'account_deletion_pending') setAccountStatus('deletion-pending')
  else if (['account_service_unavailable', 'account_forbidden', 'account_operation_unknown', 'operation_conflict'].includes(error?.code)) setAccountStatus('unavailable')
}
function cleanUpLocalSession() {
  if (cleanupPromise) return cleanupPromise
  lifecycle.setLogoutIntent('pending')
  invalidateAccountView()
  cleanupPending = true; setAccountStatus('signing-out')
  let complete = false
  const operation = Promise.resolve().then(async () => {
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
    complete = true; lifecycle.setLogoutIntent('complete')
  }).finally(() => {
    cleanupPromise = null; cleanupPending = false
    setAccountStatus(complete ? 'signed-out' : 'logout-failed')
    if (!complete) notice('Sign-out could not be completed. Your account view stays closed. Try again.', true)
  })
  cleanupPromise = operation
  return operation
}
function sdkSessionError(error) {
  const definitive = ['invalid_grant', 'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'invalid_refresh_token']
  if (error?.status === 401 || definitive.includes(error?.code)) return { code: 'session_not_found' }
  if (error?.code === 'user_banned') return { code: 'account_suspended' }
  return { code: 'account_service_unavailable' }
}
async function readCurrentSession() {
  const generation = renderGeneration
  if (lifecycle.logoutIntent()) { invalidateAccountView(); setAccountStatus(lifecycle.logoutIntent() === 'pending' ? 'logout-failed' : 'signed-out'); return }
  setAccountStatus('loading')
  const { data, error } = await client.auth.getSession()
  if (generation !== renderGeneration) return
  if (error) { const refusal = sdkSessionError(error); handleAccountRefusal(refusal); notice(safeError(refusal), true); return }
  await render(data.session)
}
async function completeExplicitSignin(work, unprotected = false) {
  if (cleanupPromise) await cleanupPromise
  ownedSignin = true
  try {
    const result = await (unprotected ? lifecycle.writeUnprotectedSdkSession(work) : work())
    if (result.error) throw result.error
    if (result.data?.session) { lifecycle.setLogoutIntent(null); await render(result.data.session) }
    return result
  } finally { ownedSignin = false }
}
function setMode(next) {
  mode = next
  const reset = next === 'reset', signup = next === 'signup', update = next === 'update'
  $('auth-title').textContent = t(reset ? 'Reset password' : signup ? 'Create your account' : update ? 'Choose a new password' : 'Sign in')
  $('auth-submit').textContent = t(reset ? 'Send reset link' : signup ? 'Create account' : update ? 'Save password' : 'Sign in')
  $('auth-description').textContent = t(reset ? 'We’ll email you a link to choose a new password.' : signup ? 'Your Codevalanche account.' : update ? 'Choose a password with at least 15 characters.' : 'Welcome back to Codevalanche.')
  $('social-auth').hidden = reset || update
  $('forgot-row').hidden = next !== 'signin'; $('signup-prompt').hidden = next !== 'signin'
  $('password').type = 'password'; $('password-toggle').setAttribute('aria-label', t('Show password')); $('password-toggle').setAttribute('aria-pressed', 'false')
  $('name-field').hidden = !signup; $('email-field').hidden = update; $('email').required = !update
  $('password-field').hidden = reset; $('password').required = !reset; $('password').autocomplete = signup || update ? 'new-password' : 'current-password'
  $('password').minLength = signup || update ? 15 : 1
  document.querySelectorAll('[data-mode]').forEach(button => button.hidden = update || (next === 'signin' ? button.dataset.mode === 'signin' : button.dataset.mode !== 'signin'))
  $('resend').hidden = true; $('password').value = ''
}
async function api(action, data = {}) {
  const generation = renderGeneration, expected = currentSession
  if (action !== 'get-account' && accountStatus !== 'ready' && !(action === 'cancel-deletion' && accountStatus === 'deletion-pending')) throw { code: user ? 'account_service_unavailable' : 'session_not_found' }
  const { data: { session }, error } = await client.auth.getSession()
  if (generation !== renderGeneration) throw { code: 'account_request_superseded' }
  if (error) throw { code: error.status === 401 ? 'session_not_found' : 'account_service_unavailable' }
  if (!session) throw { code: 'session_not_found' }
  if (!expected || session.user?.id !== expected.user?.id || session.access_token !== expected.access_token) throw { code: 'account_request_superseded' }
  let response
  try { response = await fetch(`${config.supabaseUrl}/functions/v1/codevalanche-account`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(8000) }) }
  catch { if (generation !== renderGeneration) throw { code: 'account_request_superseded' }; throw { code: 'account_service_unavailable' } }
  const result = await response.json().catch(() => ({}))
  if (generation !== renderGeneration) throw { code: 'account_request_superseded' }
  if (!response.ok) throw normalizeAccountError(result, response.status)
  if (action === 'get-account' && (!result.user || !Array.isArray(result.sessions))) throw { code: 'account_service_unavailable' }
  if (action === 'get-account' && [result.id, result.userId, result.sub, result.user.id].some(id => id !== undefined && id !== session.user.id)) throw { code: 'account_service_unavailable' }
  return result
}
async function apiV2(operation, fields = {}) {
  const result = await api(operation, { apiVersion: 2, requestId: crypto.randomUUID(), ...fields })
  if (result.apiVersion !== 2 || result.ok !== true) throw { code: 'account_service_unavailable' }
  return result.data
}
async function action(work) {
  if (busy || cleanupPending) return
  busy = true; [...document.querySelectorAll('button')].filter(button => !button.closest('[data-owned-consent]')).forEach(b => b.disabled = true); notice()
  try { await work() } catch (error) { if (error?.code !== 'account_request_superseded') { handleAccountRefusal(error); notice(safeError(error), true) } }
  finally { busy = false; applyControls() }
}
function list(id, values) { $(id).replaceChildren(...values.map(value => { const li = document.createElement('li'); li.textContent = value; return li })) }
async function render(session) {
  if (currentSession?.user?.id !== session?.user?.id) { security.clear(); if ($('mfa-secret')) { $('mfa-secret').textContent = ''; $('mfa-challenge').hidden = true } }
  const generation = ++renderGeneration
  currentSession = session || null
  user = session?.user || null
  setAccountStatus(user ? 'loading' : 'signed-out')
  if (!user) { setMode('signin'); return }
  try {
    const account = await api('get-account')
    if (generation !== renderGeneration || !user || user.id !== session.user.id) return
    setAccountStatus('ready')
    if (account.policy?.status === 'deletion_pending' && !recovery) { setAccountStatus('deletion-pending'); return }
    if (authorizationId && !recovery) { await showConsent(generation); return }
    if (recovery) { setMode('update'); return }
    $('profile-email').textContent = user.email || ''
    list('methods', identityLabels(user.identities))
    $('display-name').value = account.user?.displayName || ''; $('bio').value = account.user?.bio || ''; $('cancel-deletion').hidden = !account.deletion
    if ($('analytics-consent')) $('analytics-consent').checked = account.analyticsConsent === true
    void accountAnalytics.update({ session, account })
    list('sessions', account.sessions?.length ? account.sessions.map(s => `${s.current ? 'This session' : s.label || 'Signed-in session'}${s.userAgent ? ` · ${s.userAgent}` : ''}${s.createdAt ? ` · Started ${new Date(s.createdAt).toLocaleDateString()}` : ''}`) : ['No session details available.'])
    if (account.deletion?.scheduledFor) {
      const date = new Intl.DateTimeFormat(localeState.locale.tag).format(new Date(account.deletion.scheduledFor))
      noticeTranslated(t('Account deletion requested for {date}.', { date }))
    }
  } catch (error) {
    if (generation !== renderGeneration) return
    if (error?.code === 'account_request_superseded') { void readCurrentSession(); return }
    handleAccountRefusal(error)
    if (user && accountStatus === 'loading') setAccountStatus('unavailable')
    notice(safeError(error), true)
  }
}
$('password-toggle').addEventListener('click', () => {
  const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'
  $('password-toggle').setAttribute('aria-label', t(show ? 'Hide password' : 'Show password')); $('password-toggle').setAttribute('aria-pressed', String(show))
})
$('google-signin').addEventListener('click', () => void action(async () => {
  const response = await accountAuthFetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabasePublishableKey } })
  const settings = response.ok ? await response.json() : null
  if (!settings?.external?.google) { notice('Google sign-in is not available yet. Use email to continue.', true); return }
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo.href } })
  if (error) throw error
}))
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { notice(); setMode(button.dataset.mode); if (!user) window.CodevalancheAnalytics?.track(mode === 'signup' ? 'signup_started' : mode === 'reset' ? 'password_reset_requested_ui' : 'login_started', mode === 'reset' ? {entry_point:'password_reset'} : {entry_point:mode === 'signup' ? 'signup' : 'signin',provider_kind:'email'}) }))
$('auth-form').addEventListener('submit', event => { if (!user && ['signin','signup'].includes(mode)) window.CodevalancheAnalytics?.track(mode === 'signup' ? 'signup_form_submitted' : 'login_form_submitted', {provider_kind:'email'}); event.preventDefault(); void action(async () => {
  const email = $('email').value.trim(), password = $('password').value
  const authIntentGeneration = renderGeneration
  const captchaToken = mode === 'update' ? undefined : await captcha.challenge()
  if (authIntentGeneration !== renderGeneration) throw { code: 'account_request_superseded' }
  let result
  if (mode === 'update' && accountStatus !== 'ready') return
  if (mode === 'signin') result = await completeExplicitSignin(() => client.auth.signInWithPassword({ email, password, options: { captchaToken } }), true)
  if (mode === 'signup') { validateNewPassword(password); normalizeAccountProfile({ displayName: $('name').value.trim() }); result = await completeExplicitSignin(() => client.auth.signUp({ email, password, options: { captchaToken, emailRedirectTo: redirectTo.href, data: { display_name: $('name').value.trim() } } }), true) }
  if (mode === 'reset') result = await client.auth.resetPasswordForEmail(email, { captchaToken, redirectTo: recoveryRedirect.href })
  if (mode === 'update') { validateNewPassword(password); result = await client.auth.updateUser({ password }) }
  if (result.error) { if (result.error.code === 'email_not_confirmed') $('resend').hidden = false; throw result.error }
  $('password').value = ''
  if (mode === 'signup' && !result.data.session) { notice('Check your email to confirm your account, then return here to sign in.'); $('resend').hidden = false }
  else if (mode === 'reset') notice(recoveryNotice())
  else if (mode === 'update') { recovery = false; history.replaceState(null, '', redirectTo.pathname + redirectTo.search); await cleanUpLocalSession(); notice('Password updated. Sign in again to continue.') }
}) })
$('resend').addEventListener('click', () => void action(async () => { const { error } = await client.auth.resend({ type: 'signup', email: $('email').value.trim(), options: { emailRedirectTo: redirectTo.href } }); if (error) throw error; notice('If confirmation is needed, a new email is on its way.') }))
$('profile-form').addEventListener('focusin', () => { accountAnalytics.startProfileEdit() })
$('profile-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => { const requestId = crypto.randomUUID(); const changes = normalizeAccountProfile({ displayName: $('display-name').value.trim(), bio: $('bio').value.trim() }); accountAnalytics.track('profile_save_submitted', { operation_id: requestId }); await apiV2('profile.update', { requestId, ...changes }); notice('Profile saved.') }) })
// Logout immediately fences the optional queue and receipt. It must not wait
// for a collector; logout-click analytics therefore stays explicitly unmeasured.
async function signOut() { await cleanUpLocalSession(); notice('Signed out.') }
$('logout').addEventListener('click', () => void action(signOut))
$('account-state-logout').addEventListener('click', () => void action(signOut))
$('operator-reauth')?.addEventListener('click', () => void action(async () => {
  // Explicit local cleanup preserves authorization_id and the existing
  // credential-lock/logout fences. The next sign-in is user initiated.
  await cleanUpLocalSession(); setMode('signin')
  notice('Sign in again with the same account, then verify your authenticator to continue connecting Company OS.')
  $('email').focus()
}))
$('account-state-retry').addEventListener('click', () => void action(async () => { if (lifecycle.logoutIntent() === 'pending') await cleanUpLocalSession(); else await readCurrentSession() }))
$('logout-others').addEventListener('click', () => void action(async () => { await api('sign-out-others'); await render((await client.auth.getSession()).data.session); notice('Other sessions signed out. Existing access tokens may remain valid until they expire.') }))
$('change-password').addEventListener('click', () => void action(async () => {
  const generation = renderGeneration
  let result
  try { result = await client.auth.resetPasswordForEmail(user.email, { redirectTo: recoveryRedirect.href }) }
  catch (error) { if (generation !== renderGeneration) throw { code: 'account_request_superseded' }; throw error }
  if (generation !== renderGeneration) throw { code: 'account_request_superseded' }
  if (result.error) throw result.error
  notice(recoveryNotice())
}))
$('delete-form').addEventListener('submit', event => { event.preventDefault(); if ($('delete-confirm').value !== 'DELETE') return; void action(async () => {
  let result
  try { result = await api('request-deletion', { confirmation: 'DELETE' }) }
  catch (error) { if (error?.code === 'account_service_unavailable') throw { code: 'account_operation_unknown' }; throw error }
  if (result.ok !== true || typeof result.jobId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.jobId)
    || !['queued', 'purging'].includes(result.state) || !Number.isFinite(Date.parse(result.dueAt)) || result.deletion?.status !== 'pending') throw { code: 'account_operation_unknown' }
  $('delete-confirm').value = ''
  setAccountStatus('deletion-pending')
  notice('Your account deletion request is pending. Local projects are preserved.')
}) })
window.addEventListener('storage', () => {
  if (!cleanupPending && lifecycle.logoutIntent()) void readCurrentSession()
})
client.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && ownedSignin) recovery = true
  if (['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) {
    if (ownedSignin || cleanupPending) return
    if (lifecycle.logoutIntent()) { void readCurrentSession(); return }
    const generation = ++renderGeneration
    $('profile').hidden = true; $('consent').hidden = true
    setAccountStatus('loading')
    setTimeout(() => { if (generation === renderGeneration) void readCurrentSession() }, 0)
  }
})
const initialGeneration = renderGeneration
try {
  const callbackUrl = new URL(location.href)
  if (callbackUrl.searchParams.has('token_hash')) {
    const callback = recoveryCallback(location.href, { allowLoopback: true })
    recovery = true
    history.replaceState(null, '', callback.cleanUrl)
    await completeExplicitSignin(async () => ({ data: await exchangeRecovery(client, callback.tokenHash), error: null }), true)
  }
  const callbackCode = new URL(location.href).searchParams.get('code')
  if (callbackCode) {
    await completeExplicitSignin(() => client.auth.exchangeCodeForSession(callbackCode))
    const completedCallback = new URL(redirectTo)
    if (recovery) completedCallback.searchParams.set('flow', 'recovery')
    history.replaceState(null, '', completedCallback.pathname + completedCallback.search)
  }
  else if (initialGeneration === renderGeneration) { notice(); await readCurrentSession() }
  if (new URL(location.href).searchParams.has('error')) notice('This email link is invalid or expired. Request a new link.', true)
} catch (error) { if (initialGeneration === renderGeneration) { if(error?.code==='recovery_invalid_or_expired'){setAccountStatus('signed-out');notice(safeError(error),true)}else{handleAccountRefusal(sdkSessionError(error)); notice(safeError(sdkSessionError(error)), true)} } }

async function cancelAccountDeletion() {
  const expected = currentSession
  let result
  try { result = await api('cancel-deletion') }
  catch (error) { if (error?.code === 'account_service_unavailable') throw { code: 'account_operation_unknown' }; throw error }
  if (result.ok !== true || result.state !== 'cancelled') throw { code: 'account_operation_unknown' }
  await readCurrentSession()
  if (!currentSession || currentSession.user?.id !== expected?.user?.id || currentSession.access_token !== expected?.access_token) throw { code: 'account_request_superseded' }
  if (accountStatus === 'ready') notice('Account deletion cancelled. Earlier remote approvals stay withdrawn.')
}
$('cancel-deletion').addEventListener('click', () => void action(cancelAccountDeletion))
async function showConsent(generation) {
  try {
    // Operator autoapproval must be observed server-side under the verified
    // primary session before any provider SDK call can return a code redirect.
    const prepared = await apiV2('operator.oauth.details', { authorizationId })
    if (generation !== renderGeneration || accountStatus !== 'ready') return
    operatorConsent = prepared.operator === true
    if (prepared.parentMfaRequired === true) {
      $('consent').hidden = true
      notice('Verify your authenticator here before connecting Company OS. If you have not added one yet, choose Add authenticator.')
      return
    }
    let data = prepared
    if (!operatorConsent) { const result = await client.auth.oauth.getAuthorizationDetails(authorizationId); if (result.error) throw result.error; data = result.data }
    if (generation !== renderGeneration || accountStatus !== 'ready') return
    if (data.redirect_url) { location.assign(data.redirect_url); return }
    $('consent-client').textContent = t('{client} wants to access your Codevalanche account.', { client: data.client.name || 'This application' })
    $('consent-scope').textContent = t('Requested access: {scope}', { scope: data.scope })
    $('consent').hidden = false
  } catch (error) { if (generation === renderGeneration && accountStatus === 'ready') {
    if (error?.code === 'reauthentication_required') {
      setAccountStatus('unavailable')
      if ($('operator-reauth')) { $('operator-reauth').hidden = false; $('account-state-title').textContent = t('Sign in again to connect Company OS'); $('account-state-description').textContent = t('Your security settings changed. Sign in again with the same account, then verify your authenticator. This connection request will be kept.') }
      notice('Sign in again with the same account to approve this connection after the security change.', true)
    }
    else notice('This connection request is invalid or expired. Start sign-in again from the app.', true)
  } }
}
for (const decision of ['approve','deny']) $(decision).addEventListener('click', () => void action(async () => {
  if (decision === 'approve' && accountStatus !== 'ready') return
  const generation = renderGeneration
  if (decision === 'approve') await api('get-account')
  if (generation !== renderGeneration) throw { code: 'account_request_superseded' }
  const method = decision === 'approve' ? 'approveAuthorization' : 'denyAuthorization'
  const { data, error } = decision === 'approve' && operatorConsent
    ? { data: await apiV2('operator.oauth.approve', { authorizationId }), error: null }
    : await client.auth.oauth[method](authorizationId, { skipBrowserRedirect: true })
  if (generation !== renderGeneration) throw { code: 'account_request_superseded' }
  if (error) throw error
  if (data.parentMfaRequired === true) { await showConsent(generation); return }
  if (data.redirect_url) location.assign(data.redirect_url)
}))

$('mfa-enroll')?.addEventListener('click', () => void action(async () => {
  const factor = await security.enroll()
  $('mfa-secret').textContent = factor.totp?.secret || ''
  $('mfa-challenge').hidden = false; $('mfa-factor-id').value = factor.id
  notice('Add this secret to your authenticator, then enter its six digit code.')
}))
$('mfa-step-up')?.addEventListener('click', () => void action(async () => {
  const factors = await security.factors()
  if (!factors.length) { notice('Add an authenticator first.', true); return }
  $('mfa-factor-id').value = factors[0].id; $('mfa-challenge').hidden = false; $('mfa-secret').textContent = ''
}))
$('mfa-form')?.addEventListener('submit', event => { event.preventDefault(); void action(async () => {
  await security.verify($('mfa-code').value, $('mfa-factor-id').value)
  $('mfa-code').value = ''; $('mfa-secret').textContent = ''; $('mfa-challenge').hidden = true
  const needsFreshVerification=security.state().requiresFreshVerification
  await readCurrentSession()
  if (authorizationId && accountStatus !== 'ready') return
  notice(needsFreshVerification?'Authenticator verified and added. Verify again with a new code before sensitive access.':'Authenticator verified. Sensitive operations still verify your current account access.')
}) })
$('mfa-cancel')?.addEventListener('click', () => void action(async () => { await security.cancel(); $('mfa-secret').textContent = ''; $('mfa-code').value = ''; $('mfa-challenge').hidden = true }))
$('mfa-remove')?.addEventListener('click', () => void action(async () => { const factors = await security.factors(); if (!factors.length) { notice('No verified authenticator is enrolled.'); return }; await security.remove(factors[0].id); notice('Authenticator removed. Earlier remote approvals have been withdrawn.'); await readCurrentSession() }))
$('analytics-save')?.addEventListener('click', () => void action(async () => { accountAnalytics.suspend(); const result = await apiV2('analytics.consent', { analytics: $('analytics-consent').checked }); void accountAnalytics.update({ session: currentSession, account: result }); notice(result.analyticsConsent ? 'Account activity analytics accepted.' : 'Account activity analytics stopped. Queued events from earlier consent are refused.'); }))
$('activity-load')?.addEventListener('click', () => void action(async () => { const result = await apiV2('security.activity', { limit: 20 }); list('security-activity', result.events.map(e => `${new Intl.DateTimeFormat(localeState.locale.tag, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e.occurredAt))} · ${e.eventName} · ${e.outcome} · ${e.source}`)); $('activity-coverage').textContent = t(result.coverage.status === 'qualified' ? 'Configured sources are current.' : 'Some provider sources are missing or delayed. An empty list does not establish zero attempts.') }))
$('account-state-cancel')?.addEventListener('click', () => void action(cancelAccountDeletion))
