import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

test('Pages workflow pins each third-party action to a reviewed full commit SHA', () => {
  const references = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#\s*(v\S+))?\s*$/gm)].map(match => ({ ref: match[1], version: match[2] }));
  assert.equal(references.length, 4);
  for (const action of references) assert.match(action.ref, /^[^@]+@[0-9a-f]{40}$/i, `${action.ref} must use a full SHA`);
  assert.ok(references.some(action => action.ref.startsWith('actions/checkout@') && action.version === 'v7.0.1'));
  assert.ok(references.some(action => action.ref.startsWith('actions/setup-node@') && action.version === 'v7.1.0'));
  assert.ok(references.some(action => action.ref.startsWith('actions/upload-pages-artifact@') && action.version === 'v5.0.0'));
  assert.ok(references.some(action => action.ref.startsWith('actions/deploy-pages@') && action.version === 'v5.0.1'));
});

test('Pages workflow installs the pinned runtime, audits dependencies and gates deployment on tests and export', () => {
  assert.match(workflow, /node-version:\s*24\.18\.1/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /run:\s*npm run locales:check/);
  assert.match(workflow, /run:\s*npm test/);
  assert.match(workflow, /run:\s*npm audit --audit-level=high/);
  assert.match(workflow, /run:\s*npm run build/);
  assert.match(workflow, /contents:\s*read/);
});
