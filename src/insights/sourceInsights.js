const operations = { security: 'admin.security.list', notifications: 'admin.notifications.list', audit: 'admin.audit.list' }
const number = value => Number.isFinite(value) ? new Intl.NumberFormat('en').format(value) : 'Unknown'
const node = (tag, text, attributes = {}) => {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = String(text)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}
function table(headers, rows) {
  const result = node('table'), head = node('thead'), body = node('tbody'), line = node('tr')
  for (const label of headers) line.append(node('th', label, { scope: 'col' }))
  head.append(line)
  for (const cells of rows) { const row = node('tr'); for (const cell of cells) row.append(node('td', cell ?? 'Unknown')); body.append(row) }
  result.append(head, body)
  return result
}
function checkedWindow(params) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params?.userId || '') ||
      typeof params.from !== 'string' || typeof params.to !== 'string' ||
      !Number.isFinite(Date.parse(params.from)) || !Number.isFinite(Date.parse(params.to)) ||
      Date.parse(params.from) >= Date.parse(params.to) || Date.parse(params.to) - Date.parse(params.from) > 90 * 86400000) throw new Error('invalid_window')
  new Intl.DateTimeFormat('en', { timeZone: params.timeZone })
  return { userId: params.userId, from: params.from, to: params.to, timeZone: params.timeZone }
}

// The host supplies its existing operator request adapter. No credentials or storage here.
export async function mountSourceInsights({ host, request, params, enabled = false }) {
  let generation = 0, disposed = false, current, data = {}, pages = {}
  host.classList.add('source-insights')
  const clear = () => { host.replaceChildren(); data = {}; pages = {} }
  const controller = {
    async select(next) {
      const turn = ++generation
      clear()
      if (disposed) return
      if (enabled !== true || typeof request !== 'function') {
        host.dataset.state = 'disabled'
        host.append(node('h1', 'Account insights'), node('p', 'Source insights are disabled. The operator must explicitly enable this panel.'))
        return
      }
      try { current = checkedWindow(next) } catch {
        host.dataset.state = 'invalid'
        host.append(node('p', 'Choose an account, a valid timezone and a UTC interval of up to 90 days.', { role: 'alert' }))
        return
      }
      host.dataset.state = 'loading'
      host.append(node('p', 'Reading sources…', { role: 'status' }))
      const selected = current
      const keys = ['summary', ...Object.keys(operations)]
      const results = await Promise.allSettled(keys.map(key => Promise.resolve().then(() => request(
        key === 'summary' ? 'admin.analytics.summary' : operations[key],
        key === 'summary' ? { ...selected, includeSources: true } : { userId: selected.userId, limit: 50 },
      ))))
      if (disposed || turn !== generation) return
      results.forEach((result, index) => {
        const key = keys[index]
        if (result.status === 'fulfilled') {
          if (key === 'summary') data = result.value?.sourceInsights || {}
          else pages[key] = readPage(key, result.value)
        }
      })
      render()
    },
    destroy() { disposed = true; generation++; clear(); host.dataset.state = 'closed' },
  }
  function readPage(key, value) {
    const rows = key === 'security' ? value?.events : value?.items
    if (!Array.isArray(rows) || typeof value.hasMore !== 'boolean' || (value.hasMore && typeof value.nextCursor !== 'string')) return undefined
    return { rows, hasMore: value.hasMore, nextCursor: value.nextCursor }
  }
  function timestamp(value) {
    if (!Number.isFinite(Date.parse(value))) return 'Unknown'
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: current.timeZone }).format(new Date(value))
  }
  function metric(parent, label, key, value) {
    const item = node('div', undefined, { class: 'insight-metric' })
    item.append(node('dt', label), node('dd', number(value), { 'data-metric': key }))
    parent.append(item)
  }
  function section(title, description) {
    const element = node('section')
    element.append(node('h2', title))
    if (description) element.append(node('p', description, { class: 'insight-note' }))
    host.append(element)
    return element
  }
  function render() {
    host.replaceChildren()
    host.dataset.state = data.status === 'ready' ? 'ready' : data.status === 'disabled' ? 'disabled' : 'partial'
    host.append(node('p', 'OPERATOR READOUT', { class: 'insight-eyebrow' }), node('h1', 'Account insights'),
      node('p', `${current.from} → ${current.to} · ${current.timeZone} · start included, end excluded`, { class: 'insight-note' }))
    const refresh = node('button', 'Refresh sources', { type: 'button' })
    refresh.addEventListener('click', () => { void controller.select(current) })
    host.append(refresh)
    if (data.status !== 'ready') host.append(node('p', data.status === 'disabled' ? 'The server source readout is disabled.' : 'Source unavailable. Totals remain unknown.', { role: 'status' }))
    const rawActivity = data.activity || {}
    const activity = rawActivity.status === 'consent_disabled'
      ? { status: 'consent_disabled', actualNativeProducer: rawActivity.actualNativeProducer, days: [], hours: [] }
      : rawActivity
    const security = data.security || {}, alerts = data.notifications || {}
    const activitySection = section('Activity', 'Observed application events and verified receipt outcomes are separate populations. Empty time buckets are unobserved, not zero activity.')
    const activityMetrics = node('dl', undefined, { class: 'insight-metrics' })
    metric(activityMetrics, 'Observed events', 'observedEvents', activity.observedEvents)
    metric(activityMetrics, 'Observed run successes', 'observedRunSuccesses', activity.observedRunSuccesses)
    metric(activityMetrics, 'Verified receipt successes', 'verifiedSuccessfulRuns', activity.verifiedSuccessfulRuns)
    metric(activityMetrics, 'Verified receipt failures', 'verifiedFailedRuns', activity.verifiedFailedRuns)
    metric(activityMetrics, 'Verified receipt cancellations', 'verifiedCancelledRuns', activity.verifiedCancelledRuns)
    activitySection.append(activityMetrics, node('p', `Native producer: ${activity.actualNativeProducer || 'unknown'}. Receipt counts do not certify all native runs.`, { class: 'insight-note' }))
    if (activity.status === 'consent_disabled') activitySection.append(node('p', 'Account analytics consent is disabled. Activity remains unknown.'))
    activitySection.append(node('h3', 'Daily observed activity'), table(['Local day', 'Observed events'], (Array.isArray(activity.days) ? activity.days : []).map(day => [day.day, number(day.observedEvents)])),
      node('h3', 'Hourly observed activity'), table(['Hour in UTC', 'Local hour', 'Observed events'], (Array.isArray(activity.hours) ? activity.hours : []).map(hour => [hour.startUtc, hour.localHour, number(hour.observedEvents)])))
    const securitySection = section('Sign-ins & security', security.coverage?.status === 'qualified' ? 'Current collector coverage qualified; recorded counts are limited to the application store.' : 'Coverage incomplete. Recorded signals are not complete provider totals.')
    const securityMetrics = node('dl', undefined, { class: 'insight-metrics' })
    metric(securityMetrics, 'Recorded successful sign-ins', 'observedLoginSuccesses', security.observedLoginSuccesses)
    metric(securityMetrics, 'Recorded failed sign-ins', 'observedLoginFailures', security.observedLoginFailures)
    metric(securityMetrics, 'Password refusals', 'observedPasswordRefusals', security.observedPasswordRefusals)
    securitySection.append(securityMetrics, node('p', `Last sign-in in interval: ${timestamp(security.lastLogin)} · last activity: ${timestamp(activity.lastMeaningfulActivity)}`),
      node('p', `Security received watermark: ${timestamp(security.watermark)} · activity received watermark: ${timestamp(activity.watermark)}`, { class: 'insight-note' }))
    const alertSection = section('Account alerts', 'Provider account-created and verified events differ. Delivery states describe the current queue state for events in the selected interval.')
    const alertMetrics = node('dl', undefined, { class: 'insight-metrics' })
    for (const [key, label] of [['signupCreated','Accounts created'],['signupVerified','Accounts verified'],['queued','Queued'],['retry','Retry'],['notConfigured','Not configured'],['deadLetter','Failed permanently'],['delivered','Provider accepted']]) metric(alertMetrics, label, key, alerts[key])
    alertSection.append(alertMetrics)
    section('Administrator audit', 'Recorded application audit events; no account action is initiated by this panel.').append(node('p', `Recorded events in interval: ${number(data.audit?.recordedEvents)}`))
    for (const key of Object.keys(operations)) renderFeed(key)
  }
  function renderFeed(key) {
    host.querySelector(`[data-feed="${key}"]`)?.remove()
    const sectionElement = section(`${{security:'Security',notifications:'Notification',audit:'Audit'}[key]} feed`, 'Recent feed across all stored dates. This page is a sample; interval totals above come from full store aggregation.')
    sectionElement.dataset.feed = key
    const page = pages[key]
    if (!page) sectionElement.append(node('p', 'Source unavailable.', { role: 'status' }))
    const columns = key === 'security' ? ['Time','Event','Source','Outcome'] : key === 'notifications' ? ['Queued at','Event','Delivery state'] : ['Time','Action','Recorded outcome']
    const rows = (page?.rows || []).map(row => key === 'security'
      ? [timestamp(row.occurredAt),row.eventName,row.source,row.outcome]
      : key === 'notifications' ? [timestamp(row.created_at),row.event_type,row.state]
        : [timestamp(row.occurred_at),row.action,row.outcome])
    sectionElement.append(table(columns, rows))
    if (page && !rows.length) sectionElement.append(node('p', 'No recorded events in this page.', { class: 'insight-note' }))
    if (page?.hasMore) {
      const more = node('button', 'Load more', { type: 'button', 'data-more': key })
      more.addEventListener('click', async () => {
        const turn = generation
        more.disabled = true
        try {
          const next = readPage(key, await request(operations[key], { userId: current.userId, limit: 50, cursor: page.nextCursor }))
          if (disposed || turn !== generation) return
          if (!next) throw new Error('invalid_page')
          const idKey = key === 'security' ? 'eventId' : 'id'
          const ids = new Set(page.rows.map(row => row[idKey]))
          pages[key] = { ...next, rows: [...page.rows, ...next.rows.filter(row => { const id = row[idKey]; if (ids.has(id)) return false; ids.add(id); return true })] }
          renderFeed(key)
        } catch {
          if (disposed || turn !== generation) return
          more.disabled = false
          sectionElement.append(node('p', 'Next page unavailable. The current page is preserved.', { role: 'status' }))
        }
      })
      sectionElement.append(more)
    }
  }
  await controller.select(params)
  return controller
}
