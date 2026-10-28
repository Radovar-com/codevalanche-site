import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('security.txt names the public contact and a policy on this site, and is renewed before it expires', async () => {
  const fields = new Map((await read('src/.well-known/security.txt')).split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
  assert.equal(fields.get('Contact'), 'mailto:security@radovar.com');
  assert.equal(fields.get('Canonical'), 'https://codevalanche.com/.well-known/security.txt');
  for (const field of ['Policy', 'Acknowledgments']) assert.match(fields.get(field), /^https:\/\/codevalanche\.com\/security\/#/);
  const daysLeft = (Date.parse(fields.get('Expires')) - Date.now()) / 86_400_000;
  assert.ok(daysLeft > 30, 'Expires is less than 30 days away: move it forward, at most one year');
  assert.ok(daysLeft <= 366, 'Expires must stay within one year (RFC 9116)');
});

test('the security page has the anchors security.txt points to', async () => {
  const page = await read('src/security/index.html');
  for (const id of ['report', 'thanks']) assert.match(page, new RegExp(`id="${id}"`));
});

test('the Pages artifact keeps the .well-known folder', async () => {
  assert.match(await read('.github/workflows/deploy-pages.yml'), /include-hidden-files: true/);
});
