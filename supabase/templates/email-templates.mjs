// Source of the Supabase Auth email templates (supabase/templates/*.html).
// Regenerate after editing:  node supabase/templates/email-templates.mjs
// supabase/tests/config.test.mjs fails when the .html files drift from here.
//
// Owner-approved English-only transactional emails. Account UI locale metadata
// remains independent: these six templates always render English.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const STRINGS = {
  en: {
    brandNote: 'Codevalanche is a Radovar product.',
    homeLabel: 'Codevalanche',
    companyLabel: 'Radovar',
    privacyLabel: 'Privacy',
    currentEmailLabel: 'Current email',
    newEmailLabel: 'New email',
    codeHelp: 'This code was sent by email. It is not a code from your authenticator app.',
    footer: 'You received this email because this address was used with a Codevalanche account. If that was not you, you can ignore it.',
    linkHelp: 'If the button does not work, copy this link into your browser:',
    confirmation: { title: 'Confirm your email', preheader: 'One step to finish creating your Codevalanche account.', body: 'Welcome to Codevalanche. Confirm this email address to finish creating your account.', action: 'Confirm email' },
    recovery: { title: 'Reset your password', preheader: 'Choose a new password for your Codevalanche account.', body: 'Someone asked to reset the password of your Codevalanche account. Open the link in the same browser to choose a new password. If it was not you, ignore this email; your password stays the same.', action: 'Choose a new password' },
    magic_link: { title: 'Your sign-in link', preheader: 'Your link to sign in to Codevalanche.', body: 'Use this link to sign in to Codevalanche. It works once and expires soon.', action: 'Sign in' },
    invite: { title: 'You are invited to Codevalanche', preheader: 'Accept your invitation and set up your account.', body: 'You have been invited to create a Codevalanche account. Accept the invitation to choose your password.', action: 'Accept invitation' },
    email_change: { title: 'Confirm your new email', preheader: 'Confirm the email address change for your Codevalanche account.', body: 'Confirm the change to the email address on your Codevalanche account.', action: 'Confirm new email' },
    reauthentication: { title: 'Your confirmation code', preheader: 'A confirmation code for your Codevalanche account.', body: 'Enter this code in Codevalanche to confirm it is you:', action: '' },
  },
}

export const SUBJECTS = {
  confirmation: 'Confirm your Codevalanche email',
  recovery: 'Reset your Codevalanche password',
  magic_link: 'Your Codevalanche sign-in link',
  invite: 'You are invited to Codevalanche',
  email_change: 'Confirm your new Codevalanche email',
  reauthentication: 'Your Codevalanche confirmation code',
}
export const TEMPLATE_KINDS = Object.keys(SUBJECTS)
// Exact geometry from src/assets/codevalanche-mark.svg, with transparent pixels.
// This additive URL is a publication candidate, not a claim that it is live yet.
export const EMAIL_LOGO_URL = 'https://codevalanche.com/assets/codevalanche-email-logo.png'
export const EMAIL_LOGO_DARK_URL = 'https://codevalanche.com/assets/codevalanche-email-logo-dark.png'

// Escapes text for HTML but keeps the {{ .Email }} / {{ .NewEmail }} actions
// Supabase fills in (Go's html/template escapes those values itself).
function escape(text) {
  return text.split(/(\{\{ \.(?:Email|NewEmail) \}\})/).map((part, i) => i % 2 ? part : part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')).join('')
}

// Invitation and email-change links open the account page directly with a
// token hash. The page verifies it with an explicit POST (verifyOtp), so link
// scanners that only fetch the URL cannot consume it, and no session token is
// ever placed in a URL. The other kinds keep the provider confirmation link.
export const TOKEN_HASH_KINDS = Object.freeze(['invite', 'email_change'])
export function actionUrl(kind) {
  return TOKEN_HASH_KINDS.includes(kind) ? `{{ .SiteURL }}?token_hash={{ .TokenHash }}&amp;type=${kind}` : '{{ .ConfirmationURL }}'
}

function block(kind, s) {
  const t = s[kind]
  const url = actionUrl(kind)
  // The address values remain Go text actions; Go still escapes their contents.
  const addresses = kind === 'email_change'
    ? `<table class="email-detail-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#faf9f5" style="width:100%;table-layout:fixed;margin:24px 0 0;background:#faf9f5;border:1px solid #deddd5;border-radius:6px;border-collapse:separate;border-spacing:0"><tr><td style="padding:16px 18px;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word"><p class="email-muted" style="margin:0 0 6px;color:#63645e;font-size:12px;line-height:18px">${escape(s.currentEmailLabel)}</p><p class="email-ink" style="margin:0;color:#141413;font-size:15px;line-height:23px;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word">{{ .Email }}</p></td></tr><tr><td style="padding:16px 18px;border-top:1px solid #deddd5;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word"><p class="email-muted" style="margin:0 0 6px;color:#63645e;font-size:12px;line-height:18px">${escape(s.newEmailLabel)}</p><p class="email-ink" style="margin:0;color:#141413;font-size:15px;line-height:23px;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word">{{ .NewEmail }}</p></td></tr></table>`
    : ''
  const action = kind === 'reauthentication'
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 16px;border-collapse:separate"><tr><td class="email-code-panel" bgcolor="#f0eee6" style="padding:20px 16px;border:1px solid #deddd5;border-radius:6px;background:#f0eee6"><p class="email-ink email-code" style="margin:0;color:#141413;font-family:Consolas,'Courier New',monospace;font-size:28px;line-height:38px;letter-spacing:3px;font-weight:600;word-break:break-all">{{ .Token }}</p></td></tr></table>
<p class="email-muted" style="margin:0;color:#63645e;font-size:13px;line-height:21px">${escape(s.codeHelp)}</p>`
    : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 30px;border-collapse:separate"><tr><td bgcolor="#0b5661" style="border-radius:6px;background:#0b5661;mso-padding-alt:0 24px"><a class="email-button" href="${url}" style="display:inline-block;min-height:46px;padding:0 24px;border:1px solid #0b5661;border-radius:6px;background:#0b5661;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;line-height:46px;mso-line-height-rule:exactly;text-align:center;text-decoration:none">${escape(t.action)}</a></td></tr></table>
<p class="email-muted" style="margin:0 0 8px;color:#63645e;font-size:13px;line-height:21px">${escape(s.linkHelp)}</p>
<p style="margin:0;font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere"><a class="email-link" href="${url}" style="color:#0b5661;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere">${url}</a></p>`
  return `<h1 class="email-ink email-title" style="margin:0 0 20px;color:#141413;font-family:Newsreader,Georgia,'Times New Roman',serif;font-size:38px;line-height:44px;letter-spacing:-0.8px;font-weight:400">${escape(t.title)}</h1>
<p class="email-ink" style="margin:0;color:#3f403c;font-size:16px;line-height:26px">${escape(t.body)}</p>
${addresses}
${action}
`
}

export function renderTemplate(kind) {
  if (!TEMPLATE_KINDS.includes(kind)) throw new Error('email_template_kind_unknown')
  const s = STRINGS.en
  return `<!doctype html>
<!-- Generated by supabase/templates/email-templates.mjs. Edit that file, not this one. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(s[kind].title)}</title>
<style>
@media only screen and (max-width:480px){.email-outer{padding:28px 16px!important}.email-content{padding:30px 24px!important}.email-title{font-size:32px!important;line-height:38px!important;letter-spacing:-0.5px!important}.email-code{font-size:26px!important;line-height:36px!important;letter-spacing:2px!important}}
@media (prefers-color-scheme:dark){body,.email-bg{background:#12120f!important}.email-card{background:#1a1a16!important;border-color:#3c3d36!important}.email-ink{color:#f2f1ea!important}.email-muted{color:#b4b4aa!important}.email-link{color:#a4d3d5!important}.email-code-panel,.email-detail-panel{background:#25261f!important;border-color:#3c3d36!important}.email-button{background:#0b5661!important;border-color:#0b5661!important;color:#ffffff!important}.email-logo-light{display:none!important}.email-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}}
[data-ogsc] .email-bg{background:#12120f!important}[data-ogsc] .email-card{background:#1a1a16!important;border-color:#3c3d36!important}[data-ogsc] .email-ink{color:#f2f1ea!important}[data-ogsc] .email-muted{color:#b4b4aa!important}[data-ogsc] .email-link{color:#a4d3d5!important}[data-ogsc] .email-code-panel,[data-ogsc] .email-detail-panel{background:#25261f!important;border-color:#3c3d36!important}[data-ogsc] .email-button{background:#0b5661!important;color:#ffffff!important}[data-ogsc] .email-logo-light{display:none!important}[data-ogsc] .email-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}
</style>
</head>
<body class="email-bg" style="margin:0;padding:0;background:#faf9f5;color:#141413;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;color:#faf9f5;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(s[kind].preheader)}</div>
<table class="email-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#faf9f5" style="width:100%;background:#faf9f5;border-collapse:collapse">
<tr><td class="email-outer" align="center" style="padding:44px 20px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse">
<tr><td style="padding:0 4px 26px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse"><tr>
<td width="48" valign="middle" style="width:48px;padding:0 12px 0 0"><a href="https://codevalanche.com/" style="text-decoration:none"><img class="email-logo-light" src="${EMAIL_LOGO_URL}" width="48" height="32" alt="Codevalanche logo" style="display:block;width:48px;height:32px"><img class="email-logo-dark" src="${EMAIL_LOGO_DARK_URL}" width="48" height="32" alt="Codevalanche logo" style="display:none;width:48px;height:32px;max-height:0;overflow:hidden;mso-hide:all"></a></td>
<td valign="middle" align="left" style="padding:0"><a class="email-ink" href="https://codevalanche.com/" style="color:#141413;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.7px;text-decoration:none">Codevalanche</a></td>
</tr></table>
</td></tr>
<tr><td>
<table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;table-layout:fixed;background:#ffffff;border:1px solid #deddd5;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden">
<tr><td height="4" bgcolor="#0b5661" style="height:4px;background:#0b5661;font-size:1px;line-height:1px">&nbsp;</td></tr>
<tr><td class="email-content" style="padding:40px 36px 38px">
${block(kind, s)}
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 4px 0">
<p class="email-muted" style="margin:0 0 12px;color:#63645e;font-size:12px;line-height:20px">${escape(s.footer)}</p>
<p class="email-muted" style="margin:0;color:#63645e;font-size:12px;line-height:20px">${escape(s.brandNote)}</p>
<p style="margin:8px 0 0;font-size:12px;line-height:22px"><a class="email-link" href="https://codevalanche.com/" style="display:inline-block;margin-right:16px;color:#0b5661;text-decoration:underline">${escape(s.homeLabel)}</a><a class="email-link" href="https://radovar.com/" style="display:inline-block;margin-right:16px;color:#0b5661;text-decoration:underline">${escape(s.companyLabel)}</a><a class="email-link" href="https://codevalanche.com/privacy.html" style="display:inline-block;color:#0b5661;text-decoration:underline">${escape(s.privacyLabel)}</a></p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>
`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const kind of TEMPLATE_KINDS) await writeFile(new URL(`./${kind}.html`, import.meta.url), renderTemplate(kind))
  console.log(`Wrote ${TEMPLATE_KINDS.length} templates`)
}
