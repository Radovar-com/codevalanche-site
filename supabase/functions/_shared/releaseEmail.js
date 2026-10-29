// Release announcement email ("what's new in <version>").
// One pure renderer used by the preview script, the tests and the
// release-announcements function, so what the owner approves is what is sent.
//
// Content comes from the English copy in content/releases/<version>.json (the
// same notes as the changelog page). Owner decision 2026-10-29: these emails
// are English only, for every reader. Only the email's own frame text lives
// here. Light and dark mode: prefers-color-scheme for Apple Mail and most
// apps, [data-ogsc] for Outlook's dark mode.

export const SITE = 'https://codevalanche.com'
export const DOWNLOAD_URL = `${SITE}/download/`
export const CHANGELOG_URL = `${SITE}/changelog.html`
export const PRIVACY_URL = `${SITE}/privacy.html`
export const UNSUBSCRIBE_PAGE_URL = `${SITE}/unsubscribe/`
export const EMAIL_LOGO_URL = `${SITE}/assets/codevalanche-email-logo.png`
export const EMAIL_LOGO_DARK_URL = `${SITE}/assets/codevalanche-email-logo-dark.png`
// Sections shown in the email; the rest stay on the changelog page.
export const MAX_SECTIONS = 4
// A reader whose last sign-in is older than this gets the "come back" version.
export const INACTIVE_AFTER_DAYS = 30

export const FRAME = {
  en: {
    subject: (version, headline) => `Codevalanche ${version}: ${headline}`,
    eyebrow: (version) => `New in Codevalanche ${version}`,
    welcomeBack: 'It has been a while. Here is what changed since you last opened Codevalanche, and why it is worth another look.',
    download: (version) => `Download ${version}`,
    comeBack: (version) => `Try ${version} now`,
    alreadyInstalled: 'Already have Codevalanche? Open it and it updates itself. You can also check from Settings, About, Check for updates.',
    allNotes: 'See everything that is new',
    footer: 'You get this email because you have a Codevalanche account. We write only when a new version brings something worth your time.',
    unsubscribe: 'Unsubscribe from update emails',
    brandNote: 'Codevalanche is a Radovar product.',
    privacy: 'Privacy',
    textUnsubscribe: 'Unsubscribe:',
  },
}


function escape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function httpsUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('release_email_url_invalid')
  return url.toString()
}

function withCampaign(url, version, variant) {
  const target = new URL(url)
  target.searchParams.set('utm_source', 'email')
  target.searchParams.set('utm_medium', 'release')
  target.searchParams.set('utm_campaign', `release-${version}${variant === 'inactive' ? '-comeback' : ''}`)
  return target.toString()
}

// release: {version, date, copy:{<locale>:{headline,summary,sections:[{title,body}]}}}
// options: {inactive, unsubscribeUrl, oneClickUrl}
// unsubscribeUrl opens the site page with a confirm button (a link scanner that
// only fetches it changes nothing); oneClickUrl is the RFC 8058 POST target
// mail apps call from their own Unsubscribe button.
export function renderReleaseEmail(release, { inactive = false, unsubscribeUrl, oneClickUrl } = {}) {
  if (!release?.version || !/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('release_email_version_invalid')
  const f = FRAME.en, copy = release.copy?.en
  if (!copy?.headline || !copy?.summary || !Array.isArray(copy.sections) || !copy.sections.length) throw new Error('release_email_copy_missing')
  const version = release.version
  const variant = inactive ? 'inactive' : 'active'
  const unsubscribe = httpsUrl(unsubscribeUrl)
  const oneClick = httpsUrl(oneClickUrl)
  const download = withCampaign(DOWNLOAD_URL, version, variant)
  const notes = withCampaign(CHANGELOG_URL, version, variant)
  const sections = copy.sections.slice(0, MAX_SECTIONS)
  const subject = f.subject(version, copy.headline)
  const action = inactive ? f.comeBack(version) : f.download(version)

  const welcome = inactive
    ? `<p class="email-ink" style="margin:0 0 18px;color:#3f403c;font-size:16px;line-height:26px">${escape(f.welcomeBack)}</p>`
    : ''
  const items = sections.map((s) => `<tr><td style="padding:18px 0 0">
<p class="email-ink" style="margin:0 0 4px;color:#141413;font-size:16px;line-height:24px;font-weight:600">${escape(s.title)}</p>
<p class="email-muted" style="margin:0;color:#3f403c;font-size:15px;line-height:24px">${escape(s.body)}</p>
</td></tr>`).join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(subject)}</title>
<style>
@media only screen and (max-width:480px){.email-outer{padding:28px 16px!important}.email-content{padding:30px 24px!important}.email-title{font-size:30px!important;line-height:36px!important;letter-spacing:-0.5px!important}}
@media (prefers-color-scheme:dark){body,.email-bg{background:#12120f!important}.email-card{background:#1a1a16!important;border-color:#3c3d36!important}.email-ink{color:#f2f1ea!important}.email-muted{color:#b4b4aa!important}.email-link{color:#a4d3d5!important}.email-rule{border-color:#3c3d36!important}.email-button{background:#0b5661!important;border-color:#0b5661!important;color:#ffffff!important}.email-logo-light{display:none!important}.email-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}}
[data-ogsc] .email-bg{background:#12120f!important}[data-ogsc] .email-card{background:#1a1a16!important;border-color:#3c3d36!important}[data-ogsc] .email-ink{color:#f2f1ea!important}[data-ogsc] .email-muted{color:#b4b4aa!important}[data-ogsc] .email-link{color:#a4d3d5!important}[data-ogsc] .email-rule{border-color:#3c3d36!important}[data-ogsc] .email-button{background:#0b5661!important;color:#ffffff!important}[data-ogsc] .email-logo-light{display:none!important}[data-ogsc] .email-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}
</style>
</head>
<body class="email-bg" style="margin:0;padding:0;background:#faf9f5;color:#141413;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;color:#faf9f5;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(copy.summary)}</div>
<table class="email-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#faf9f5" style="width:100%;background:#faf9f5;border-collapse:collapse">
<tr><td class="email-outer" align="center" style="padding:44px 20px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse">
<tr><td style="padding:0 4px 26px">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tr>
<td width="48" valign="middle" style="width:48px;padding:0 12px 0 0"><a href="${SITE}/" style="text-decoration:none"><img class="email-logo-light" src="${EMAIL_LOGO_URL}" width="48" height="32" alt="Codevalanche logo" style="display:block;width:48px;height:32px"><img class="email-logo-dark" src="${EMAIL_LOGO_DARK_URL}" width="48" height="32" alt="Codevalanche logo" style="display:none;width:48px;height:32px;max-height:0;overflow:hidden;mso-hide:all"></a></td>
<td valign="middle" style="padding:0"><a class="email-ink" href="${SITE}/" style="color:#141413;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.7px;text-decoration:none">Codevalanche</a></td>
</tr></table>
</td></tr>
<tr><td>
<table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;table-layout:fixed;background:#ffffff;border:1px solid #deddd5;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden">
<tr><td height="4" bgcolor="#0b5661" style="height:4px;background:#0b5661;font-size:1px;line-height:1px">&nbsp;</td></tr>
<tr><td class="email-content" style="padding:40px 36px 38px">
<p class="email-link" style="margin:0 0 10px;color:#0b5661;font-size:13px;line-height:20px;font-weight:600;letter-spacing:0.3px">${escape(f.eyebrow(version))}</p>
<h1 class="email-ink email-title" style="margin:0 0 18px;color:#141413;font-family:Newsreader,Georgia,'Times New Roman',serif;font-size:34px;line-height:40px;letter-spacing:-0.8px;font-weight:400">${escape(copy.headline)}</h1>
${welcome}<p class="email-ink" style="margin:0;color:#3f403c;font-size:16px;line-height:26px">${escape(copy.summary)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 8px;border-collapse:separate"><tr><td bgcolor="#0b5661" style="border-radius:6px;background:#0b5661;mso-padding-alt:0 24px"><a class="email-button" href="${escape(download)}" style="display:inline-block;min-height:46px;padding:0 24px;border:1px solid #0b5661;border-radius:6px;background:#0b5661;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;line-height:46px;mso-line-height-rule:exactly;text-align:center;text-decoration:none">${escape(action)}</a></td></tr></table>
<p class="email-muted" style="margin:0 0 8px;color:#63645e;font-size:13px;line-height:21px">${escape(f.alreadyInstalled)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:18px 0 0;border-collapse:collapse;border-top:1px solid #deddd5" class="email-rule">
${items}
</table>
<p style="margin:24px 0 0;font-size:15px;line-height:24px"><a class="email-link" href="${escape(notes)}" style="color:#0b5661;text-decoration:underline;font-weight:600">${escape(f.allNotes)}</a></p>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 4px 0">
<p class="email-muted" style="margin:0 0 12px;color:#63645e;font-size:12px;line-height:20px">${escape(f.footer)}</p>
<p class="email-muted" style="margin:0;color:#63645e;font-size:12px;line-height:20px">${escape(f.brandNote)}</p>
<p style="margin:8px 0 0;font-size:12px;line-height:22px"><a class="email-link" href="${escape(unsubscribe)}" style="display:inline-block;margin-right:16px;color:#0b5661;text-decoration:underline">${escape(f.unsubscribe)}</a><a class="email-link" href="${PRIVACY_URL}" style="display:inline-block;color:#0b5661;text-decoration:underline">${escape(f.privacy)}</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>
`

  const text = [
    f.eyebrow(version),
    '',
    copy.headline,
    '',
    ...(inactive ? [f.welcomeBack, ''] : []),
    copy.summary,
    '',
    `${action}: ${download}`,
    f.alreadyInstalled,
    '',
    ...sections.flatMap((s) => [s.title, s.body, '']),
    `${f.allNotes}: ${notes}`,
    '',
    '--',
    f.footer,
    `${f.textUnsubscribe} ${unsubscribe}`,
  ].join('\n')

  return {
    variant,
    subject,
    html,
    text,
    // RFC 8058 one-click unsubscribe; required by Gmail and Yahoo for bulk mail.
    headers: {
      'List-Unsubscribe': `<${oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
