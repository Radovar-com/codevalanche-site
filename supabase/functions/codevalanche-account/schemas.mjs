// Request schemas for every action of the codevalanche-account edge function.
// The handler authenticates the caller, then runs validateAccountRequest before
// any action, so a body with the wrong shape is answered without touching the
// account tables or the Auth admin API.
//
// Compatibility rules (installed desktop clients, website):
// - fields a schema does not name are ignored, never rejected (clients send
//   extras such as apiVersion/requestId);
// - an action without a schema here is left to the handler, which answers it
//   with "Unknown action" exactly as before; a new action must add its schema
//   (tests/validation pins that every handler case has one);
// - the error text and status match what the handler already answered for the
//   same mistake, so callers see no new error vocabulary.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// C0/C1 control characters except tab, line feed and carriage return.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
const CONTROL_OR_NEWLINE = /[\u0000-\u001f\u007f-\u009f]/

const text = ({ max, singleLine = false, optional = false, nonEmpty = false }) => (value) => {
  if (value === undefined) return optional
  if (typeof value !== 'string' || value.length > max) return false
  if ((singleLine ? CONTROL_OR_NEWLINE : CONTROL).test(value)) return false
  return !nonEmpty || value.trim().length > 0
}
const oneOf = (values, { optional = false } = {}) => (value) => value === undefined ? optional : values.includes(value)
const uuid = ({ optional = false } = {}) => (value) => value === undefined ? optional : typeof value === 'string' && UUID.test(value)
const bool = ({ optional = false } = {}) => (value) => value === undefined ? optional : typeof value === 'boolean'
const integer = (min, max, { optional = false } = {}) => (value) => value === undefined ? optional : Number.isInteger(value) && value >= min && value <= max

const none = {}

export const ACCOUNT_REQUEST_SCHEMAS = Object.freeze({
  'get-account': { fields: none },
  'update-profile': { status: 400, error: 'Invalid profile', fields: { displayName: text({ max: 80, singleLine: true, optional: true }), bio: text({ max: 500, optional: true }) } },
  'sign-out-current': { fields: none },
  'sign-out-others': { fields: none },
  // Shape only; ownership is still decided by the handler.
  'revoke-session': { status: 404, error: 'Session not found', fields: { sessionId: uuid() } },
  'request-deletion': { status: 400, error: 'Type DELETE to confirm', fields: { confirmation: text({ max: 32, singleLine: true, optional: true }) } },
  'cancel-deletion': { fields: none },
  consent: { status: 400, error: 'Invalid consent', fields: { analytics: bool() } },
  feedback: { status: 400, error: 'Invalid feedback', fields: { category: oneOf(['bug', 'idea', 'general']), message: text({ max: 4000, nonEmpty: true }) } },
  // consent:false keeps its own 403 answer in the handler.
  event: { status: 400, error: 'Invalid event', fields: { eventId: uuid(), eventName: oneOf(['website_view', 'download_clicked', 'app_opened']), platform: oneOf(['web', 'windows', 'macos', 'linux', 'ios', 'android']), consent: bool({ optional: true }) } },
  'admin-list-users': { status: 400, error: 'Invalid page', fields: { page: integer(1, 10000, { optional: true }) } },
  'admin-block-user': { status: 400, error: 'Invalid target user', fields: { userId: uuid() } },
  'admin-unblock-user': { status: 400, error: 'Invalid target user', fields: { userId: uuid() } },
  'admin-feedback': { fields: none },
  'admin-analytics': { fields: none },
})

/**
 * @returns {null | {status:number, error:string}} null when the request may
 * proceed to the handler.
 */
export function validateAccountRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, error: 'Invalid body' }
  const action = body.action
  if (action === undefined) return null // the handler answers "Unknown action"
  if (typeof action !== 'string' || action.length > 64) return { status: 400, error: 'Unknown action' }
  if (!Object.hasOwn(ACCOUNT_REQUEST_SCHEMAS, action)) return null
  const schema = ACCOUNT_REQUEST_SCHEMAS[action]
  for (const [name, check] of Object.entries(schema.fields)) {
    if (!check(body[name])) return { status: schema.status ?? 400, error: schema.error ?? 'Invalid request' }
  }
  return null
}
