param(
  [Parameter(Mandatory=$true)][string]$Artifact,
  [switch]$ApplicationSnapshot,
  [string]$ProtectedDirectory=($env:LOCALAPPDATA+'/Codex/security-20261018/backups'),
  [string]$PostgresBin=($env:LOCALAPPDATA+'/Codex/security-20261018/postgresql-17.11/pgsql/bin')
)
$ErrorActionPreference='Stop'
$opsKeyPointer=[IntPtr]::Zero; $opsStarted=$false; $opsCluster=$null
$opsPhase='preparation'
$opsReport=[ordered]@{version=1;environment='staging';target='isolated_native_postgresql_17_loopback';status='not_attempted';archiveAuthenticationVerified=$false;restoreVerified=$false;fullProjectRecoveryVerified=$false;offDeviceRecoveryVerified=$false;cleanupComplete=$false}
if($ApplicationSnapshot){$opsReport.environment='production_application_snapshot_local_drill';$opsReport.productionDatabaseMutated=$false}
try {
  if(Get-NetTCPConnection -LocalPort 54322 -State Listen -ErrorAction SilentlyContinue){throw 'local_port_in_use'}
  $opsBase=[IO.Path]::GetFullPath($ProtectedDirectory).TrimEnd('\','/')
  $opsCluster=Join-Path $opsBase ('restore-cluster-'+[Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $opsCluster | Out-Null
  $opsLocalPassword=[Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N')
  $opsPwFile=Join-Path $opsCluster 'initdb-password.private'
  [IO.File]::WriteAllText($opsPwFile,$opsLocalPassword)
  $opsInit=& (Join-Path $PostgresBin 'initdb.exe') --pgdata (Join-Path $opsCluster 'data') --username postgres --auth-local scram-sha-256 --auth-host scram-sha-256 --encoding UTF8 --pwfile $opsPwFile 2>&1
  $opsInitExit=$LASTEXITCODE; Remove-Item -LiteralPath $opsPwFile -Force
  if($opsInitExit -ne 0){throw 'local_cluster_initialization_failed'}
  $opsStart=Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('--pgdata',('"'+(Join-Path $opsCluster 'data')+'"'),'--log',('"'+(Join-Path $opsCluster 'server.private.log')+'"'),'--options','"-h 127.0.0.1 -p 54322"','--timeout','30','--wait','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $opsCluster 'start.private.log') -RedirectStandardError (Join-Path $opsCluster 'start-error.private.log')
  if(!$opsStart.WaitForExit(40000)){throw 'local_cluster_start_timeout'}
  if(!(Test-Path -LiteralPath (Join-Path $opsCluster 'data/postmaster.pid'))){throw 'local_cluster_start_failed'}
  $opsStarted=$true
  $opsPhase='database_create'
  $opsDatabase='security_restore_'+[Guid]::NewGuid().ToString('N').Substring(0,16)
  $env:PGHOST='127.0.0.1';$env:PGPORT='54322';$env:PGUSER='postgres';$env:PGPASSWORD=$opsLocalPassword;$env:PGDATABASE='postgres';$env:PGSSLMODE='disable'
  $opsCreate=& (Join-Path $PostgresBin 'psql.exe') --no-password --no-psqlrc --set ON_ERROR_STOP=1 --command ('create database '+$opsDatabase) 2>&1
  if($LASTEXITCODE -ne 0){throw 'local_database_create_failed'}
  $opsKeySecure=ConvertTo-SecureString ([IO.File]::ReadAllText((Join-Path $opsBase 'backup-key.dpapi')).Trim())
  $opsKeyPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($opsKeySecure)
  $env:SECURITY_BACKUP_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($opsKeyPointer)
  $env:SECURITY_RESTORE_PGPASSWORD=$opsLocalPassword
  $env:SECURITY_RESTORE_PGHOST='127.0.0.1';$env:SECURITY_RESTORE_PGPORT='54322';$env:SECURITY_RESTORE_PGUSER='postgres';$env:SECURITY_RESTORE_PGDATABASE=$opsDatabase
  $env:SECURITY_PSQL=Join-Path $PostgresBin 'psql.exe';$env:SECURITY_PG_RESTORE=Join-Path $PostgresBin 'pg_restore.exe'
  $opsPhase='restore'
  $opsScript=($(if($ApplicationSnapshot){'../scripts/security-operations-snapshot.mjs'}else{'../scripts/security-operations-backup.mjs'}))
  $opsNodeArgs=@(('"'+(Join-Path $PSScriptRoot $opsScript)+'"'),'restore')
  if(!$ApplicationSnapshot){$opsNodeArgs+='staging'}
  $opsNodeArgs+=('"'+$opsBase+'"');$opsNodeArgs+=('"'+$Artifact+'"')
  $opsResultPath=Join-Path $opsCluster 'verification.private.json';$opsErrorPath=Join-Path $opsCluster 'verification-error.private.log'
  $opsNode=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $opsNodeArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $opsResultPath -RedirectStandardError $opsErrorPath
  if(!$opsNode.WaitForExit(60000)){$opsNode.Kill();throw 'local_restore_tool_timeout'}
  $opsRestore=([IO.File]::ReadAllText($opsResultPath)+[IO.File]::ReadAllText($opsErrorPath)).Trim()
  $opsRestoreExit=2
  if([IO.File]::ReadAllText($opsResultPath).Trim()){
    $opsParsed=[IO.File]::ReadAllText($opsResultPath)|ConvertFrom-Json
    $opsReport.verification=$opsParsed
    $opsReport.archiveAuthenticationVerified=$opsParsed.archiveAuthenticationVerified -eq $true
    if($opsParsed.restoreVerified -eq $true -or $opsParsed.databaseArchiveRestoreVerified -eq $true){$opsRestoreExit=0}
  }
  if($opsRestoreExit -eq 0){$opsReport.status=($(if($ApplicationSnapshot){'selected_application_scope_restored'}else{'local_database_archive_restored'}));$opsReport.archiveAuthenticationVerified=$true;$opsReport.restoreVerified=$true;$opsReport.verification=($opsRestore | Out-String | ConvertFrom-Json)}
  else {
    $opsSafeCode=($opsRestore -split '\r?\n' | Where-Object {$_ -match '^((postgres_|snapshot_|backup_|restore_)[a-z_]+|archive_auth_scope_incomplete)$'} | Select-Object -First 1)
    $opsReport.status='local_restore_failed';$opsReport.reason=($(if($opsSafeCode){$opsSafeCode}elseif($opsParsed.status -eq 'selected_application_restore_difference'){'selected_application_restore_difference'}else{'local_restore_not_qualified'}))
    if($opsSafeCode){$opsReport.archiveAuthenticationVerified=$opsSafeCode -in @('postgres_extension_unavailable','postgres_role_unavailable','postgres_permission_denied','archive_auth_scope_incomplete')}
  }
} catch {$opsReport.status='local_restore_unavailable';$opsReport.reason='local_restore_preparation_failed';$opsReport.failedPhase=$opsPhase}
finally {
  if($opsCluster -and (Test-Path -LiteralPath (Join-Path $opsCluster 'data/postmaster.pid'))){
    $opsStop=Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('--pgdata',('"'+(Join-Path $opsCluster 'data')+'"'),'--mode','immediate','--timeout','30','--wait','stop') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $opsCluster 'stop.private.log') -RedirectStandardError (Join-Path $opsCluster 'stop-error.private.log')
    $opsStopFinished=$opsStop.WaitForExit(40000)
    $opsStopped=$opsStopFinished -and !(Test-Path -LiteralPath (Join-Path $opsCluster 'data/postmaster.pid'))
  }else{$opsStopped=$true}
  # Recursive deletion was rejected by automatic approval review during this drill.
  # Stop the isolated server and retain its ACL-protected directory for explicit later cleanup.
  $opsReport.localServerStopped=$opsStopped
  $opsReport.localClusterPreserved=$true
  if($opsKeyPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($opsKeyPointer)}
  if($opsKeySecure){$opsKeySecure.Dispose()};$opsLocalPassword=$null
  foreach($opsName in @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','SECURITY_BACKUP_KEY','SECURITY_RESTORE_PGPASSWORD','SECURITY_RESTORE_PGHOST','SECURITY_RESTORE_PGPORT','SECURITY_RESTORE_PGUSER','SECURITY_RESTORE_PGDATABASE','SECURITY_PSQL','SECURITY_PG_RESTORE')){Remove-Item -LiteralPath ('Env:'+$opsName) -ErrorAction SilentlyContinue}
}
$opsReport | ConvertTo-Json -Depth 4
if(!$opsReport.restoreVerified -or !$opsReport.localServerStopped){exit 2}
