import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { backupSummary, maintenanceSummary, inspectEnvironment } from './security-operations.mjs';
import { sourceConnection, restoreConnection, checkedDirectory, encryptArchive, decryptArchive, postgresFailureCode } from './security-operations-backup.mjs';

const ref = 'umpybznthsfehmdvmfly';
const environment = { name: 'staging', projectRef: ref, projectName: 'codevalanche-analytics-test-20261015' };

test('Postgres diagnostics report a bounded failure category without database values', () => {
  assert.equal(postgresFailureCode('ERROR: extension "private-extension" is not available'), 'postgres_extension_unavailable');
  assert.equal(postgresFailureCode('ERROR: role "private-owner-email" does not exist'), 'postgres_role_unavailable');
  assert.equal(postgresFailureCode('ERROR: permission denied for table private-user-data'), 'postgres_permission_denied');
  assert.equal(postgresFailureCode('private-password-and-full-SQL'), 'postgres_tool_failed');
});

test('a provider WAL flag without restore points cannot qualify recovery', () => {
  assert.deepEqual(backupSummary({ backups: null, physical_backup_data: {}, walg_enabled: true, pitr_enabled: false }), {
    status: 'no_restore_point_observed', completedRestorePoints: 0, latestCompletedAt: null, pitrEnabled: false, walEnabled: true, recoveryQualified: false,
  });
});

test('failed and malformed backup entries cannot become a usable latest backup', () => {
  const result = backupSummary({ backups: [{ status: 'FAILED', inserted_at: '2026-10-18T10:00:00Z' }, { status: 'COMPLETED', inserted_at: 'not-a-date' }, { status: 'COMPLETED', inserted_at: '2026-10-17T10:00:00Z' }], pitr_enabled: true });
  assert.equal(result.completedRestorePoints, 1);
  assert.equal(result.latestCompletedAt, '2026-10-17T10:00:00.000Z');
  assert.equal(result.recoveryQualified, false);
});

test('fresh SQL scheduler success cannot hide failed logical retention', () => {
  const result = maintenanceSummary({ jobs: [{ active: true, schedule: '17 2 * * *', command_matches: true }], state: [{ status: 'failed', last_success_at: '2026-10-18T02:17:00Z' }], runs: [{ status: 'succeeded' }] }, new Date('2026-10-18T03:00:00Z'));
  assert.equal(result.status, 'attention');
  assert.ok(result.reasons.includes('logical_maintenance_not_succeeded'));
});

test('an old maintenance success is reported stale', () => {
  const result = maintenanceSummary({ jobs: [{ active: true, schedule: '17 2 * * *', command_matches: true }], state: [{ status: 'succeeded', last_success_at: '2026-10-15T02:17:00Z' }], runs: [{ status: 'succeeded' }] }, new Date('2026-10-18T03:00:00Z'));
  assert.equal(result.status, 'attention');
  assert.ok(result.reasons.includes('maintenance_success_stale'));
});

test('a current successful job remains separate from external alerting and recovery', () => {
  const result = maintenanceSummary({ jobs: [{ active: true, schedule: '17 2 * * *', command_matches: true }], state: [{ status: 'succeeded', last_success_at: '2026-10-18T02:17:00Z' }], runs: [{ status: 'succeeded' }] }, new Date('2026-10-18T03:00:00Z'));
  assert.equal(result.status, 'observed_healthy');
  assert.equal(result.externalAlertDeliveryVerified, false);
});

test('unexpected project identity prevents further project checks', async () => {
  let calls = 0;
  const result = await inspectEnvironment(environment, async () => { calls++; return [{ id: ref, name: 'production' }]; });
  assert.equal(result.status, 'project_identity_mismatch');
  assert.equal(calls, 1);
});

test('CLI failures become bounded status codes without exposing error text', async () => {
  const result = await inspectEnvironment(environment, async () => { throw new Error('Bearer secret-password-private-email'); });
  assert.equal(result.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /secret|password|email|Bearer/);
});

test('database password remains in child environment and is never a command argument', () => {
  const result = sourceConnection(environment, { SECURITY_SOURCE_PGHOST: `db.${ref}.supabase.co`, SECURITY_SOURCE_PGUSER: 'postgres', SECURITY_SOURCE_PGPASSWORD: 'private-password' });
  assert.equal(result.PGPASSWORD, 'private-password');
  assert.equal(result.PGSSLMODE, 'verify-full');
  assert.equal(result.PGOPTIONS, '-c default_transaction_read_only=on -c statement_timeout=300000');
  assert.equal(result.PGSERVICE, undefined);
});

test('source credentials cannot be redirected to an unapproved project or host', () => {
  for (const host of ['db.hvevaxsfeyiikjhcsafi.supabase.co', 'attacker.example', 'localhost']) {
    assert.throws(() => sourceConnection(environment, { SECURITY_SOURCE_PGHOST: host, SECURITY_SOURCE_PGUSER: 'postgres', SECURITY_SOURCE_PGPASSWORD: 'password' }), /source_connection_mismatch/);
  }
});

test('session pooler source must bind its username to the expected project', () => {
  assert.throws(() => sourceConnection(environment, { SECURITY_SOURCE_PGHOST: 'aws-0-eu-central-1.pooler.supabase.com', SECURITY_SOURCE_PGUSER: 'postgres.hvevaxsfeyiikjhcsafi', SECURITY_SOURCE_PGPASSWORD: 'password' }), /source_connection_mismatch/);
  assert.equal(sourceConnection(environment, { SECURITY_SOURCE_PGHOST: 'aws-0-eu-central-1.pooler.supabase.com', SECURITY_SOURCE_PGUSER: `postgres.${ref}`, SECURITY_SOURCE_PGPASSWORD: 'password' }).PGPORT, '5432');
});

test('restore never accepts a remote host, normal database name, socket or arbitrary libpq options', () => {
  const valid = { SECURITY_RESTORE_PGHOST: '127.0.0.1', SECURITY_RESTORE_PGDATABASE: 'security_restore_1234567890abcdef', SECURITY_RESTORE_PGUSER: 'postgres', SECURITY_RESTORE_PGPASSWORD: 'password', PGSERVICE: 'remote-production', PGOPTIONS: '-c dangerous=1' };
  for (const override of [{ SECURITY_RESTORE_PGHOST: 'db.hvevaxsfeyiikjhcsafi.supabase.co' }, { SECURITY_RESTORE_PGHOST: 'localhost' }, { SECURITY_RESTORE_PGHOST: '/var/run/postgresql' }, { SECURITY_RESTORE_PGDATABASE: 'postgres' }, { SECURITY_RESTORE_PGPORT: '6543' }]) {
    assert.throws(() => restoreConnection({ ...valid, ...override }), /restore_connection_rejected/);
  }
  const result = restoreConnection(valid);
  assert.equal(result.PGHOSTADDR, '127.0.0.1');
  assert.equal(result.PGSERVICE, undefined);
  assert.equal(result.PGOPTIONS, '-c statement_timeout=300000');
});

test('backup output cannot be written inside a repository or through an internal symlink', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'security-ops-path-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo');
  await mkdir(repo);
  await assert.rejects(checkedDirectory(repo, repo), /backup_directory_inside_repository/);
  if (process.platform !== 'win32') {
    const link = path.join(dir, 'link');
    await symlink(repo, link);
    await assert.rejects(checkedDirectory(link, repo), /backup_directory_inside_repository/);
  }
});

test('encrypted backup roundtrip preserves archive bytes without putting plaintext in the file', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'security-ops-crypto-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'backup.cvbak');
  const key = randomBytes(32);
  const plaintext = Buffer.from('PGDMP synthetic-auth-fixture-only');
  await encryptArchive(Readable.from([plaintext]), file, key, { projectRef: ref, environment: 'staging' });
  assert.ok(!(await readFile(file)).includes(plaintext));
  const decrypted = await decryptArchive(file, key, ref);
  assert.deepEqual(decrypted.bytes, plaintext);
  assert.equal(decrypted.metadata.projectRef, ref);
  await assert.rejects(encryptArchive(Readable.from([plaintext]), file, key, { projectRef: ref, environment: 'staging' }), /EEXIST/);
});

test('a bounded application snapshot keeps its distinct scope through encryption', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'security-ops-snapshot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'application.cvbak');
  const key = randomBytes(32);
  const bytes = Buffer.from('{"format":1,"tables":{}}');
  await encryptArchive(Readable.from([bytes]), file, key, { projectRef: ref, environment: 'production', scope: 'legacy-application-snapshot' });
  const result = await decryptArchive(file, key, ref);
  assert.equal(result.metadata.scope, 'legacy-application-snapshot');
  assert.deepEqual(result.bytes, bytes);
});

test('tampering, a wrong key and source mismatch are rejected before restore gets bytes', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'security-ops-auth-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'backup.cvbak');
  const key = randomBytes(32);
  await encryptArchive(Readable.from([Buffer.from('PGDMP synthetic')]), file, key, { projectRef: ref, environment: 'staging' });
  await assert.rejects(decryptArchive(file, randomBytes(32), ref), /backup_authentication_failed/);
  await assert.rejects(decryptArchive(file, key, 'hvevaxsfeyiikjhcsafi'), /backup_source_mismatch/);
  const bytes = await readFile(file);
  bytes[bytes.length - 20] ^= 1;
  await writeFile(file, bytes);
  await assert.rejects(decryptArchive(file, key, ref), /backup_authentication_failed/);
});

test('oversized or malformed encrypted files are refused before allocating archive memory', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'security-ops-size-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'backup.cvbak');
  const key = randomBytes(32);
  await encryptArchive(Readable.from([Buffer.from('PGDMP synthetic')]), file, key, { projectRef: ref, environment: 'staging' });
  await assert.rejects(decryptArchive(file, key, ref, 4), /backup_size_limit/);
  await writeFile(file, 'invalid');
  await assert.rejects(decryptArchive(file, key, ref), /backup_format_invalid/);
});
