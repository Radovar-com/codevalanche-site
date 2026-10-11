import {readFile} from 'node:fs/promises';
export function validateMaintenanceConfiguration(snapshot={}) {
 const missingControls=[];const requireControl=(ok,name)=>{if(!ok)missingControls.push(name)};
 requireControl(snapshot.dispatcherEnabled===true,'dispatcher_enabled');
 requireControl(Number.isInteger(snapshot.intervalSeconds)&&snapshot.intervalSeconds>=15&&snapshot.intervalSeconds<=60,'bounded_schedule_15_to_60_seconds');
 requireControl(snapshot.endpointHttps===true,'https_dispatch_endpoint');
 requireControl(snapshot.workerAuthenticationVerified===true,'worker_authentication');
 requireControl(snapshot.databaseRolesQualified===true,'dedicated_database_roles');
 requireControl(snapshot.providerAuthQualified===true,'provider_auth_reconciliation');
 requireControl(snapshot.alertsConfigured===true,'pending_dead_letter_alerts');
 requireControl(snapshot.retentionScheduleVerified===true,'daily_retention_sweep');
 if(snapshot.erasureEnabled===true){requireControl(snapshot.storageSchemaQualified===true,'storage_schema');requireControl(snapshot.remoteErasureAdapterQualified===true,'remote_erasure_receipts');requireControl(snapshot.backupRollbackVerified===true,'backup_rollback')}
 return {ok:missingControls.length===0,missingControls};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/verify-maintenance-config.mjs')){const file=process.argv[2];if(!file){console.error('Usage: verify-maintenance-config.mjs SANITIZED_OPERATOR_RECEIPTS.json');process.exitCode=2}else{const result=validateMaintenanceConfiguration(JSON.parse(await readFile(file,'utf8')));console.log(JSON.stringify(result));process.exitCode=result.ok?0:1}}
