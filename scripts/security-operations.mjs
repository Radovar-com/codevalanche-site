import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const policyPath = path.join(repositoryRoot, 'ops/security-operations-policy.json');

export function backupSummary(input = {}) {
  const completed = (Array.isArray(input.backups) ? input.backups : [])
    .filter(row => row.status === 'COMPLETED' && Number.isFinite(Date.parse(row.inserted_at)))
    .map(row => new Date(row.inserted_at).toISOString()).sort();
  return {
    status: completed.length ? 'restore_point_observed' : 'no_restore_point_observed',
    completedRestorePoints: completed.length, latestCompletedAt: completed.at(-1) ?? null,
    pitrEnabled: input.pitr_enabled === true, walEnabled: input.walg_enabled === true,
    recoveryQualified: false,
  };
}

export function maintenanceSummary(input = {}, now = new Date()) {
  const reasons = [];
  const jobs = input.jobs ?? [];
  const state = input.state?.[0];
  const run = input.runs?.[0];
  if (jobs.length !== 1 || jobs[0]?.active !== true || jobs[0]?.schedule !== '17 2 * * *' || jobs[0]?.command_matches !== true || jobs[0]?.database_matches === false || jobs[0]?.local_target === false) reasons.push('scheduler_not_qualified');
  if (state?.status !== 'succeeded') reasons.push('logical_maintenance_not_succeeded');
  const successTime = Date.parse(state?.last_success_at);
  if (!Number.isFinite(successTime) || now.getTime() - successTime > 30 * 60 * 60 * 1000 || successTime > now.getTime()) reasons.push('maintenance_success_stale');
  if (run?.status !== 'succeeded') reasons.push('latest_scheduler_run_not_succeeded');
  return {
    status: reasons.length ? 'attention' : 'observed_healthy', reasons,
    lastSuccessAt: Number.isFinite(successTime) ? new Date(successTime).toISOString() : null,
    latestSchedulerStatus: ['succeeded', 'failed', 'running', 'starting', 'connecting', 'sending'].includes(run?.status) ? run.status : null,
    externalAlertDeliveryVerified: false,
  };
}

// CLI uses its existing native credential store. Never use --debug or print its stderr:
// credentials, raw provider errors and database content do not belong in this report.
export async function cliJson(args, binary = process.env.SUPABASE_CLI || 'supabase') {
  try {
    const { stdout } = await execFileAsync(binary, [...args, '--output', 'json'], {
      cwd: repositoryRoot, windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return JSON.parse(stdout);
  } catch {
    throw new Error('supabase_read_unavailable');
  }
}

function rows(result) { return Array.isArray(result?.rows) ? result.rows : []; }
function catalogSummary(row = {}) {
  return {
    serverVersion: /^\d+\.\d+(?:\.\d+)?$/.test(row.server_version) ? row.server_version : null,
    migrationLedgerPresent: row.migrations_table_present === true,
    analyticsMaintenancePresent: row.analytics_maintenance_present === true,
    cronPresent: row.cron_present === true,
    publicTableCount: Number.isSafeInteger(row.public_table_count) ? row.public_table_count : null,
  };
}

export async function inspectEnvironment(environment, execute = cliJson, now = new Date()) {
  const report = { environment: environment.name, projectRef: environment.projectRef, observedAt: now.toISOString(), status: 'unavailable', recoveryQualified: false, externalAlertDeliveryVerified: false };
  try {
    const projects = await execute(['projects', 'list']);
    const project = Array.isArray(projects) ? projects.find(row => row.id === environment.projectRef) : null;
    if (!project || project.name !== environment.projectName) return { ...report, status: 'project_identity_mismatch' };
    report.projectStatus = ['ACTIVE_HEALTHY', 'INACTIVE', 'COMING_UP', 'ACTIVE_UNHEALTHY', 'GOING_DOWN'].includes(project.status) ? project.status : 'unknown';
    const query = name => execute(['db', 'query', '--linked', '--project-ref', environment.projectRef, '--file', path.join(repositoryRoot, `ops/security-operations-${name}.sql`)]);
    try { report.backups = backupSummary(await execute(['backups', 'list', '--project-ref', environment.projectRef])); }
    catch { report.backups = { status: 'unavailable', recoveryQualified: false }; }
    const catalog = catalogSummary(rows(await query('catalog'))[0]);
    report.catalog = catalog;
    if (catalog.migrationLedgerPresent) {
      const ledger = rows(await query('migrations')).map(row => row.version).filter(value => /^\d{12,14}$/.test(value));
      const local = (await readdir(path.join(repositoryRoot, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).map(name => name.split('_')[0]).sort();
      report.migrations = { appliedCount: ledger.length, localCount: local.length, missingLocalVersions: local.filter(version => !ledger.includes(version)), unexpectedAppliedVersions: ledger.filter(version => !local.includes(version)) };
    } else report.migrations = { status: 'no_ledger_observed', appliedCount: null };
    report.maintenance = catalog.analyticsMaintenancePresent && catalog.cronPresent
      ? maintenanceSummary(rows(await query('maintenance'))[0]?.maintenance, now)
      : { status: 'not_installed', externalAlertDeliveryVerified: false };
    report.status = 'observed';
  } catch { report.status = 'unavailable'; }
  return report;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length && args[0] !== '--environment') throw new Error('usage_readiness_environment');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const selected = args[1] ? policy.environments.filter(item => item.name === args[1]) : policy.environments;
  if (!selected.length || args.length > 2) throw new Error('unknown_environment');
  const environments = [];
  for (const environment of selected) environments.push(await inspectEnvironment(environment));
  const report = { version: 1, mode: 'read_only_metadata', environments, externalAlertDeliveryVerified: false, offDeviceRecoveryVerified: false, fullProjectRecoveryVerified: false };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // This is a readiness gate: observed metadata does not turn unqualified recovery green.
  return environments.every(item => item.status === 'observed' && item.recoveryQualified === true) ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(() => { process.stderr.write('security_operations_failed\n'); process.exitCode = 1; });
}
