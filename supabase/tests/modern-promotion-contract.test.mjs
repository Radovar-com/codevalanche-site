import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {createSqlFixture} from './sqlHarness.mjs';
import {V1_ACCOUNT_ACTIONS} from '../../src/account/helpers.js';
import {policyFromState} from '../functions/_shared/accountPolicy.ts';
import {authenticateAccountContext} from '../functions/_shared/accountPrincipal.ts';
import {validateLegacyClaims} from '../../deploy/legacy-security/supabase/functions/codevalanche-account/security.mjs';

const root=new URL('../../',import.meta.url);
const contract=JSON.parse(await readFile(new URL('ops/proposals/modern-promotion-contract-20261018.json',root),'utf8'));
// Git checkouts may convert CRLF; preserve every other source byte/whitespace.
const sha=value=>createHash('sha256').update(value.toString().replaceAll('\r\n','\n'),'utf8').digest('hex');
let modern;
const pins=new Map();
const TABLE_PRIVILEGES=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
const COLUMN_PRIVILEGES=['SELECT','INSERT','UPDATE','REFERENCES'];
const EFFECTIVE_ROLES=['anon','authenticated','service_role'];
before(async()=>{
  assert.equal(process.env.ACCOUNT_PGLITE_MODULE,undefined,'This contract test uses the installed in-memory fixture only');
  for(const source of contract.sources)pins.set(source.path,sha(await readFile(new URL(source.path,root))));
  modern=await createSqlFixture();
});
after(async()=>{await modern?.close();});

// Local qualification predicates only: these tests do not create a deployment
// runner, accept provider credentials, or turn a proposal flag into authority.
function sourceFailures(manifest,currentPins){
  return manifest.sources.filter(source=>currentPins.get(source.path)!==source.sha256).map(source=>'source_drift:'+source.path);
}
function grantMatrix(rows,privileges){
  const matrix=Object.fromEntries([...EFFECTIVE_ROLES,'PUBLIC'].map(role=>[role,{allowed:[],grantable:[]}]));
  for(const role of Object.keys(matrix)){
    matrix[role].allowed=privileges.filter(privilege=>rows.some(row=>row.role===role&&row.privilege===privilege&&row.allowed));
    matrix[role].grantable=privileges.filter(privilege=>rows.some(row=>row.role===role&&row.privilege===privilege&&row.grantable));
  }
  return matrix;
}
async function tableDetail(db,oid){
  const columns=(await db.query(`select a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) "defaultExpression",a.attidentity identity,a.attgenerated generated from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=$1::oid and a.attnum>0 and not a.attisdropped order by a.attnum`,[oid])).rows;
  const constraints=(await db.query(`select conname name,contype kind,pg_get_constraintdef(oid,true) definition,convalidated validated,condeferrable deferrable,condeferred "initiallyDeferred",connoinherit "noInherit" from pg_constraint where conrelid=$1::oid and contype in ('p','f','u','c','x') order by conname,contype`,[oid])).rows;
  // has_*_privilege includes effective PUBLIC and inherited role grants. PUBLIC
  // has no pg_roles row, so its own ACL entries are projected explicitly too.
  const tableRows=(await db.query(`
    select r.role,p.privilege,has_table_privilege(r.role,$1::oid,p.privilege) allowed,has_table_privilege(r.role,$1::oid,p.privilege||' WITH GRANT OPTION') grantable
    from unnest($2::text[]) r(role) cross join unnest($3::text[]) p(privilege)
    union all
    select 'PUBLIC',p.privilege,
      exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=$1::oid and acl.grantee=0 and acl.privilege_type=p.privilege),
      exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=$1::oid and acl.grantee=0 and acl.privilege_type=p.privilege and acl.is_grantable)
    from unnest($3::text[]) p(privilege)
    `,[oid,EFFECTIVE_ROLES,TABLE_PRIVILEGES])).rows;
  const columnRows=(await db.query(`
    with columns as (select a.attnum,a.attname,a.attacl,c.relacl,c.relowner from pg_attribute a join pg_class c on c.oid=a.attrelid where c.oid=$1::oid and a.attnum>0 and not a.attisdropped)
    select a.attname "column",r.role,p.privilege,has_column_privilege(r.role,$1::oid,a.attnum,p.privilege) allowed,has_column_privilege(r.role,$1::oid,a.attnum,p.privilege||' WITH GRANT OPTION') grantable
    from columns a cross join unnest($2::text[]) r(role) cross join unnest($3::text[]) p(privilege)
    union all
    select a.attname,'PUBLIC',p.privilege,
      exists(select 1 from aclexplode(coalesce(a.relacl,acldefault('r',a.relowner))) acl where acl.grantee=0 and acl.privilege_type=p.privilege)
        or exists(select 1 from aclexplode(a.attacl) acl where acl.grantee=0 and acl.privilege_type=p.privilege),
      exists(select 1 from aclexplode(coalesce(a.relacl,acldefault('r',a.relowner))) acl where acl.grantee=0 and acl.privilege_type=p.privilege and acl.is_grantable)
        or exists(select 1 from aclexplode(a.attacl) acl where acl.grantee=0 and acl.privilege_type=p.privilege and acl.is_grantable)
    from columns a cross join unnest($3::text[]) p(privilege)
    `,[oid,EFFECTIVE_ROLES,COLUMN_PRIVILEGES])).rows;
  return {columns,constraints,tablePrivileges:grantMatrix(tableRows,TABLE_PRIVILEGES),
    columnPrivileges:columns.map(column=>({column:column.name,roles:grantMatrix(columnRows.filter(row=>row.column===column.name),COLUMN_PRIVILEGES)}))};
}
async function catalog(db,manifest=contract){
  const result=new Map();
  for(const object of manifest.sqlObjects){
    if(object.kind==='function'){
      const row=(await db.query(`select 'public.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature,pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_result(p.oid) returns,pg_get_functiondef(p.oid) definition,p.prosecdef security_definer,p.proconfig settings,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute from pg_proc p where p.oid=to_regprocedure($1)`,[object.signature])).rows[0];
      if(row)result.set(object.id,{signature:row.signature,identityArguments:row.identity_arguments,returns:row.returns,definitionSha256:sha(row.definition),securityDefiner:row.security_definer,settings:row.settings,serviceExecute:row.service_execute,anonExecute:row.anon_execute,authenticatedExecute:row.authenticated_execute});
    }else{
      const row=(await db.query(`select c.oid::text oid,c.relrowsecurity rls_enabled,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_data_access,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_data_access,has_table_privilege('service_role',c.oid,'SELECT') service_select,has_table_privilege('service_role',c.oid,'INSERT') service_insert,has_table_privilege('service_role',c.oid,'UPDATE') service_update,has_table_privilege('service_role',c.oid,'DELETE') service_delete from pg_class c where c.oid=to_regclass($1)`,[object.name])).rows[0];
      if(row){const detail=await tableDetail(db,row.oid);result.set(object.id,{...detail,rlsEnabled:row.rls_enabled,anonDataAccess:row.anon_data_access,authenticatedDataAccess:row.authenticated_data_access,servicePrivileges:{select:row.service_select,insert:row.service_insert,update:row.service_update,delete:row.service_delete}});}
    }
  }
  return result;
}
function objectFailures(manifest,actual,operation){
  const required=new Set(operation?operation.requiredObjects:manifest.sqlObjects.map(object=>object.id));
  const failures=[];
  for(const id of required){
    const expected=manifest.sqlObjects.find(object=>object.id===id),observed=actual.get(id);
    if(!expected||!observed){failures.push('missing_sql_object:'+id);continue;}
    const security={...expected.expectedSecurity};delete security.ownerIdentity;
    const wanted=expected.kind==='function'?{signature:expected.signature,identityArguments:expected.identityArguments,returns:expected.returns,definitionSha256:expected.definitionSha256,...security}:{columns:expected.columns,constraints:expected.constraints,...security};
    if(!isDeepStrictEqual(wanted,observed))failures.push('sql_object_conflict:'+id);
  }
  return failures;
}
function promotionFailures(manifest,actual){
  const failures=[...sourceFailures(manifest,pins),...objectFailures(manifest,actual)];
  for(const[key,value]of Object.entries(manifest.releaseGates))if(value!==true)failures.push('release_gate:'+key);
  for(const operation of manifest.operations){
    if(operation.closure.status!=='complete'||operation.closure.unresolved.length)failures.push('partial_closure:'+operation.action);
    if(operation.rollbackCandidate.implemented!==true||!operation.rollbackCandidate.packagePath)failures.push('rollback_candidate_missing:'+operation.action);
  }
  for(const decision of manifest.authorityDecisions)if(decision.status!=='qualified'||decision.requiredEvidence.some(name=>!decision.evidence.some(item=>item.name===name&&item.passed===true)))failures.push('authority_decision:'+decision.id);
  if(manifest.managedAuth.schemaAndPrivilegesQualified!==true)failures.push('managed_auth_unqualified');
  if(manifest.requiredInertOverlay.integrated!==true)failures.push('safety_overlay_not_integrated');
  for(const gap of manifest.knownSourceContractGaps)if(gap.resolved!==true)failures.push('source_contract_gap:'+gap.id);
  return failures;
}

test('contract covers actual public v1 actions and retains source pins for every operation and SQL declaration',()=>{
  assert.deepEqual(contract.operations.filter(operation=>operation.family==='preserve_public_v1').map(operation=>operation.action).sort(),[...V1_ACCOUNT_ACTIONS].sort());
  assert.deepEqual(sourceFailures(contract,pins),[]);
  for(const operation of contract.operations){
    for(const path of operation.sourcePaths)assert.ok(pins.has(path));
    for(const id of operation.requiredObjects)assert.ok(contract.sqlObjects.some(object=>object.id===id));
    for(const id of operation.authorityDecisions)assert.ok(contract.authorityDecisions.some(decision=>decision.id===id));
  }
  for(const object of contract.sqlObjects){assert.ok(object.sourceDefinition);assert.equal(pins.get(object.sourceDefinition.path),object.sourceDefinition.sha256);assert.ok(object.grantSources.length>0);}
});

test('a changed source pin is rejected even if the proposal is labelled promotion ready',()=>{
  const altered=structuredClone(contract);altered.promotionReady=true;
  const changed=new Map(pins);const entry='supabase/functions/codevalanche-account/index.ts';changed.set(entry,sha('synthetic changed handler'));
  assert.deepEqual(sourceFailures(altered,changed),['source_drift:'+entry]);
});

test('source pins survive the same text checked out with LF on CI while retaining other whitespace',async()=>{
  const lfPins=new Map();
  for(const entry of contract.sources)lfPins.set(entry.path,sha((await readFile(new URL(entry.path,root),'utf8')).replaceAll('\r\n','\n')));
  assert.deepEqual(sourceFailures(contract,lfPins),[]);
  const changed=new Map(lfPins);const entry=contract.sources[0].path;
  changed.set(entry,sha((await readFile(new URL(entry,root),'utf8')).replaceAll('\r\n','\n')+' '));
  assert.deepEqual(sourceFailures(contract,changed),['source_drift:'+entry]);
});

test('current full local fixture matches pinned RPC signatures/bodies/grants and application-table security',async()=>{
  assert.deepEqual(objectFailures(contract,await catalog(modern)),[]);
  assert.equal(contract.managedAuth.schemaAndPrivilegesQualified,false,'Local catalog equality is not managed Auth qualification');
});

test('the real five-table synthetic legacy baseline cannot qualify modern get-account dependencies',async()=>{
  const db=await PGlite.create();
  try{
    const harness=await readFile(new URL('supabase/tests/sqlHarness.mjs',root),'utf8');
    const setup=harness.match(/await db\.exec\(`([\s\S]*?)`\)/)?.[1];assert.ok(setup);
    await db.exec(setup);await db.exec(await readFile(new URL('supabase/migrations/202609080001_account_service.sql',root),'utf8'));
    const count=(await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n;assert.equal(count,5);
    const getAccount=contract.operations.find(operation=>operation.action==='get-account');
    const failures=objectFailures(contract,await catalog(db),getAccount);
    assert.ok(failures.includes('missing_sql_object:function:public.codevalanche_profile_read(uuid)'));
    assert.ok(failures.includes('missing_sql_object:function:public.codevalanche_mfa_recovery_remaining(uuid)'));
    assert.equal(contract.baseline.newMigrationCreated,false);
  }finally{await db.close();}
});

test('actual local RPC permission loss, exposed client table access and disabled RLS refuse qualification',async()=>{
  await modern.exec('begin');
  try{
    await modern.exec('revoke execute on function public.codevalanche_profile_read(uuid) from service_role;grant select on public.codevalanche_profiles to anon;alter table public.codevalanche_profiles disable row level security;');
    const failures=objectFailures(contract,await catalog(modern));
    assert.ok(failures.includes('sql_object_conflict:function:public.codevalanche_profile_read(uuid)'));
    assert.ok(failures.includes('sql_object_conflict:table:public.codevalanche_profiles'));
  }finally{await modern.exec('rollback');}
  assert.deepEqual(objectFailures(contract,await catalog(modern)),[],'The synthetic transaction restores the qualified local preimage');
});

test('non-CRUD table privileges cannot evade the contract matcher even when RLS remains enabled',async()=>{
  for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']){
    await modern.exec('begin');
    try{
      await modern.exec(`grant ${privilege} on public.codevalanche_feedback to anon`);
      assert.equal((await modern.query('select has_table_privilege($1,$2,$3) allowed',['anon','public.codevalanche_feedback',privilege])).rows[0].allowed,true);
      assert.ok(objectFailures(contract,await catalog(modern)).includes('sql_object_conflict:table:public.codevalanche_feedback'),privilege);
    }finally{await modern.exec('rollback');}
  }
});

test('effective PUBLIC and inherited privileges are detected without performing a destructive operation',async()=>{
  for(const sql of [
    'grant truncate on public.codevalanche_feedback to public',
    'create role promotion_contract_inherited nologin;grant references on public.codevalanche_feedback to promotion_contract_inherited;grant promotion_contract_inherited to anon',
  ]){
    await modern.exec('begin');
    try{await modern.exec(sql);assert.ok(objectFailures(contract,await catalog(modern)).includes('sql_object_conflict:table:public.codevalanche_feedback'));}
    finally{await modern.exec('rollback');}
  }
});

test('column-only SELECT INSERT UPDATE REFERENCES grants are detected separately from table grants',async()=>{
  for(const privilege of ['SELECT','INSERT','UPDATE','REFERENCES']){
    await modern.exec('begin');
    try{
      await modern.exec(`grant ${privilege}(display_name) on public.codevalanche_profiles to authenticated`);
      assert.equal((await modern.query('select has_table_privilege($1,$2,$3) table_allowed,has_column_privilege($1,$2,$4,$3) column_allowed',['authenticated','public.codevalanche_profiles',privilege,'display_name'])).rows[0].table_allowed,false);
      assert.equal((await modern.query('select has_column_privilege($1,$2,$3,$4) allowed',['authenticated','public.codevalanche_profiles','display_name',privilege])).rows[0].allowed,true);
      assert.ok(objectFailures(contract,await catalog(modern)).includes('sql_object_conflict:table:public.codevalanche_profiles'),privilege);
    }finally{await modern.exec('rollback');}
  }
});

test('PUBLIC/inherited column grants and new grant options change the effective privilege snapshot',async()=>{
  for(const [sql,id]of [
    ['grant select(display_name) on public.codevalanche_profiles to public','table:public.codevalanche_profiles'],
    ['create role promotion_column_inherited nologin;grant update(display_name) on public.codevalanche_profiles to promotion_column_inherited;grant promotion_column_inherited to authenticated','table:public.codevalanche_profiles'],
    ['grant select on public.codevalanche_feedback to service_role with grant option','table:public.codevalanche_feedback'],
    ['grant select(display_name) on public.codevalanche_profiles to service_role with grant option','table:public.codevalanche_profiles'],
  ]){
    await modern.exec('begin');
    try{await modern.exec(sql);assert.ok(objectFailures(contract,await catalog(modern)).includes('sql_object_conflict:'+id));}
    finally{await modern.exec('rollback');}
  }
});

test('changed consent defaults and removed check constraints cannot appear schema-compatible',async()=>{
  for(const [sql,id]of [
    ['alter table public.codevalanche_account_state alter column analytics_consent set default true','table:public.codevalanche_account_state'],
    ['alter table public.codevalanche_profiles drop constraint codevalanche_profiles_display_name_check','table:public.codevalanche_profiles'],
  ]){
    await modern.exec('begin');
    try{await modern.exec(sql);assert.ok(objectFailures(contract,await catalog(modern)).includes('sql_object_conflict:'+id));}
    finally{await modern.exec('rollback');}
  }
});

test('primary foreign unique and exclusion constraint drift is detected without changing table columns',async()=>{
  for(const [sql,id]of [
    ['alter table public.codevalanche_rate_limits drop constraint codevalanche_rate_limits_pkey','table:public.codevalanche_rate_limits'],
    ['alter table public.codevalanche_feedback drop constraint codevalanche_feedback_user_id_fkey','table:public.codevalanche_feedback'],
    ['alter table public.codevalanche_mfa_recovery_codes drop constraint codevalanche_mfa_recovery_codes_user_id_code_hash_key','table:public.codevalanche_mfa_recovery_codes'],
    ["alter table public.codevalanche_rate_limits add constraint contract_range_exclusion exclude using gist (tstzrange(started_at,started_at,'[]') with &&)",'table:public.codevalanche_rate_limits'],
  ]){
    await modern.exec('begin');
    try{await modern.exec(sql);assert.ok(objectFailures(contract,await catalog(modern)).includes('sql_object_conflict:'+id));}
    finally{await modern.exec('rollback');}
  }
});

test('identity and stored-generated column metadata are captured when present',async()=>{
  await modern.exec('begin');
  try{
    await modern.exec('alter table public.codevalanche_rate_limits alter column hits drop default;alter table public.codevalanche_rate_limits alter column hits add generated always as identity;alter table public.codevalanche_rate_limits add column contract_generated integer generated always as (hits * 2) stored;');
    const observed=(await catalog(modern)).get('table:public.codevalanche_rate_limits');
    assert.equal(observed.columns.find(column=>column.name==='hits').identity,'a');
    const generated=observed.columns.find(column=>column.name==='contract_generated');
    assert.equal(generated.generated,'s');assert.match(generated.defaultExpression,/hits \* 2/);
    assert.ok(objectFailures(contract,new Map([['table:public.codevalanche_rate_limits',observed]])).includes('sql_object_conflict:table:public.codevalanche_rate_limits'));
  }finally{await modern.exec('rollback');}
});

test('RPC signature disagreement is rejected independently of a matching function name',async()=>{
  const altered=structuredClone(contract);altered.sqlObjects.find(object=>object.id==='function:public.codevalanche_profile_read(uuid)').signature='public.codevalanche_profile_read(text)';
  assert.ok(objectFailures(altered,await catalog(modern)).includes('sql_object_conflict:function:public.codevalanche_profile_read(uuid)'));
});

test('fresh release booleans cannot override unresolved SQL edges, authority decisions or missing recovery fallback',async()=>{
  const altered=structuredClone(contract);altered.promotionReady=true;
  for(const key of Object.keys(altered.releaseGates))altered.releaseGates[key]=true;
  const failures=promotionFailures(altered,await catalog(modern));
  assert.ok(failures.includes('partial_closure:get-account'));
  assert.ok(failures.includes('authority_decision:profile_authority'));
  assert.ok(failures.includes('rollback_candidate_missing:mfa-recovery-redeem'));
  assert.ok(failures.includes('managed_auth_unqualified'));
  assert.ok(failures.includes('safety_overlay_not_integrated'));
});

test('actual policy interpreter reproduces the legacy writer contradiction rather than marking a bridge successful',()=>{
  assert.equal(policyFromState({blocked:false,status:'suspended'}).status,'suspended');
  assert.equal(policyFromState({blocked:false,status:'active',deletion_scheduled_for:'2099-01-01T00:00:00Z'}).status,'active');
  assert.equal(contract.authorityDecisions.find(decision=>decision.id==='policy_authority').status,'blocked');
});

test('real profile SQL demonstrates both rollback authority conflicts behind the contract gate',async()=>{
  const user='11111111-1111-4111-8111-111111111111';
  await modern.exec('begin');
  try{
    await modern.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[user,JSON.stringify({display_name:'Synthetic legacy'})]);
    await modern.query('insert into public.codevalanche_account_state(user_id) values($1)',[user]);
    await modern.query('select * from public.codevalanche_persist_profile_outcome($1,$2,$3)',[user,JSON.stringify({display_name:'Synthetic modern'}),'22222222-2222-4222-8222-222222222222']);
    const legacy=(await modern.query("select raw_user_meta_data->>'display_name' name from auth.users where id=$1",[user])).rows[0].name;
    assert.equal(legacy,'Synthetic legacy');
    await modern.query('update auth.users set raw_user_meta_data=$2 where id=$1',[user,JSON.stringify({display_name:'Synthetic rollback edit'})]);
    const canonical=(await modern.query('select * from public.codevalanche_profile_read($1)',[user])).rows[0].display_name;
    assert.equal(canonical,'Synthetic modern');
    assert.equal(contract.authorityDecisions.find(decision=>decision.id==='profile_authority').status,'blocked');
  }finally{await modern.exec('rollback');}
});

test('modern principal accepts the same authenticated audience shapes as legacy, and only those',async()=>{
  const now=Date.now(),id='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',issuer='https://synthetic.example.invalid/auth/v1';
  const service={auth:{getUser:async()=>({data:{user:{id}},error:null})},rpc:async()=>({data:[{id:session}],error:null})};
  const attempt=aud=>{const claims={sub:id,session_id:session,iss:issuer,aud,role:'authenticated',exp:Math.floor(now/1000)+3600};const token=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'synthetic'].join('.');return {claims,run:()=>authenticateAccountContext(new Request('https://synthetic.example.invalid/',{headers:{authorization:'Bearer '+token}}),{service,issuer,now})};};
  for(const aud of ['authenticated',['authenticated'],['authenticated','other']]){const {claims,run}=attempt(aud);assert.equal(validateLegacyClaims(claims,id,issuer,now),true);await run();}
  for(const aud of ['anon',['anon'],[],['authenticated',7],undefined,{0:'authenticated'}]){const {claims,run}=attempt(aud);assert.equal(validateLegacyClaims(claims,id,issuer,now),false);await assert.rejects(run(),error=>error.code==='sign_in_required');}
  const gap=contract.knownSourceContractGaps.find(gap=>gap.id==='authenticated_audience_array');
  assert.equal(gap.resolved,true);assert.equal(gap.currentModernAccepts,true);
});

test('global trigger inventory stays visibly global and is not an automatic migration or activation list',()=>{
  assert.equal(contract.managedAuth.triggerInventoryScope,'all_43_source_migrations_local_fixture_not_a_trigger_enable_list');
  for(const trigger of contract.managedAuth.globalTriggers){assert.equal(trigger.scope,'all_matching_auth_rows_not_candidate_function_slug');assert.equal(trigger.requiresCoordinatedHostedQualification,true);assert.ok(pins.has(trigger.sourceDefinition.path));}
  assert.equal(contract.promotionReady,false);assert.equal(contract.providerQualificationClaimed,false);
});
