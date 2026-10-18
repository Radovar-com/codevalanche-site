import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, readFile, realpath, rm, stat, readdir } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { once } from 'node:events';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repositoryRoot } from './security-operations.mjs';

const execFileAsync = promisify(execFile);
const MAGIC = Buffer.from('CVBAK1\n');
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const SAFE_REF = /^[a-z]{20}$/;

function requireValue(value, code) { if (!value || /[\r\n\0]/.test(value)) throw new Error(code); return value; }
function baseChildEnv(env = process.env) {
  // Do not pass unrelated tokens, backup keys, libpq service files or inherited PG options.
  return Object.fromEntries(Object.entries(env).filter(([name]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|COMSPEC)$/i.test(name)));
}

export function sourceConnection(environment, env = process.env) {
  const ref = environment.projectRef;
  const host = env.SECURITY_SOURCE_PGHOST;
  const user = env.SECURITY_SOURCE_PGUSER;
  if (!SAFE_REF.test(ref) || !((host === `db.${ref}.supabase.co` && user === 'postgres') || (/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user === `postgres.${ref}`)) || (env.SECURITY_SOURCE_PGPORT && env.SECURITY_SOURCE_PGPORT !== '5432')) throw new Error('source_connection_mismatch');
  if (env.SECURITY_SOURCE_PGSSLROOTCERT && !path.isAbsolute(env.SECURITY_SOURCE_PGSSLROOTCERT)) throw new Error('source_certificate_path_invalid');
  return { PGHOST: host, PGPORT: '5432', PGUSER: user, PGDATABASE: 'postgres',
    PGPASSWORD: requireValue(env.SECURITY_SOURCE_PGPASSWORD, 'source_password_missing'),
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: env.SECURITY_SOURCE_PGSSLROOTCERT ?? 'system', PGCONNECT_TIMEOUT: '15',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=300000' };
}

export function restoreConnection(env = process.env) {
  if (env.SECURITY_RESTORE_PGHOST !== '127.0.0.1' || !/^security_restore_[a-f0-9]{16}$/.test(env.SECURITY_RESTORE_PGDATABASE) || env.SECURITY_RESTORE_PGUSER !== 'postgres' || !['5432', '54322', undefined].includes(env.SECURITY_RESTORE_PGPORT)) throw new Error('restore_connection_rejected');
  return { PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: env.SECURITY_RESTORE_PGPORT ?? '54322',
    PGUSER: 'postgres', PGDATABASE: env.SECURITY_RESTORE_PGDATABASE,
    PGPASSWORD: requireValue(env.SECURITY_RESTORE_PGPASSWORD, 'restore_password_missing'),
    PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10', PGOPTIONS: '-c statement_timeout=300000' };
}

export async function checkedDirectory(directory, repo = repositoryRoot) {
  if (!path.isAbsolute(directory)) throw new Error('backup_directory_must_be_absolute');
  const resolved = await realpath(directory);
  const root = await realpath(repo);
  const relative = path.relative(root, resolved);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('backup_directory_inside_repository');
  for (let ancestor = resolved; ; ancestor = path.dirname(ancestor)) {
    try { await access(path.join(ancestor, '.git')); throw new Error('backup_directory_inside_repository'); }
    catch (error) { if (error.message === 'backup_directory_inside_repository') throw error; if (error.code !== 'ENOENT') throw new Error('backup_directory_not_verified'); }
    if (path.dirname(ancestor) === ancestor) break;
  }
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error('backup_directory_not_directory');
  if (process.platform === 'win32') {
    const check = "$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:SECURITY_BACKUP_DIRECTORY; $u=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $ok=$a.AreAccessRulesProtected; foreach($r in $a.Access){if($r.AccessControlType -eq 'Allow'){try{$s=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value}catch{$ok=$false;continue};if($s -notin @($u,'S-1-5-18','S-1-5-32-544')){$ok=$false}}}; if(-not $ok){exit 2}; 'protected'";
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', check], { windowsHide: true, timeout: 15_000, env: { ...baseChildEnv(), SECURITY_BACKUP_DIRECTORY: resolved } });
      if (stdout.trim() !== 'protected') throw new Error();
    } catch { throw new Error('backup_directory_acl_unqualified'); }
  } else if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error('backup_directory_acl_unqualified');
  return resolved;
}

export async function encryptArchive(source, file, key, metadata) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('backup_key_invalid');
  if (!SAFE_REF.test(metadata.projectRef) || !['production', 'staging'].includes(metadata.environment)) throw new Error('backup_metadata_invalid');
  const scope = metadata.scope ?? 'postgres-custom-archive';
  if (!['postgres-custom-archive', 'legacy-application-snapshot'].includes(scope)) throw new Error('backup_metadata_invalid');
  const iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({ version: 1, projectRef: metadata.projectRef, environment: metadata.environment, createdAt: new Date().toISOString(), iv: iv.toString('base64'), scope }));
  const size = Buffer.alloc(4); size.writeUInt32BE(header.length);
  const prefix = Buffer.concat([MAGIC, size, header]);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(prefix);
  const output = createWriteStream(file, { flags: 'wx', mode: 0o600 });
  let created = false;
  try {
    await once(output, 'open'); created = true;
    await new Promise((resolve, reject) => output.write(prefix, error => error ? reject(error) : resolve()));
    let length = 0; let signature = Buffer.alloc(0);
    const limit = new Transform({ transform(chunk, encoding, callback) {
      length += chunk.length;
      if (signature.length < 5) signature = Buffer.concat([signature, chunk]).subarray(0, 5);
      callback(length > MAX_ARCHIVE_BYTES ? new Error('backup_size_limit') : null, chunk);
    }, flush(callback) { callback((scope === 'postgres-custom-archive' ? signature.toString() === 'PGDMP' : signature[0] === 123) ? null : new Error('backup_archive_invalid')); } });
    // Append authentication tag only after every encrypted chunk was written successfully.
    await pipeline(source, limit, cipher, output, { end: false });
    await new Promise((resolve, reject) => output.end(cipher.getAuthTag(), error => error ? reject(error) : resolve()));
  } catch (error) { output.destroy(); if (created) await rm(file, { force: true }); throw error; }
}

export async function decryptArchive(file, key, expectedProjectRef, maxBytes = MAX_ARCHIVE_BYTES + 8192) {
  const info = await stat(file);
  if (info.size > maxBytes) throw new Error('backup_size_limit');
  const sealed = await readFile(file);
  if (sealed.length < MAGIC.length + 4 + 16 || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('backup_format_invalid');
  const headerLength = sealed.readUInt32BE(MAGIC.length);
  const offset = MAGIC.length + 4 + headerLength;
  if (headerLength > 8192 || offset + 16 >= sealed.length) throw new Error('backup_format_invalid');
  let metadata;
  try { metadata = JSON.parse(sealed.subarray(MAGIC.length + 4, offset)); } catch { throw new Error('backup_format_invalid'); }
  if (metadata.projectRef !== expectedProjectRef) throw new Error('backup_source_mismatch');
  if (metadata.version !== 1 || !['production', 'staging'].includes(metadata.environment) || !['postgres-custom-archive','legacy-application-snapshot'].includes(metadata.scope) || !/^[A-Za-z0-9+/]{16}$/.test(metadata.iv)) throw new Error('backup_format_invalid');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(metadata.iv, 'base64'));
    decipher.setAAD(sealed.subarray(0, offset)); decipher.setAuthTag(sealed.subarray(-16));
    // Authenticate the complete archive in memory before any bytes reach pg_restore.
    const bytes = Buffer.concat([decipher.update(sealed.subarray(offset, -16)), decipher.final()]);
    if (metadata.scope === 'postgres-custom-archive' ? bytes.subarray(0, 5).toString() !== 'PGDMP' : bytes[0] !== 123) throw new Error();
    return { metadata, bytes };
  } catch { throw new Error('backup_authentication_failed'); }
}

export function backupKey(env = process.env) {
  const encoded = env.SECURITY_BACKUP_KEY;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded ?? '')) throw new Error('backup_key_invalid');
  const key = Buffer.from(encoded, 'base64'); if (key.length !== 32) throw new Error('backup_key_invalid'); return key;
}

export function postgresFailureCode(stderr) {
  if (/extension [^\r\n]+ is not available/.test(stderr)) return 'postgres_extension_unavailable';
  if (/role [^\r\n]+ does not exist/.test(stderr)) return 'postgres_role_unavailable';
  if (/permission denied/.test(stderr)) return 'postgres_permission_denied';
  return 'postgres_tool_failed';
}

function child(binary, args, connection) {
  const process = spawn(binary, args, { windowsHide: true, shell: false, env: { ...baseChildEnv(), ...connection }, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '';
  process.stderr.on('data', chunk => { if (diagnostics.length < 65_536) diagnostics += chunk.toString('utf8').slice(0, 65_536 - diagnostics.length); });
  const completion = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { process.kill(); reject(new Error('postgres_tool_timeout')); }, 360_000);
    process.once('error', () => { clearTimeout(timer); reject(new Error('postgres_tool_unavailable')); });
    process.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(postgresFailureCode(diagnostics))); diagnostics = ''; });
  });
  // Attach immediately: process exit can precede a stream failure or metadata inspection.
  completion.catch(() => {});
  return { process, completion };
}

async function command(binary, args, connection, input) {
  const run = child(binary, args, connection);
  const chunks = []; let size = 0;
  const consume = (async () => { for await (const chunk of run.process.stdout) { size += chunk.length; if (size > 2 * 1024 * 1024) { run.process.kill(); throw new Error('postgres_metadata_size_limit'); } chunks.push(chunk); } })();
  run.process.stdin.on('error', () => {});
  run.process.stdin.end(input);
  await Promise.all([run.completion, consume]);
  return Buffer.concat(chunks).toString('utf8');
}
export { command as runPostgresCommand };

export async function main(args = process.argv.slice(2)) {
  const [mode, environmentName, directory, artifact] = args;
  if (!['capture', 'restore'].includes(mode) || !environmentName || !directory || (mode === 'restore' && !artifact) || args.length > 4) throw new Error('backup_usage_invalid');
  const policy = JSON.parse(await readFile(path.join(repositoryRoot, 'ops/security-operations-policy.json'), 'utf8'));
  const environment = policy.environments.find(row => row.name === environmentName);
  if (!environment) throw new Error('unknown_environment');
  const protectedDirectory = await checkedDirectory(directory);
  const key = backupKey();
  const report = { version: 1, environment: environment.name, projectRef: environment.projectRef, fullProjectRecoveryVerified: false, offDeviceRecoveryVerified: false };
  if (mode === 'capture') {
    const connection = sourceConnection(environment);
    const file = path.join(protectedDirectory, `${environment.name}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.cvbak`);
    const run = child(process.env.SECURITY_PG_DUMP || 'pg_dump', ['--format=custom', '--no-password', '--lock-wait-timeout=10s'], connection);
    run.process.stdin.end();
    try {
      await Promise.all([encryptArchive(run.process.stdout, file, key, { projectRef: environment.projectRef, environment: environment.name }), run.completion]);
      const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
      Object.assign(report, { status: 'encrypted_archive_captured', artifact: path.basename(file), encryptedSha256: hash.digest('hex'), encryptedBytes: (await stat(file)).size, restoreVerified: false });
    } catch (error) { run.process.kill(); await rm(file, { force: true }); throw error; }
  } else {
    const connection = restoreConnection();
    const actualFile = await realpath(artifact);
    if (path.dirname(actualFile) !== protectedDirectory) throw new Error('backup_artifact_outside_protected_directory');
    const restored = await decryptArchive(actualFile, key, environment.projectRef);
    if (restored.metadata.scope !== 'postgres-custom-archive') throw new Error('backup_scope_mismatch');
    const psql = process.env.SECURITY_PSQL || 'psql';
    const target = JSON.parse((await command(psql, ['--no-password', '--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command', "select json_build_object('database',current_database(),'loopback',inet_server_addr()='127.0.0.1'::inet,'user_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and c.relkind in ('r','p')),'other_sessions',(select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()))"], connection)).trim());
    if (target.database !== connection.PGDATABASE || target.loopback !== true || target.user_tables !== 0 || target.other_sessions !== 0) throw new Error('restore_target_not_empty_isolated_local_database');
    const pgRestore = process.env.SECURITY_PG_RESTORE || 'pg_restore';
    const toc = await command(pgRestore, ['--list'], connection, restored.bytes);
    if (!/TABLE DATA auth users\s/m.test(toc) || !/TABLE DATA auth identities\s/m.test(toc)) throw new Error('archive_auth_scope_incomplete');
    await command(pgRestore, ['--exit-on-error', '--single-transaction', '--no-password', '--dbname', connection.PGDATABASE], connection, restored.bytes);
    const verify = JSON.parse((await command(psql, ['--no-password', '--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command', "select json_build_object('auth_users',to_regclass('auth.users') is not null,'auth_identities',to_regclass('auth.identities') is not null,'public_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')))"], connection)).trim());
    if (verify.auth_users !== true || verify.auth_identities !== true || verify.public_tables < 1) throw new Error('restore_catalog_incomplete');
    restored.bytes.fill(0);
    Object.assign(report, { status: 'local_database_archive_restored', archiveAuthenticationVerified: true, databaseArchiveRestoreVerified: true, managedAuthLoginVerified: false, storageObjectsVerified: false, configurationAndKeysVerified: false });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    const safe = /^(backup_|source_|restore_|postgres_|archive_|unknown_environment)/.test(error.message) && /^[a-z_]+$/.test(error.message) ? error.message : 'security_backup_failed';
    process.stderr.write(`${safe}\n`); process.exitCode = 1;
  });
}
