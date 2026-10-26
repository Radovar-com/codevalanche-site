// Direct Data API privileges. RPC-only storage deliberately has no service grant:
// SECURITY DEFINER owns its table operations; callers only need EXECUTE.
export const tableAccess = {
  codevalanche_account_erasure_jobs: 'SELECT',
  codevalanche_account_state: 'SELECT INSERT UPDATE DELETE',
  codevalanche_admin_access_log: 'SELECT INSERT',
  codevalanche_admin_audit: 'SELECT',
  codevalanche_admin_memberships: 'SELECT',
  codevalanche_analytics_v2: 'SELECT',
  codevalanche_auth_correlation_config: '',
  codevalanche_auth_operation_attempts: '',
  codevalanche_credential_events: 'SELECT INSERT DELETE',
  codevalanche_download_counts: 'SELECT',
  codevalanche_events: 'SELECT INSERT UPDATE DELETE',
  codevalanche_feedback: 'SELECT INSERT UPDATE DELETE',
  codevalanche_mfa_recovery_codes: 'SELECT INSERT UPDATE DELETE',
  codevalanche_native_ledger_producers: '',
  codevalanche_native_ledger_receipts: '',
  codevalanche_native_receipt_ownership: '',
  codevalanche_notification_outbox: 'SELECT',
  codevalanche_operation_jobs: 'SELECT',
  codevalanche_operator_oauth_proofs: '',
  codevalanche_profile_requests: 'SELECT INSERT DELETE',
  codevalanche_profiles: 'SELECT INSERT UPDATE DELETE',
  codevalanche_project_bindings: '',
  codevalanche_provider_event_cursor: 'SELECT',
  codevalanche_rate_limits: 'SELECT INSERT UPDATE DELETE',
  codevalanche_revoked_sessions: 'SELECT INSERT UPDATE DELETE',
  codevalanche_security_events: 'SELECT INSERT',
  codevalanche_suspension_expiry_jobs: 'SELECT',
  wa_consent_receipts: 'SELECT INSERT UPDATE DELETE',
  wa_daily_rollups: 'SELECT INSERT UPDATE DELETE',
  wa_data_health: 'SELECT INSERT UPDATE DELETE',
  wa_download_daily: 'SELECT INSERT UPDATE DELETE',
  wa_download_requests: 'SELECT INSERT UPDATE DELETE',
  wa_events: 'SELECT INSERT UPDATE DELETE',
  wa_maintenance_state: 'SELECT',
  wa_profile_outcomes: 'SELECT INSERT UPDATE DELETE',
  wa_profile_source_state: 'SELECT',
  wa_provider_session_receipts: 'SELECT',
  wa_provider_session_source: 'SELECT',
  wa_rate_limits: 'SELECT INSERT UPDATE DELETE',
  wa_receipt_account_bindings: 'SELECT INSERT UPDATE DELETE',
  wa_report_state: 'SELECT INSERT UPDATE DELETE',
  wa_rollup_coverage: 'SELECT INSERT UPDATE DELETE',
  wa_sessions: 'SELECT INSERT UPDATE DELETE',
  wa_source_snapshots: 'SELECT INSERT UPDATE DELETE',
};

export async function tableAccessViolations(db) {
  const errors = [];
  const tables = (await db.query(`select c.oid,c.relname,c.relrowsecurity,
    pg_get_userbyid(c.relowner) owner from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by c.relname`)).rows;
  const roles = (await db.query(`select rolname from pg_roles where rolname in ('anon','authenticated','service_role')
    or rolname like 'codevalanche_%' order by rolname`)).rows.map(r => r.rolname);
  const privileges = ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
  const effectiveGrants = (await db.query(`select c.oid,r.rolname,p.privilege,
    has_table_privilege(r.rolname,c.oid,p.privilege) allowed
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join pg_roles r cross join unnest($1::text[]) p(privilege)
    where n.nspname='public' and c.relkind in ('r','p')
    and (r.rolname in ('anon','authenticated','service_role') or r.rolname like 'codevalanche_%')`,[privileges])).rows;
  const effectiveMap = new Map(effectiveGrants.map(g => [`${g.oid}:${g.rolname}:${g.privilege}`,g.allowed]));
  for (const table of tables) {
    const name = table.relname;
    if (!Object.hasOwn(tableAccess, name)) errors.push(`${name}: unreviewed public table`);
    if (!table.relrowsecurity) errors.push(`${name}: RLS disabled`);
    const acl = (await db.query(`select x.grantee,coalesce(r.rolname,'PUBLIC') role,x.privilege_type,x.is_grantable
      from pg_class c cross join lateral aclexplode(c.relacl) x
      left join pg_roles r on r.oid=x.grantee where c.oid=$1`, [table.oid])).rows;
    for (const entry of acl) {
      if (entry.role === table.owner) continue;
      const allowed = entry.role === 'service_role' ? (tableAccess[name] ?? '').split(' ')
        : entry.role === 'codevalanche_security_import_worker' && name === 'codevalanche_provider_event_cursor' ? ['SELECT'] : [];
      if (!allowed.includes(entry.privilege_type) || entry.is_grantable) errors.push(`${name}: explicit ${entry.role} ${entry.privilege_type}${entry.is_grantable ? ' WITH GRANT OPTION' : ''}`);
    }
    for (const role of roles) {
      const expected = role === 'service_role' ? (tableAccess[name] ?? '').split(' ').filter(Boolean)
        : role === 'codevalanche_security_import_worker' && name === 'codevalanche_provider_event_cursor' ? ['SELECT'] : [];
      for (const privilege of privileges) {
        const effective = effectiveMap.get(`${table.oid}:${role}:${privilege}`);
        if (effective !== expected.includes(privilege)) errors.push(`${name}: effective ${role} ${privilege}=${effective}`);
        if (expected.includes(privilege) && !acl.some(a => a.role === role && a.privilege_type === privilege)) errors.push(`${name}: missing explicit ${role} ${privilege}`);
      }
    }
    const columns = (await db.query(`select attname from pg_attribute where attrelid=$1 and attacl is not null`,[table.oid])).rows;
    if (columns.length) errors.push(`${name}: unreviewed column grants`);
  }
  for (const name of Object.keys(tableAccess)) if (!tables.some(t => t.relname === name)) errors.push(`${name}: missing table`);
  const policies = (await db.query(`select tablename,policyname,roles,cmd,qual,with_check,permissive
    from pg_policies where schemaname='public' order by tablename,policyname`)).rows;
  const expectedPolicies = [{tablename:'codevalanche_provider_event_cursor',policyname:'codevalanche_import_cursor_read',
    roles:['codevalanche_security_import_worker'],cmd:'SELECT',qual:'true',with_check:null,permissive:'PERMISSIVE'}];
  if (JSON.stringify(policies) !== JSON.stringify(expectedPolicies)) errors.push('public: unreviewed RLS policies');
  return errors;
}
