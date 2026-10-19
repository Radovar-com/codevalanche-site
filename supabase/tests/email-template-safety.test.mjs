import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'parse5';
import {renderTemplate, actionUrl, STRINGS, SUBJECTS, TEMPLATE_KINDS, EMAIL_LOGO_URL, EMAIL_LOGO_DARK_URL} from '../templates/email-templates.mjs';
import {syntheticFixture, evaluateTemplate, renderPreview, PREVIEW_LOGO_PATH, PREVIEW_LOGO_DARK_PATH} from '../../scripts/auth-email-preview.mjs';

const KINDS = ['confirmation', 'recovery', 'magic_link', 'invite', 'email_change', 'reauthentication'];
const CONFIRMATION_URL = 'https://example.invalid/preview/confirmation';
const TOKEN = '123456';
const DECLARATION = '{{ $locale := printf "%v" .Data.locale }}';
const FORBIDDEN_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'audio', 'video', 'source', 'base']);
const BRAND_HOSTS = new Set(['codevalanche.com', 'www.codevalanche.com', 'radovar.com', 'www.radovar.com']);

function descendants(node) {
  return [node, ...(node.childNodes ?? []).flatMap(descendants), ...(node.content ? descendants(node.content) : [])];
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value;
  if (['style', 'script'].includes(node.tagName)) return '';
  return (node.childNodes ?? []).map(textContent).join('');
}

function documentOf(html) {
  assert.equal(typeof html, 'string', 'Preview output is evaluated HTML');
  const document = parse(html);
  const nodes = descendants(document);
  return {document, nodes, elements: nodes.filter(node => node.tagName)};
}

function one(nodes, name) {
  const found = nodes.filter(node => node.tagName === name);
  assert.equal(found.length, 1, `One ${name} element`);
  return found[0];
}

function attribute(node, name) {
  return node.attrs?.find(item => item.name === name)?.value;
}

function assertPassiveEmail(html) {
  const result = documentOf(html);
  assert.doesNotMatch(html, /https?:\/\/[^\s"'<>]*supabase\.(?:co|com|io)\b/i, 'No live Supabase URL belongs in a synthetic preview');
  assert.doesNotMatch(html, /(?:google-analytics\.com|googletagmanager\.com|cloudflareinsights\.com|connect\.facebook\.net|hotjar\.com|clarity\.ms)/i, 'No tracking resource');
  assert.doesNotMatch(html, /@import\b|@font-face\b|expression\s*\(|(?:javascript|vbscript)\s*:/i, 'No active CSS, remote font import, or script URL');
  assert.doesNotMatch(html, /url\s*\(\s*["']?(?!data:image\/(?:png|gif|jpeg|webp);base64,)/i, 'CSS must not fetch resources');
  for (const node of result.elements) {
    assert.equal(FORBIDDEN_ELEMENTS.has(node.tagName), false, `No active ${node.tagName} element`);
    assert.equal(node.tagName === 'link', false, 'Email styling is self-contained');
    for (const {name, value} of node.attrs ?? []) {
      assert.equal(/^on/i.test(name), false, `No ${name} event handler`);
      assert.equal(['ping', 'attributionsrc'].includes(name), false, 'Links must not send tracking requests');
      if (['src', 'srcset', 'background', 'poster', 'data', 'xlink:href'].includes(name) || (name === 'href' && node.tagName !== 'a' && !value.startsWith('#'))) {
        assert.equal(node.tagName, 'img', 'Only the reviewed brand image may load');
        assert.equal(name, 'src', 'No CSS/background/srcset or extra resource request');
        assert.ok([PREVIEW_LOGO_PATH, PREVIEW_LOGO_DARK_PATH].includes(value), 'Preview maps only the fixed brand PNG variants locally');
      }
    }
    if (node.tagName === 'meta') assert.notEqual(attribute(node, 'http-equiv')?.toLowerCase(), 'refresh', 'No automatic redirect');
    if (node.tagName === 'a') {
      const href = attribute(node, 'href');
      assert.ok(href, 'Every link has an explicit destination');
      const url = new URL(href);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username + url.password, '', 'Links contain no credentials');
      assert.ok(href === CONFIRMATION_URL || BRAND_HOSTS.has(url.hostname), 'Links stay on the synthetic confirmation or public brand sites');
    }
  }
  const logos = result.nodes.filter(node => node.tagName === 'img');
  assert.equal(logos.length, 2, 'Exactly the light and dark logo variants');
  assert.deepEqual(new Set(logos.map(node=>attribute(node,'src'))), new Set([PREVIEW_LOGO_PATH,PREVIEW_LOGO_DARK_PATH]));
  for (const logo of logos) {
    assert.match(attribute(logo, 'alt'), /Codevalanche/i);
    assert.ok(Number(attribute(logo, 'width')) >= 32, 'Brand image has explicit useful width');
    assert.ok(Number(attribute(logo, 'height')) >= 24, 'Brand image has explicit useful height');
    assert.doesNotMatch(attribute(logo, 'style'), /background\s*:/i, 'No logo background plate');
  }
  assert.doesNotMatch(textContent(one(result.nodes,'body')), /Account email/, 'Removed owner-rejected subtitle');
  // Outlook conditional markup is a comment to parse5 but is rendered by Outlook.
  for (const node of result.nodes.filter(node => node.nodeName === '#comment')) {
    assert.doesNotMatch(node.data, /<\s*(?:script|iframe|object|embed|form|input|link|img)\b|\son[a-z]+\s*=/i, 'Conditional email markup is passive too');
  }
  return result;
}

test('the generator exposes exactly six English-only account-email contracts', () => {
  assert.deepEqual([...TEMPLATE_KINDS].sort(), [...KINDS].sort());
  assert.deepEqual(Object.keys(SUBJECTS).sort(), [...KINDS].sort());
  assert.deepEqual(Object.keys(STRINGS), ['en']);
  assert.equal(EMAIL_LOGO_URL, 'https://codevalanche.com/assets/codevalanche-email-logo.png');
  assert.equal(EMAIL_LOGO_DARK_URL, 'https://codevalanche.com/assets/codevalanche-email-logo-dark.png');
  for (const kind of KINDS) {
    assert.equal(typeof SUBJECTS[kind], 'string');
    assert.ok(SUBJECTS[kind].trim());
    assert.doesNotMatch(SUBJECTS[kind], /[\r\n<>]/);
    for (const locale of ['en']) {
      assert.equal(typeof STRINGS[locale][kind].title, 'string');
      assert.ok(STRINGS[locale][kind].title.trim());
      assert.ok(STRINGS[locale][kind].preheader.trim());
    }
  }
  assert.throws(() => renderTemplate('not-an-auth-email'));
  assert.throws(() => renderPreview('not-an-auth-email'));
});

test('all six real generator outputs are English with fixed light/dark brand images and no active content', async t => {
  for (const kind of KINDS) for (const locale of ['en']) {
    await t.test(`${kind}/${locale}`, () => {
      const source = renderTemplate(kind);
      const fixture = syntheticFixture(locale);
      const html = renderPreview(kind, locale);
      assert.equal(html, evaluateTemplate(source.replaceAll(actionUrl(kind), '{{ .ConfirmationURL }}'), fixture).replaceAll(`src="${EMAIL_LOGO_URL}"`, `src="${PREVIEW_LOGO_PATH}"`).replaceAll(`src="${EMAIL_LOGO_DARK_URL}"`, `src="${PREVIEW_LOGO_DARK_PATH}"`), 'Preview only maps the reviewed brand assets and the token-hash action link locally');
      assert.doesNotMatch(html, /\{\{/, 'No unresolved Go opener in a normal preview; adjacent CSS closing braces are valid');
      const {nodes} = assertPassiveEmail(html);
      assert.equal(attribute(one(nodes, 'html'), 'lang'), locale);
      assert.equal(textContent(one(nodes, 'title')), STRINGS[locale][kind].title);
      assert.equal(textContent(one(nodes, 'h1')), STRINGS[locale][kind].title);
      assert.ok(textContent(one(nodes, 'body')).includes(STRINGS[locale][kind].preheader), 'Localized preheader remains present');
    });
  }
});

test('all existing and hostile locale metadata remains English-only', () => {
  for (const kind of KINDS) {
    const english = renderPreview(kind, 'en');
    for (const locale of ['ro', 'unknown', 'ro-RO', 'RO', '<img src=x onerror=alert(1)>', '{{ end }}<script>alert(1)</script>']) {
      const html = renderPreview(kind, locale);
      assert.equal(html, english, `${kind}: unknown locale falls back to the same English document`);
      assertPassiveEmail(html);
    }
  }
});

test('the brand logo variants cannot become tracking images or arbitrary remote resources', () => {
  const html = renderPreview('confirmation');
  assert.throws(() => assertPassiveEmail(html.replace(PREVIEW_LOGO_PATH, 'https://attacker.invalid/pixel.png')));
  assert.throws(() => assertPassiveEmail(html.replace('</body>', '<img src="/extra.png" alt="extra"></body>')));
  assert.throws(() => assertPassiveEmail(html.replace(`src="${PREVIEW_LOGO_PATH}"`, `src="${PREVIEW_LOGO_PATH}" srcset="https://attacker.invalid/image.png 2x"`)));
});

test('email-change details preserve long values in labelled wrapping rows', () => {
  const Email = `original-${'a'.repeat(55)}@preview-${'x'.repeat(55)}.example.invalid`;
  const NewEmail = `replacement-${'b'.repeat(52)}@preview-${'x'.repeat(55)}.example.invalid`;
  const html = renderPreview('email_change', 'en', {Email, NewEmail});
  const {nodes} = assertPassiveEmail(html);
  const text = textContent(one(nodes, 'body'));
  for (const value of ['Current email', 'New email', Email, NewEmail]) assert.ok(text.includes(value), value);
  assert.match(html, /word-break:break-all/);
});

test('the synthetic fixture cannot accept a real recipient, arbitrary confirmation URL, or secret-bearing extra fields', () => {
  const fixture = syntheticFixture();
  assert.deepEqual(Object.keys(fixture).sort(), ['Data', 'Email', 'NewEmail', 'Token', 'ConfirmationURL'].sort());
  assert.deepEqual(fixture.Data, {locale: 'en'});
  assert.equal(fixture.Email, 'recipient@example.invalid');
  assert.equal(fixture.NewEmail, 'new@example.invalid');
  assert.equal(fixture.Token, TOKEN);
  assert.equal(fixture.ConfirmationURL, CONFIRMATION_URL);
  for (const locale of [null, 42, false, {locale: 'ro'}]) {
    const untyped = syntheticFixture(locale);
    assert.equal(typeof untyped.Data.locale, 'string', 'Untrusted locale objects are never template values');
    assert.equal(renderPreview('confirmation', locale), renderPreview('confirmation', 'en'));
  }
  for (const field of ['Email', 'NewEmail']) for (const value of ['recipient@supabase.com', 'recipient@example.invalid.attacker.test', 'recipient@example.invalid?token=synthetic']) {
    assert.throws(() => syntheticFixture('en', {[field]: value}), `${field}: recipient must end at the reserved domain`);
  }
  for (const value of ['https://attacker.invalid/collect', 'https://example.invalid/preview/other', 'https://example.invalid/preview/confirmation?token=synthetic', 'javascript:alert(1)']) {
    assert.throws(() => syntheticFixture('en', {ConfirmationURL: value}), 'Only the fixed synthetic confirmation URL is allowed');
  }
  for (const extra of [{password: 'synthetic-only'}, {access_token: 'synthetic-only'}, {SMTPPassword: 'synthetic-only'}, {Data: {locale: 'en', secret: 'synthetic-only'}}]) {
    assert.throws(() => syntheticFixture('en', extra), 'Unknown or secret-bearing fixture fields are refused');
  }
});

test('Email and NewEmail are HTML escaped in text and quoted attributes without evaluating injected Go text', () => {
  const Email = '<img src=x onerror="alert(1)">&\'"@example.invalid';
  const NewEmail = '{{ .Token }}<script>alert(2)</script>@example.invalid';
  const fixture = syntheticFixture('en', {Email, NewEmail});
  const html = evaluateTemplate(`${DECLARATION}<html><body><p title="{{ .Email }}">{{ .Email }}</p><p title="{{ .NewEmail }}">{{ .NewEmail }}</p></body></html>`, fixture);
  const {elements} = documentOf(html);
  const paragraphs = elements.filter(node => node.tagName === 'p');
  assert.equal(paragraphs.length, 2);
  assert.equal(textContent(paragraphs[0]), Email);
  assert.equal(attribute(paragraphs[0], 'title'), Email);
  assert.equal(textContent(paragraphs[1]), NewEmail, 'Go-like fixture text is data, never another evaluation pass');
  assert.equal(attribute(paragraphs[1], 'title'), NewEmail);
  assert.equal(elements.some(node => ['img', 'script'].includes(node.tagName)), false);
  assert.equal(elements.some(node => node.attrs?.some(({name}) => /^on/i.test(name))), false);
});

test('the real email-change template preserves hostile recipient text and creates no injected elements', () => {
  const Email = '<img src=x onerror=alert(1)>@example.invalid';
  const NewEmail = '"/><script>alert(2)</script>@example.invalid';
  for (const locale of ['en', 'ro']) {
    const html = renderPreview('email_change', locale, {Email, NewEmail});
    const {nodes, elements} = assertPassiveEmail(html);
    const body = textContent(one(nodes, 'body'));
    assert.ok(body.includes(Email));
    assert.ok(body.includes(NewEmail));
    assert.equal(elements.some(node => node.tagName === 'script'), false);
    assert.equal(elements.filter(node => node.tagName === 'img').length, 2, 'Only the actual brand logo variants, no injected image');
  }
});

test('email reauthentication is Token-only, invite and email change use account-page token-hash links, the others the confirmation link', () => {
  for (const kind of KINDS) for (const locale of ['en', 'ro']) {
    const source = renderTemplate(kind);
    const html = renderPreview(kind, locale);
    const {nodes, elements} = documentOf(html);
    const confirmationLinks = elements.filter(node => node.tagName === 'a' && attribute(node, 'href') === CONFIRMATION_URL);
    const bodyText = textContent(one(nodes, 'body'));
    if (kind === 'reauthentication') {
      assert.match(source, /\{\{\s*\.Token\s*\}\}/);
      assert.doesNotMatch(source, /\{\{\s*\.ConfirmationURL\s*\}\}/);
      assert.ok(bodyText.includes(TOKEN));
      assert.equal(confirmationLinks.length, 0);
      assert.ok(bodyText.includes(STRINGS.en.codeHelp), 'Email OTP is distinguished from authenticator TOTP');
    } else if (kind === 'invite' || kind === 'email_change') {
      // Token-hash links to the account page, verified there by an explicit POST.
      assert.equal(source.split(`href="{{ .SiteURL }}?token_hash={{ .TokenHash }}&amp;type=${kind}"`).length - 1, 2);
      assert.doesNotMatch(source, /\{\{\s*\.(?:ConfirmationURL|Token)\s*\}\}/);
      assert.ok(confirmationLinks.length >= 1);
      assert.equal(bodyText.includes(TOKEN), false);
    } else {
      assert.match(source, /\{\{\s*\.ConfirmationURL\s*\}\}/);
      assert.doesNotMatch(source, /\{\{\s*\.Token\s*\}\}/);
      assert.ok(confirmationLinks.length >= 1);
      assert.equal(bodyText.includes(TOKEN), false);
    }
  }
});

test('the documented Go subset supports repeated locale branches and else-if without cross-branch output', () => {
  const branch = '{{ if eq $locale "ro" }}RO{{ else if eq $locale "en" }}EN{{ else }}FALLBACK{{ end }}';
  const template = `${DECLARATION}<html lang="${branch}"><head><title>${branch}</title></head><body><p>${branch}</p></body></html>`;
  for (const [locale, expected] of [['ro', 'RO'], ['en', 'EN'], ['unknown', 'FALLBACK']]) {
    const {nodes} = documentOf(evaluateTemplate(template, syntheticFixture(locale)));
    assert.equal(attribute(one(nodes, 'html'), 'lang'), expected);
    assert.equal(textContent(one(nodes, 'title')), expected);
    assert.equal(textContent(one(nodes, 'p')), expected);
  }
});

test('unknown fields/functions and malformed Go control actions are refused instead of left in rendered mail', () => {
  const invalid = [
    '{{ .Secret }}', '{{ .Data.password }}', '{{ printf "%s" .Email }}', '{{ template "other" . }}',
    '{{ range .Data }}x{{ end }}', '{{ $other := .Email }}', '{{ if .Email }}x{{ end }}',
    '{{ if eq $locale "ro" }}{{ unknown .Email }}{{ else }}EN{{ end }}',
    '{{ else }}', '{{ end }}', '{{ if eq $locale "ro" }}missing end',
    '{{ if eq $locale "ro" }}RO{{ else }}EN{{ else }}again{{ end }}',
    '{{ if eq $locale "ro" }}RO{{ else }}EN{{ else if eq $locale "en" }}late{{ end }}',
    '{{ .Email }', '{{ .Email ', '{{',
  ];
  for (const action of invalid) {
    assert.throws(() => evaluateTemplate(`${DECLARATION}<html><body>${action}</body></html>`, syntheticFixture()), `Refuse ${action}`);
  }
});
