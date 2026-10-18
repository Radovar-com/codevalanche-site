import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
test('environment files remain ignored at the root and in nested tool directories', () => {
  const candidates = ['.env', '.env.local', '.env.production', 'ops/.env', 'ops/.env.staging', 'secrets.env', '.superpowers/security-20261018/receipt.json'];
  const checked = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: root, input: candidates.join('\n') + '\n', encoding: 'utf8' });
  assert.ok(checked.status === 0 || checked.status === 1, 'Git ignore inspection succeeds');
  const ignored = checked.stdout.trim().split(/\r?\n/);
  assert.deepEqual(ignored, candidates);
  const tracked = execFileSync('git', ['ls-files', '--', '.env*', '**/.env*', '*.env', '.superpowers'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.trim(), '', 'no environment file or private scratch is already tracked');
});
