import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const workflow = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

// Examine indentation-bounded blocks so moving a permission to workflow scope
// cannot accidentally satisfy a check meant for one isolated job.
function block(source, key, indent) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(line => line === `${' '.repeat(indent)}${key}:`);
  assert.ok(start >= 0, `${key} block exists at indentation ${indent}`);
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].trimStart().startsWith('#') || lines[end].search(/\S/) > indent)) end++;
  return lines.slice(start + 1, end).join('\n');
}

test('pull requests run a read-only build while only trusted organization-main runs can publish', () => {
  assert.match(block(workflow, 'on', 0), /pull_request:\s*\n\s+branches: \[main\]/);
  assert.match(block(workflow, 'permissions', 0), /contents: read/);
  assert.doesNotMatch(block(workflow, 'permissions', 0), /pages: write|id-token: write/);
  assert.ok(block(workflow, 'concurrency', 0).includes("group: pages-${{ github.event_name == 'pull_request' && github.ref || 'publish' }}"), 'PR checks cannot cancel a main deployment');
  const jobs = block(workflow, 'jobs', 0);
  const build = block(jobs, 'build', 2), deploy = block(jobs, 'deploy', 2);
  assert.match(block(build, 'permissions', 4), /contents: read/);
  assert.doesNotMatch(build, /pages: write|id-token: write|environment:/);
  assert.match(build, /run: npm test/);
  assert.match(build, /run: npm run build/);
  assert.match(build, /actions\/upload-pages-artifact@/);
  assert.doesNotMatch(build, /actions\/deploy-pages@/);
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /if: github\.repository == 'Radovar-com\/codevalanche-site' && github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)/);
  assert.match(block(deploy, 'permissions', 4), /pages: write/);
  assert.match(block(deploy, 'permissions', 4), /id-token: write/);
  assert.match(deploy, /environment:\s*\n\s+name: github-pages/);
  assert.match(deploy, /actions\/deploy-pages@/);
  assert.match(build, /persist-credentials: false/);
});

test('actual deployment condition allows only organization main push/manual across repository, ref and event combinations', () => {
  const deploy = block(block(workflow, 'jobs', 0), 'deploy', 2);
  const expression = deploy.match(/^\s*if:\s*(.+)$/m)?.[1];
  assert.ok(expression, 'the deployment job has a condition');
  const condition = new Script(expression);
  for (const repository of ['Radovar-com/codevalanche-site', 'cata009/codevalanche-site', 'someone/codevalanche-site', 'Radovar-com/codevalanche-site-fork']) {
    for (const ref of ['refs/heads/main', 'refs/heads/feature', 'refs/pull/7/merge']) {
      for (const event_name of ['push', 'workflow_dispatch', 'pull_request', 'schedule']) {
        const actual = condition.runInNewContext({ github: { repository, ref, event_name } }, { timeout: 100 });
        const expected = repository === 'Radovar-com/codevalanche-site' && ref === 'refs/heads/main'
          && ['push', 'workflow_dispatch'].includes(event_name);
        assert.equal(actual, expected, JSON.stringify({ repository, ref, event_name }));
      }
    }
  }
});

test('Pages workflow pins each third-party action to a reviewed full commit SHA', () => {
  const references = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(v\S+))?\s*$/gm)].map(match => ({ ref: match[1], version: match[2] }));
  assert.ok(references.length >= 4);
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
