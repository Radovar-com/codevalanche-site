export const accountCommands = Object.freeze([
  { action: 'admin.account.suspend', label: 'Suspend cloud access' },
  { action: 'admin.account.reactivate', label: 'Restore cloud access' },
  { action: 'admin.limits.update', label: 'Change remote limits' },
  { action: 'admin.deletion.request', label: 'Request account deletion' },
])
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const fail = code => { throw new Error(code) }
const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value : fail('invalid_fields')

/** Local review only. No command dispatcher or provider qualification exists here. */
export function prepareAccountCommand(action, input, operator) {
  if (!['owner', 'accounts_admin'].includes(operator?.role)) fail('administrator_required')
  if (!accountCommands.some(command => command.action === action) || !uuid(input?.userId) || !uuid(input.operationId) || !uuid(operator.userId)) fail('invalid_fields')
  if (input.userId === operator.userId) fail('account_forbidden')
  const fields = { userId: input.userId, operationId: input.operationId }
  if (action === 'admin.deletion.request') {
    if (input.confirmation !== 'DELETE') fail('confirmation_required')
    fields.confirmation = 'DELETE'
  } else {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(input.reasonCode || '')) fail('invalid_fields')
    const reason = text(input.reason, 1000).trim()
    if (!reason) fail('invalid_fields')
    fields.reasonCode = input.reasonCode; fields.reason = reason
    if (action === 'admin.account.suspend') {
      if (input.until !== null && input.until !== undefined && (typeof input.until !== 'string' || !Number.isFinite(Date.parse(input.until)))) fail('invalid_fields')
      fields.until = input.until ?? null
    }
    if (action === 'admin.limits.update') {
      const limits = input.limits
      if (typeof limits?.enabled !== 'boolean' || ['maxHosts', 'maxControllers', 'maxConcurrentRuns'].some(key => !Number.isSafeInteger(limits[key]) || limits[key] < 0)) fail('invalid_fields')
      fields.limits = { enabled: limits.enabled, maxHosts: limits.maxHosts, maxControllers: limits.maxControllers, maxConcurrentRuns: limits.maxConcurrentRuns }
    }
  }
  return { action, fields, submission: 'unavailable', authOutcome: 'unknown', localFilesTouched: false }
}

export function projectAdminUser(data, expectedUserId) {
  const user = data?.user, policy = data?.policy
  if (!uuid(user?.id) || (expectedUserId && user.id !== expectedUserId) || !['active', 'suspended', 'deletion_pending', 'deleted'].includes(policy?.status)) fail('response_invalid')
  if (typeof policy.limits?.enabled !== 'boolean' || ['maxHosts', 'maxControllers', 'maxConcurrentRuns'].some(key => !Number.isSafeInteger(policy.limits[key]) || policy.limits[key] < 0)) fail('response_invalid')
  const displayName = typeof user.displayName === 'string' ? user.displayName.slice(0, 80) : ''
  const email = typeof user.email === 'string' ? user.email.slice(0, 320) : ''
  if (data.deletion != null && (typeof data.deletion !== 'object' || Array.isArray(data.deletion) || data.deletion.status !== 'pending' || typeof data.deletion.scheduledFor !== 'string' || !Number.isFinite(Date.parse(data.deletion.scheduledFor)))) fail('response_invalid')
  if (data.deletion?.jobId != null && !uuid(data.deletion.jobId)) fail('response_invalid')
  return { user: { id: user.id, displayName, email }, policy: { status: policy.status, limits: { enabled: policy.limits.enabled, maxHosts: policy.limits.maxHosts, maxControllers: policy.limits.maxControllers, maxConcurrentRuns: policy.limits.maxConcurrentRuns } },
    deletion: data.deletion ? { jobId: data.deletion.jobId ?? null, scheduledFor: data.deletion.scheduledFor ?? null, status: 'pending' } : null,
    sessionCount: Number.isSafeInteger(data.sessionSummary?.activeCount) ? data.sessionSummary.activeCount : Array.isArray(data.sessions) ? data.sessions.length : null }
}

/** A job record is not a qualified Auth receipt. Completion stays unconfirmed. */
export function projectAdminOperation(data, expected) {
  const deletion = Boolean(expected?.jobId)
  if (!uuid(expected?.userId) || data?.userId !== expected.userId) fail('response_invalid')
  if (deletion) {
    if (!uuid(expected.jobId) || data.jobId !== expected.jobId || !['queued', 'purging', 'completed', 'cancelled', 'failed'].includes(data.state)) fail('response_invalid')
  } else if (!uuid(expected.operationId) || data.operationId !== expected.operationId || data.action !== expected.action || !accountCommands.some(command => command.action === expected.action) || !['pending', 'completed', 'failed'].includes(data.state)) fail('response_invalid')
  const phase = ['pending', 'queued', 'purging'].includes(data.state) ? 'pending' : data.state === 'failed' ? 'rejected' : 'unknown'
  return { phase, recordState: data.state, authOutcome: 'unknown', message: `Operation record: ${data.state}. Auth outcome remains unconfirmed. Local projects are preserved.` }
}

export function adminError(error) {
  const code = error?.code || error?.message
  const messages = {
    administrator_required: 'This operator cannot prepare account changes. Read-only access remains separate.',
    account_forbidden: 'This account request was refused. Select a permitted target account.',
    confirmation_required: 'Type DELETE to prepare this account deletion request.',
    invalid_fields: 'Check the account UUID and required request fields.',
    response_invalid: 'The account response could not be verified. Reload the current account.',
    reauthentication_required: 'Verify your existing operator session in the host before continuing.',
    mfa_required: 'Verify your existing operator session in the host before continuing.',
    operation_conflict: 'The request was refused because another account operation is pending.',
  }
  return Object.hasOwn(messages, code) ? messages[code] : 'The account service is unavailable. The operation outcome remains unconfirmed. Refresh only reads the current record.'
}
