// Texts of two-step verification on the account page, in the languages the
// account emails exist in (helpers.js EMAIL_LOCALES). The page picks the
// browser's language; anything else falls back to English.
import { EMAIL_LOCALES, emailLocaleFor } from './helpers.js'

export const MFA_STRINGS = {
  en: {
    challengeTitle: 'Two-step verification',
    challengeText: 'Enter the 6-digit code from your authenticator app.',
    codeLabel: 'Authenticator code',
    verify: 'Verify',
    useRecovery: 'Use a recovery code instead',
    recoveryLabel: 'Recovery code',
    recoveryText: 'A recovery code turns two-step verification off for this account. You can turn it on again afterwards.',
    recoverySubmit: 'Use recovery code',
    signOut: 'Sign out',
    sectionTitle: 'Two-step verification',
    stateOff: 'Off. Add an authenticator app for a second step at sign-in.',
    stateOn: 'On. Recovery codes left: {n}.',
    enable: 'Turn on two-step verification',
    regenerate: 'New recovery codes',
    disable: 'Turn off two-step verification',
    enrollText: 'Scan the QR code with your authenticator app, or type the key, then enter the 6-digit code it shows.',
    qrAlt: 'QR code for your authenticator app',
    secretLabel: 'Key',
    confirm: 'Confirm and turn on',
    cancel: 'Cancel',
    codesText: 'Save these recovery codes somewhere safe. Each works once, and they are shown only now.',
    codesDone: 'I saved my recovery codes',
    enabled: 'Two-step verification is on.',
    disabled: 'Two-step verification is off.',
    disableConfirm: 'Turn off two-step verification for this account?',
    recovered: 'Recovery code accepted. Two-step verification is off; turn it on again from your account.',
    codeInvalid: 'Enter the 6-digit code from your authenticator app.',
    codeWrong: 'That code did not work. Check the time on your phone and try again.',
    recoveryInvalid: 'That recovery code is not valid or was already used.',
    codesRegenerated: 'New recovery codes created. The old ones no longer work.',
    reverify: 'Sign in again and verify with your authenticator to change this.',
  },
  ro: {
    challengeTitle: 'Verificare în doi pași',
    challengeText: 'Introdu codul de 6 cifre din aplicația de autentificare.',
    codeLabel: 'Cod din aplicația de autentificare',
    verify: 'Verifică',
    useRecovery: 'Folosește un cod de recuperare',
    recoveryLabel: 'Cod de recuperare',
    recoveryText: 'Un cod de recuperare oprește verificarea în doi pași pentru acest cont. O poți porni din nou după aceea.',
    recoverySubmit: 'Folosește codul de recuperare',
    signOut: 'Ieși din cont',
    sectionTitle: 'Verificare în doi pași',
    stateOff: 'Oprită. Adaugă o aplicație de autentificare pentru un al doilea pas la conectare.',
    stateOn: 'Pornită. Coduri de recuperare rămase: {n}.',
    enable: 'Pornește verificarea în doi pași',
    regenerate: 'Coduri de recuperare noi',
    disable: 'Oprește verificarea în doi pași',
    enrollText: 'Scanează codul QR cu aplicația de autentificare sau scrie cheia, apoi introdu codul de 6 cifre afișat.',
    qrAlt: 'Cod QR pentru aplicația de autentificare',
    secretLabel: 'Cheie',
    confirm: 'Confirmă și pornește',
    cancel: 'Anulează',
    codesText: 'Păstrează aceste coduri de recuperare într-un loc sigur. Fiecare merge o singură dată și sunt afișate doar acum.',
    codesDone: 'Am salvat codurile de recuperare',
    enabled: 'Verificarea în doi pași este pornită.',
    disabled: 'Verificarea în doi pași este oprită.',
    disableConfirm: 'Oprești verificarea în doi pași pentru acest cont?',
    recovered: 'Cod de recuperare acceptat. Verificarea în doi pași este oprită; o poți porni din nou din cont.',
    codeInvalid: 'Introdu codul de 6 cifre din aplicația de autentificare.',
    codeWrong: 'Codul nu a mers. Verifică ora de pe telefon și încearcă din nou.',
    recoveryInvalid: 'Codul de recuperare nu este valid sau a fost deja folosit.',
    codesRegenerated: 'Au fost create coduri de recuperare noi. Cele vechi nu mai merg.',
    reverify: 'Conectează-te din nou și verifică cu aplicația de autentificare ca să schimbi asta.',
  },
}

export function mfaLocaleFor(languages = []) {
  const locale = emailLocaleFor(languages)
  return EMAIL_LOCALES.includes(locale) && MFA_STRINGS[locale] ? locale : 'en'
}

export function mfaText(locale, key, vars = {}) {
  const template = MFA_STRINGS[locale]?.[key] ?? MFA_STRINGS.en[key] ?? ''
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
}

/** Six digits, spaces ignored; '' otherwise. */
export function totpCodeFrom(input) {
  const code = String(input ?? '').replace(/\s/g, '')
  return /^\d{6}$/.test(code) ? code : ''
}
