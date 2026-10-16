import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Codevalanche homepage declares the Radovar and Codevalanche Schema.org graph', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, 'homepage contains JSON-LD structured data');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@context'], 'https://schema.org');
  assert.deepEqual(schema['@graph'].map(node => node['@type']), ['Organization', 'SoftwareApplication', 'WebSite']);
  assert.equal(schema['@graph'][0].name, 'Radovar');
  assert.equal(schema['@graph'][1].name, 'Codevalanche');
  assert.deepEqual(schema['@graph'][1].publisher, { '@id': 'https://radovar.com/#organization' });
});
