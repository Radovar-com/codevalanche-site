import { accountCommands, prepareAccountCommand, projectAdminUser, projectAdminOperation, adminError, uuid } from './adminAccountModel.js'

const reads = new Set(['admin.operator.session', 'admin.users.list', 'admin.users.detail', 'admin.operations.get', 'admin.deletion.get'])
const element = (tag, text = '', attributes = {}) => {
  const node = document.createElement(tag); node.textContent = text
  for (const [key, value] of Object.entries(attributes)) if (value !== false && value != null) node.setAttribute(key, value === true ? '' : String(value))
  return node
}
const button = (label, work, disabled = false) => {
  const node = element('button', label, { type: 'button', disabled })
  node.addEventListener('click', () => void work()); return node
}
const field = (form, label, name, value = '', type = 'text') => {
  const wrapper = element('label', label), input = element('input', '', { name, type })
  if (type === 'checkbox') input.checked = value === true; else input.value = String(value)
  wrapper.append(input); form.append(wrapper); return input
}

/** Mount into an existing operator host; request returns existing v2 envelope.data.
 * No credentials, automatic retry, mutation dispatcher or provider qualification. */
export function mountAdminAccounts({ host, request, enabled = false, onInsights, insightsWindow } = {}) {
  if (!host?.replaceChildren) throw new Error('admin_host_required')
  const active = enabled === true && typeof request === 'function'
  let epoch = 0, destroyed = false
  const state = { phase: active ? 'loading' : 'off', busy: false, operator: null, users: [], selected: null, detail: null,
    search: '', nextCursor: null, command: accountCommands[0].action, draft: null, operation: null, error: '' }
  const current = generation => !destroyed && generation === epoch
  const canPrepare = () => state.detail && ['owner', 'accounts_admin'].includes(state.operator?.role) && state.operator.userId !== state.selected && !state.busy
  async function read(action, fields, generation) {
    if (!active || !reads.has(action)) throw new Error('operation_not_available')
    const data = await request(action, fields)
    if (!current(generation)) throw new Error('superseded')
    return data
  }
  async function openInsights() {
    const generation = epoch, userId = state.selected
    try { await onInsights({ userId, from: insightsWindow.from, to: insightsWindow.to, timeZone: insightsWindow.timeZone }) }
    catch { if (current(generation) && state.selected === userId) { state.error = 'Source insights could not be opened. Check the existing host integration.'; render() } }
  }
  function render() {
    if (destroyed) return
    const root = element('section', '', { class: 'ca-admin', 'aria-label': 'Account administration' })
    root.append(element('h1', 'Account administration'), element('p', 'Review recorded cloud policy and account requests. Guest access and local projects are preserved.', { class: 'ca-intro' }))
    if (!active) { root.append(element('p', 'Account administration is off. The operator host must explicitly enable this panel.', { role: 'status', class: 'ca-status' })); host.replaceChildren(root); return }
    const tools = element('div', '', { class: 'ca-tools' })
    tools.append(element('span', state.operator ? `Operator role: ${state.operator.role}` : 'Checking existing operator access…'), button('Reload directory', () => loadDirectory(), state.busy))
    root.append(tools)
    if (state.error) root.append(element('p', state.error, { role: 'alert', class: 'ca-status' }))
    const layout = element('div', '', { class: 'ca-layout' }), directory = element('section', '', { class: 'ca-directory', 'aria-label': 'Account directory' })
    directory.append(element('h2', 'Accounts'))
    const search = element('form', '', { class: 'ca-search' }), searchInput = field(search, 'Search accounts', 'search', state.search)
    searchInput.maxLength = 200
    search.append(element('button', 'Search', { type: 'submit', disabled: state.busy || !state.operator }))
    search.addEventListener('submit', event => { event.preventDefault(); state.search = searchInput.value.trim(); void loadDirectory() })
    directory.append(search)
    const list = element('ul', '', { class: 'ca-users' })
    for (const entry of state.users) {
      const item = element('li'), select = button(entry.user.displayName || entry.user.email || entry.user.id, () => selectAccount(entry.user.id))
      select.setAttribute('aria-pressed', String(entry.user.id === state.selected))
      item.append(select, element('span', entry.user.email, { class: 'ca-secondary' })); list.append(item)
    }
    directory.append(list)
    if (!state.busy && !state.users.length) directory.append(element('p', state.phase === 'ready' ? 'No accounts returned for this search.' : 'Directory unavailable.', { class: 'ca-secondary' }))
    if (state.nextCursor) directory.append(button('Next accounts', () => loadDirectory(state.nextCursor), state.busy))
    directory.append(element('p', 'Directory total is not provided by the service.', { class: 'ca-secondary' }))
    const detail = element('section', '', { class: 'ca-detail', 'data-admin': 'detail', 'aria-label': 'Selected account' })
    if (!state.detail) detail.append(element('h2', state.selected ? 'Opening account…' : 'Choose an account'), element('p', 'Select a recorded account UUID to inspect cloud policy and request status.', { class: 'ca-secondary' }))
    else {
      const account = state.detail
      detail.append(element('h2', account.user.displayName || 'Account'), element('p', account.user.email), element('p', account.user.id, { class: 'ca-id', 'data-admin': 'selected-id' }))
      const facts = element('dl', '', { class: 'ca-facts' })
      for (const [label, value] of [['Recorded cloud policy', account.policy.status], ['Signed-in sessions', account.sessionCount ?? 'Unknown'], ['Remote enabled', account.policy.limits.enabled ? 'Yes' : 'No'], ['Host limit', account.policy.limits.maxHosts], ['Controller limit', account.policy.limits.maxControllers], ['Concurrent run limit', account.policy.limits.maxConcurrentRuns]]) {
        const pair = element('div'); pair.append(element('dt', label), element('dd', String(value))); facts.append(pair)
      }
      detail.append(facts)
      if (typeof onInsights === 'function' && insightsWindow && typeof insightsWindow.from === 'string' && typeof insightsWindow.to === 'string' && typeof insightsWindow.timeZone === 'string') detail.append(button('View source insights', openInsights, state.busy))
      if (account.deletion) {
        detail.append(element('p', `Deletion request: pending. Scheduled time: ${account.deletion.scheduledFor || 'Unknown'}.`))
        if (account.deletion.jobId) detail.append(button('Check deletion status', () => observeRecord({ jobId: account.deletion.jobId, userId: state.selected }), state.busy))
      }
      detail.append(element('h3', 'Prepare an account request'), element('p', 'Submission is unavailable while the existing provider remains unqualified. Preparing a request does not change the account.', { class: 'ca-secondary' }))
      const form = element('form', '', { class: 'ca-command' }), commandLabel = element('label', 'Request'), command = element('select', '', { name: 'action' })
      for (const entry of accountCommands) command.append(element('option', entry.label, { value: entry.action }))
      command.value = state.command; commandLabel.append(command); form.append(commandLabel)
      command.addEventListener('change', () => { state.command = command.value; state.draft = null; render() })
      const deletion = state.command === 'admin.deletion.request'
      const reasonCode = deletion ? null : field(form, 'Reason code', 'reasonCode')
      const reason = deletion ? null : field(form, 'Reason', 'reason')
      if (reasonCode) { reasonCode.maxLength = 64; reason.maxLength = 1000; reasonCode.required = true; reason.required = true }
      const until = state.command === 'admin.account.suspend' ? field(form, 'Suspended until (optional)', 'until', '', 'datetime-local') : null
      const confirmation = deletion ? field(form, 'Type DELETE to prepare', 'confirmation') : null
      let limits
      if (state.command === 'admin.limits.update') {
        limits = { enabled: field(form, 'Remote enabled', 'enabled', account.policy.limits.enabled, 'checkbox') }
        for (const [key, label] of [['maxHosts', 'Host limit'], ['maxControllers', 'Controller limit'], ['maxConcurrentRuns', 'Concurrent run limit']]) {
          limits[key] = field(form, label, key, account.policy.limits[key], 'number'); limits[key].min = '0'; limits[key].required = true
        }
      }
      form.append(element('button', 'Prepare request', { type: 'submit', disabled: !canPrepare() }))
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!canPrepare()) return
        try {
          state.draft = prepareAccountCommand(state.command, { userId: state.selected, operationId: crypto.randomUUID(), reasonCode: reasonCode?.value, reason: reason?.value,
            until: until?.value ? new Date(until.value).toISOString() : null, confirmation: confirmation?.value,
            ...(limits ? { limits: { enabled: limits.enabled.checked, maxHosts: Number(limits.maxHosts.value), maxControllers: Number(limits.maxControllers.value), maxConcurrentRuns: Number(limits.maxConcurrentRuns.value) } } : {}) }, state.operator)
          state.error = ''
        } catch (error) { state.draft = null; state.error = adminError(error) }
        render()
      })
      detail.append(form)
      if (state.draft) {
        const review = element('section', '', { class: 'ca-status', 'data-admin': 'draft' })
        review.append(element('h3', 'Prepared locally. Not submitted.'), element('p', 'Auth outcome is unknown. No account change was sent.'), element('pre', JSON.stringify({ action: state.draft.action, ...state.draft.fields }, null, 2)))
        detail.append(review)
      }
    }
    if (state.operation) {
      const operation = element('section', '', { class: 'ca-status', 'data-admin': 'operation', role: 'status' })
      operation.append(element('h3', 'Account request status'), element('p', state.operation.message))
      if (state.operation.binding) operation.append(button('Refresh status', () => observeRecord(state.operation.binding), state.busy))
      detail.append(operation)
    }
    layout.append(directory, detail); root.append(layout); host.replaceChildren(root)
  }
  async function loadDirectory(cursor) {
    if (!active || destroyed) return
    const generation = ++epoch
    state.busy = true; state.phase = 'loading'; state.error = ''; state.selected = null; state.detail = null; state.draft = null; state.operation = null; state.operator = null; state.users = []; state.nextCursor = null; render()
    try {
      const operator = await read('admin.operator.session', {}, generation)
      if (!['owner', 'accounts_admin', 'support_readonly'].includes(operator?.role) || !uuid(operator.principal?.userId)) throw new Error('response_invalid')
      state.operator = { role: operator.role, userId: operator.principal.userId }
      const page = await read('admin.users.list', { search: state.search, limit: 50, ...(cursor ? { cursor } : {}) }, generation)
      if (!Array.isArray(page?.users) || page.users.length > 100 || typeof page.pagination?.hasMore !== 'boolean' || (page.pagination.nextCursor !== null && !uuid(page.pagination.nextCursor))) throw new Error('response_invalid')
      state.users = page.users.map(entry => projectAdminUser(entry)); state.nextCursor = page.pagination.hasMore ? page.pagination.nextCursor : null; state.phase = 'ready'
    } catch (error) { if (current(generation)) { state.phase = 'unavailable'; state.operator = null; state.error = adminError(error) } }
    finally { if (current(generation)) { state.busy = false; render() } }
  }
  async function selectAccount(userId) {
    if (!active || destroyed || !state.operator) return
    const generation = ++epoch
    state.selected = userId; state.detail = null; state.draft = null; state.operation = null; state.error = ''; state.busy = true; render()
    try {
      if (!uuid(userId)) throw new Error('invalid_fields')
      state.detail = projectAdminUser(await read('admin.users.detail', { userId }, generation), userId)
    } catch (error) { if (current(generation)) state.error = adminError(error) }
    finally { if (current(generation)) { state.busy = false; render() } }
  }
  async function observeRecord(input) {
    if (!active || destroyed || !state.operator || !state.detail) return
    const generation = ++epoch
    const binding = input.jobId ? { jobId: input.jobId, userId: input.userId } : { operationId: input.operationId, userId: input.userId, action: input.action }
    state.busy = true; state.operation = null; render()
    try {
      if (binding.userId !== state.selected || !uuid(binding.jobId || binding.operationId)) throw new Error('invalid_fields')
      const operation = binding.jobId ? 'admin.deletion.get' : 'admin.operations.get'
      const data = await read(operation, binding.jobId ? { jobId: binding.jobId, userId: binding.userId } : { operationId: binding.operationId }, generation)
      state.operation = { ...projectAdminOperation(data, binding), binding }
    } catch (error) { if (current(generation)) state.operation = { phase: 'unknown', authOutcome: 'unknown', message: adminError(error), binding: binding.userId === state.selected && uuid(binding.jobId || binding.operationId) ? binding : null } }
    finally { if (current(generation)) { state.busy = false; render() } }
  }
  render()
  return { ready: active ? loadDirectory() : Promise.resolve(), reload: loadDirectory, select: selectAccount, observeOperation: observeRecord, observeDeletion: observeRecord,
    getSnapshot: () => structuredClone(state), destroy() { destroyed = true; epoch++; state.users = []; state.detail = null; state.operator = null; state.selected = null; state.draft = null; state.operation = null; host.replaceChildren() } }
}
