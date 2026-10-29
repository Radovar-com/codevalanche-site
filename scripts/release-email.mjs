// Owner tool for release announcement emails. Talks only to the
// release-announcements function; it never holds the provider key.
//
//   RELEASE_EMAIL_FUNCTION_URL=https://<project>.supabase.co/functions/v1/release-announcements
//   RELEASE_EMAIL_OPERATOR_TOKEN=<owner token>
//
//   node scripts/release-email.mjs save 1.1.1 [opted_in]   upload content/releases/1.1.1.json as a draft
//   node scripts/release-email.mjs audience 1.1.1          how many readers it would reach now
//   node scripts/release-email.mjs send-test 1.1.1         both variants, only to the owner's test address
//   node scripts/release-email.mjs approve 1.1.1 "SEND 1.1.1"
//   node scripts/release-email.mjs send-batch 1.1.1        mail the next readers (repeat until queued is 0)
//   node scripts/release-email.mjs summary 1.1.1
//   node scripts/release-email.mjs cancel 1.1.1
import { readFile } from 'node:fs/promises'

const [action, version, extra] = process.argv.slice(2)
const url = process.env.RELEASE_EMAIL_FUNCTION_URL, token = process.env.RELEASE_EMAIL_OPERATOR_TOKEN
if (!action || !/^\d+\.\d+\.\d+$/.test(version || '') || !url || !token) {
  console.error('Usage: node scripts/release-email.mjs <save|audience|send-test|approve|send-batch|summary|cancel> <version> [...]; set RELEASE_EMAIL_FUNCTION_URL and RELEASE_EMAIL_OPERATOR_TOKEN')
  process.exit(2)
}
const body = { action, version }
if (action === 'save') {
  body.release = JSON.parse(await readFile(new URL(`../content/releases/${version}.json`, import.meta.url), 'utf8'))
  body.audience = extra === 'opted_in' ? 'opted_in' : 'all_accounts'
}
if (action === 'approve') body.confirmation = extra || ''
const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
console.log(JSON.stringify(await response.json(), null, 2))
process.exit(response.ok ? 0 : 1)
