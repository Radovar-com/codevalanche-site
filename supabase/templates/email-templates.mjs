// Source of the Supabase Auth email templates (supabase/templates/*.html).
// Regenerate after editing:  node supabase/templates/email-templates.mjs
// supabase/tests/config.test.mjs fails when the .html files drift from here.
//
// One file per email; each holds every language and picks one with Go
// templates from the user's metadata `locale` (set by the account page at
// sign-up). `printf "%v"` keeps users without a locale on English instead of
// failing the template. To add a language: add it to STRINGS and to
// EMAIL_LOCALES in src/account/helpers.js.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const STRINGS = {
  en: {
    footer: 'You received this email because this address was used with a Codevalanche account. If that was not you, you can ignore it.',
    linkHelp: 'If the button does not work, copy this link into your browser:',
    confirmation: { title: 'Confirm your email', body: 'Welcome to Codevalanche. Confirm this email address to finish creating your account.', action: 'Confirm email' },
    recovery: { title: 'Reset your password', body: 'Someone asked to reset the password of your Codevalanche account. Open the link in the same browser to choose a new password. If it was not you, ignore this email; your password stays the same.', action: 'Choose a new password' },
    magic_link: { title: 'Your sign-in link', body: 'Use this link to sign in to Codevalanche. It works once and expires soon.', action: 'Sign in' },
    invite: { title: 'You are invited to Codevalanche', body: 'You have been invited to create a Codevalanche account. Accept the invitation to choose your password.', action: 'Accept invitation' },
    email_change: { title: 'Confirm your new email', body: 'Confirm that you want to change the email of your Codevalanche account from {{ .Email }} to {{ .NewEmail }}.', action: 'Confirm new email' },
    reauthentication: { title: 'Your confirmation code', body: 'Enter this code in Codevalanche to confirm it is you:', action: '' },
  },
  ro: {
    footer: 'Ai primit acest email pentru că adresa a fost folosită pentru un cont Codevalanche. Dacă nu ai fost tu, îl poți ignora.',
    linkHelp: 'Dacă butonul nu merge, copiază acest link în browser:',
    confirmation: { title: 'Confirmă adresa de email', body: 'Bine ai venit în Codevalanche. Confirmă această adresă ca să termini crearea contului.', action: 'Confirmă emailul' },
    recovery: { title: 'Resetează parola', body: 'Cineva a cerut resetarea parolei contului tău Codevalanche. Deschide linkul în același browser ca să alegi o parolă nouă. Dacă nu ai fost tu, ignoră acest email; parola rămâne aceeași.', action: 'Alege o parolă nouă' },
    magic_link: { title: 'Linkul tău de conectare', body: 'Folosește acest link ca să te conectezi la Codevalanche. Merge o singură dată și expiră curând.', action: 'Conectează-te' },
    invite: { title: 'Ai o invitație în Codevalanche', body: 'Ai fost invitat să îți creezi un cont Codevalanche. Acceptă invitația ca să îți alegi parola.', action: 'Acceptă invitația' },
    email_change: { title: 'Confirmă noua adresă de email', body: 'Confirmă că vrei să schimbi emailul contului Codevalanche din {{ .Email }} în {{ .NewEmail }}.', action: 'Confirmă noul email' },
    reauthentication: { title: 'Codul tău de confirmare', body: 'Introdu acest cod în Codevalanche ca să confirmi că ești tu:', action: '' },
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

// Escapes text for HTML but keeps the {{ .Email }} / {{ .NewEmail }} actions
// Supabase fills in (Go's html/template escapes those values itself).
function escape(text) {
  return text.split(/(\{\{ \.(?:Email|NewEmail) \}\})/).map((part, i) => i % 2 ? part : part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')).join('')
}

function block(kind, s) {
  const t = s[kind]
  const action = kind === 'reauthentication'
    ? '<p style="font-size:28px;letter-spacing:6px;font-weight:600;margin:24px 0">{{ .Token }}</p>'
    : `<p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#4f6bff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escape(t.action)}</a></p>
<p style="color:#5b6170;font-size:13px">${escape(s.linkHelp)}<br><a href="{{ .ConfirmationURL }}" style="color:#4f6bff;word-break:break-all">{{ .ConfirmationURL }}</a></p>`
  return `<h1 style="font-size:20px;margin:0 0 12px">${escape(t.title)}</h1>
<p>${escape(t.body)}</p>
${action}
<p style="color:#5b6170;font-size:12px;margin-top:32px">${escape(s.footer)}</p>`
}

export function renderTemplate(kind) {
  const [first, ...others] = Object.keys(STRINGS).filter(l => l !== 'en')
  const branches = [first, ...others].filter(Boolean).map((locale, i) => `{{ ${i ? 'else if' : 'if'} eq $locale "${locale}" }}\n${block(kind, STRINGS[locale])}\n`).join('')
  const body = branches ? `${branches}{{ else }}\n${block(kind, STRINGS.en)}\n{{ end }}` : block(kind, STRINGS.en)
  return `<!doctype html>
<!-- Generated by supabase/templates/email-templates.mjs. Edit that file, not this one. -->
{{ $locale := printf "%v" .Data.locale }}<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#15171c;line-height:1.5">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="font-weight:700;font-size:16px;margin:0 0 20px">Codevalanche</p>
${body}
</div>
</body></html>
`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const kind of TEMPLATE_KINDS) await writeFile(new URL(`./${kind}.html`, import.meta.url), renderTemplate(kind))
  console.log(`Wrote ${TEMPLATE_KINDS.length} templates`)
}
