import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { STRINGS, SUBJECTS, TEMPLATE_KINDS, renderTemplate } from '../templates/email-templates.mjs';
import { EMAIL_LOCALES } from '../../src/account/helpers.js';

const root = new URL('../../', import.meta.url);
const config = await readFile(new URL('supabase/config.toml', root), 'utf8');
// Minimal TOML reader for this file: [section] headers and key = value lines.
function section(name) {
  const lines = config.split(/\r?\n/), out = {};
  let inside = false;
  for (const line of lines) {
    const header = line.match(/^\[([^\]]+)\]\s*$/);
    if (header) { inside = header[1] === name; continue; }
    const pair = inside && line.match(/^([a-z_]+)\s*=\s*(.+?)\s*$/);
    if (pair) out[pair[1]] = pair[2];
  }
  return out;
}

test('Auth requires 12-character passwords and keeps sign-up confirmations', () => {
  assert.equal(section('auth').minimum_password_length, '12');
  assert.equal(section('auth.email').enable_confirmations, 'true');
});

test('authenticator-app (TOTP) two-step verification is on; phone factors stay off', () => {
  assert.equal(section('auth.mfa.totp').enroll_enabled, 'true');
  assert.equal(section('auth.mfa.totp').verify_enabled, 'true');
  assert.equal(section('auth.mfa.phone').enroll_enabled, 'false');
});

test('Turnstile is prepared for Supabase Auth with the secret only from the environment', () => {
  const captcha = section('auth.captcha');
  assert.equal(captcha.provider, '"turnstile"');
  assert.match(captcha.secret, /^"env\([A-Z0-9_]+\)"$/);
  assert.equal(captcha.enabled, 'false', 'stays off until the operator has the keys and the site key is live');
});

test('config holds no secret values', () => {
  for (const [, key, value] of config.matchAll(/^\s*#?\s*(secret|pass|client_id|user|auth_token|api_key)\s*=\s*(.+)$/gm)) {
    assert.match(value, /^"env\([A-Z0-9_]+\)"$/, `${key} must come from env()`);
  }
  assert.doesNotMatch(config, /sb_secret_|service_role|eyJ[A-Za-z0-9_-]{10,}|0x4AAA[A-Za-z0-9_-]{10,}/);
  assert.equal(section('functions.codevalanche-account').verify_jwt, 'false', 'matches README deployment note');
});

test('every email template is configured, generated from its source and translated', async () => {
  const files = (await readdir(new URL('supabase/templates/', root))).filter(f => f.endsWith('.html')).sort();
  assert.deepEqual(files, TEMPLATE_KINDS.map(k => `${k}.html`).sort());
  assert.deepEqual(Object.keys(STRINGS).sort(), [...EMAIL_LOCALES].sort(), 'the account page sends only locales that have templates');
  for (const kind of TEMPLATE_KINDS) {
    const entry = section(`auth.email.template.${kind}`);
    assert.equal(entry.content_path, `"./supabase/templates/${kind}.html"`);
    assert.equal(entry.subject, JSON.stringify(SUBJECTS[kind]));
    const html = (await readFile(new URL(`supabase/templates/${kind}.html`, root), 'utf8')).replace(/\r\n/g, '\n');
    assert.equal(html, renderTemplate(kind), `${kind}.html is regenerated (node supabase/templates/email-templates.mjs)`);
    assert.match(html, kind === 'reauthentication' ? /\{\{ \.Token \}\}/ : /href="\{\{ \.ConfirmationURL \}\}"/);
    for (const locale of Object.keys(STRINGS)) assert.ok(html.includes(STRINGS[locale][kind].title), `${kind} has ${locale}`);
  }
});

// Mini evaluator for the subset of Go templates used here, to prove that a user
// without metadata gets English and a Romanian user gets Romanian.
function render(html, data) {
  const vars = { '.ConfirmationURL': 'https://x.test/c', '.Token': '123456', '.Email': 'a@x.test', '.NewEmail': 'b@x.test' };
  let locale;
  const tokens = html.split(/(\{\{.*?\}\})/s);
  const out = []; const stack = [];
  const active = () => stack.every(s => s.on);
  for (const token of tokens) {
    const action = token.match(/^\{\{\s*(.*?)\s*\}\}$/s)?.[1];
    if (action === undefined) { if (active()) out.push(token); continue; }
    let m;
    if ((m = action.match(/^\$locale := printf "%v" \.Data\.locale$/))) locale = data?.locale === undefined ? '<no value>' : String(data.locale);
    else if ((m = action.match(/^if eq \$locale "([a-z]+)"$/))) stack.push({ on: locale === m[1], done: locale === m[1] });
    else if ((m = action.match(/^else if eq \$locale "([a-z]+)"$/))) { const top = stack.at(-1); top.on = !top.done && locale === m[1]; top.done ||= top.on; }
    else if (action === 'else') { const top = stack.at(-1); top.on = !top.done; top.done = true; }
    else if (action === 'end') stack.pop();
    else if (Object.hasOwn(vars, action)) { if (active()) out.push(vars[action]); }
    else throw new Error(`unsupported template action: ${action}`);
  }
  assert.equal(stack.length, 0, 'balanced if/end');
  return out.join('');
}

test('templates pick the language from metadata and fall back to English', () => {
  for (const kind of TEMPLATE_KINDS) {
    const html = renderTemplate(kind);
    for (const [data, expected] of [[undefined, 'en'], [{}, 'en'], [{ locale: 'de' }, 'en'], [{ locale: 'ro' }, 'ro']]) {
      const text = render(html, data);
      assert.ok(text.includes(STRINGS[expected][kind].title.replace(/&/g, '&amp;')), `${kind} ${JSON.stringify(data)} -> ${expected}`);
      for (const other of Object.keys(STRINGS).filter(l => l !== expected)) assert.ok(!text.includes(STRINGS[other][kind].title), `${kind} has no ${other} text for ${expected}`);
      assert.ok(text.includes(kind === 'reauthentication' ? '123456' : 'https://x.test/c'));
    }
  }
});
