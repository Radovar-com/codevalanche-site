import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cliJson, repositoryRoot } from './security-operations.mjs';
import { checkedDirectory, backupKey, encryptArchive, decryptArchive, restoreConnection, runPostgresCommand } from './security-operations-backup.mjs';

const REF = 'hvevaxsfeyiikjhcsafi';
const TABLES = ['codevalanche_account_state', 'codevalanche_events', 'codevalanche_feedback', 'codevalanche_rate_limits', 'codevalanche_revoked_sessions'];
let phase='arguments';
const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const schemaCanonical = schema => canonical({ ...schema, functions: schema.functions.map(row => ({ ...row, definition: row.definition.replaceAll('\r\n','\n') })) });
const sqlSource = async name => (await readFile(path.join(repositoryRoot, `ops/security-operations-legacy-${name}.sql`), 'utf8')).trim().replace(/;$/, '');

export async function main(args = process.argv.slice(2)) {
  const [mode, directory, artifact] = args;
  if (!['capture', 'restore'].includes(mode) || !directory || (mode === 'restore' && !artifact) || args.length > 3) throw new Error('snapshot_usage_invalid');
  phase='directory';
  const protectedDirectory = await checkedDirectory(directory);
  phase='key';
  const key = backupKey();
  const report = { version: 1, projectRef: REF, source: 'production', scope: 'legacy_application_data', fullAuthBackup: false, authCredentialsIncluded: false, storageObjectsIncluded: false, fullProjectRecoveryVerified: false, offDeviceRecoveryVerified: false };
  phase='baseline';
  const baseline = await readFile(path.join(repositoryRoot, 'supabase/migrations/202609080001_account_service.sql'), 'utf8');
  const schemaSql = await sqlSource('schema'); const dataSql = await sqlSource('data');
  if (mode === 'capture') {
    const query = sql => cliJson(['db', 'query', '--linked', '--project-ref', REF, `/* fixed read-only security snapshot */\n${sql}`]);
    phase='bounds';
    const bounds = await query(await sqlSource('bounds'));
    if (bounds.rows?.[0]?.within_limits !== true) throw new Error('snapshot_bounds_exceeded');
    phase='source_read';
    const result = await query(`with s as (${schemaSql}), d as (${dataSql}) select jsonb_build_object('captured_at',statement_timestamp(),'schema',(select schema from s),'tables',(select tables from d)) as snapshot`);
    const snapshot = result.rows?.[0]?.snapshot;
    if (!snapshot || JSON.stringify(Object.keys(snapshot.tables).sort()) !== JSON.stringify(TABLES) || JSON.stringify(snapshot.schema.tables.map(row => row.name).sort()) !== JSON.stringify(TABLES)) throw new Error('snapshot_scope_mismatch');
    const bytes = Buffer.from(JSON.stringify({ format: 1, projectRef: REF, scope: 'legacy_application_data', baselineSha256: hash(baseline), ...snapshot }));
    if (bytes.length > 1024 * 1024) throw new Error('snapshot_bounds_exceeded');
    const file = path.join(protectedDirectory, `production-application-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.cvbak`);
    phase='encryption';
    await encryptArchive(Readable.from([bytes]), file, key, { projectRef: REF, environment: 'production', scope: 'legacy-application-snapshot' });
    bytes.fill(0);
    Object.assign(report, { status: 'encrypted_application_snapshot_captured', readOnlySingleStatementSnapshot: true, sizeAndRowBoundsChecked: true, tableScope: TABLES, artifact: path.basename(file), encryptedBytes: (await stat(file)).size, encryptedSha256: hash(await readFile(file)), restoreVerified: false });
  } else {
    const connection = restoreConnection();
    const file = await realpath(artifact);
    if (path.dirname(file) !== protectedDirectory) throw new Error('snapshot_artifact_outside_protected_directory');
    const archive = await decryptArchive(file, key, REF, 2 * 1024 * 1024);
    try {
      if (archive.metadata.scope !== 'legacy-application-snapshot') throw new Error('snapshot_scope_mismatch');
      const snapshot = JSON.parse(archive.bytes.toString('utf8'));
      if (snapshot.format !== 1 || snapshot.scope !== 'legacy_application_data' || snapshot.projectRef !== REF || snapshot.baselineSha256 !== hash(baseline) || JSON.stringify(Object.keys(snapshot.tables).sort()) !== JSON.stringify(TABLES)) throw new Error('snapshot_baseline_mismatch');
      const psql = process.env.SECURITY_PSQL || 'psql';
      const options = ['--no-password', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1'];
      const run = sql => runPostgresCommand(psql, options, connection, Buffer.from(`set standard_conforming_strings=on;\n${sql}`));
      const target = JSON.parse((await run("select json_build_object('database',current_database(),'loopback',inet_server_addr()='127.0.0.1'::inet,'user_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and c.relkind in ('r','p')),'other_sessions',(select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()));")).trim());
      if (target.database !== connection.PGDATABASE || target.loopback !== true || target.user_tables !== 0 || target.other_sessions !== 0) throw new Error('restore_target_not_empty_isolated_local_database');
      const anchors = [...new Set(TABLES.flatMap(table => snapshot.tables[table].map(row => row.user_id).filter(Boolean)))];
      if (anchors.some(id => !/^[a-f0-9-]{36}$/i.test(id))) throw new Error('snapshot_identity_invalid');
      const scaffold = `create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,updated_at timestamptz,user_agent text,not_after timestamptz); do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin;end if;end$$; insert into auth.users select jsonb_array_elements_text(${literal(anchors)})::uuid;`;
      await run(scaffold);
      await run(baseline);
      await run(`begin; set local timezone='UTC'; ${TABLES.map(table => `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},${literal(snapshot.tables[table])});`).join('\n')} commit;`);
      const restored = JSON.parse((await run(`set timezone='UTC'; with s as (${schemaSql}), d as (${dataSql}) select jsonb_build_object('schema',(select schema from s),'tables',(select tables from d));`)).trim());
      const dataMatched = canonical(restored.tables) === canonical(snapshot.tables);
      const schemaMatched = schemaCanonical(restored.schema) === schemaCanonical(snapshot.schema);
      const normalizedSourceSchema=JSON.parse(schemaCanonical(snapshot.schema));const normalizedRestoredSchema=JSON.parse(schemaCanonical(restored.schema));
      const schemaDifferences = Object.keys(snapshot.schema).filter(name => canonical(normalizedSourceSchema[name]) !== canonical(normalizedRestoredSchema[name]));
      const dataDifferences = TABLES.filter(name => canonical(restored.tables[name]) !== canonical(snapshot.tables[name]));
      Object.assign(report, { status: dataMatched && schemaMatched ? 'selected_application_scope_restored' : 'selected_application_restore_difference', archiveAuthenticationVerified: true, tableCount: TABLES.length, allRowDigestsMatched: dataMatched, ownedSchemaPrivilegesFunctionsMatched: schemaMatched, schemaDifferenceCategories: schemaDifferences, dataDifferenceTables: dataDifferences, comparisonNormalizations: ['UTC timestamp presentation','SQL function CRLF to LF only'], authScaffolding: 'ID-only users and empty sessions; no actual Auth credentials, identities, factors or sessions', restoreVerified: dataMatched && schemaMatched, fullAuthRestoreVerified: false });
    } finally { archive.bytes.fill(0); }
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return mode === 'capture' || report.restoreVerified ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    const safe = /^(snapshot_|backup_|restore_|postgres_)[a-z_]+$/.test(error.message) ? error.message : `snapshot_${phase}_failed`;
    process.stderr.write(`${safe}\n`); process.exitCode = 1;
  });
}
