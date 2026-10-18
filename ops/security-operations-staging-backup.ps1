param(
  [Parameter(Mandatory=$true)][string]$PasswordDpapiPath,
  [string]$ProtectedDirectory=($env:LOCALAPPDATA+'/Codex/security-20261018/backups'),
  [string]$PostgresBin=($env:LOCALAPPDATA+'/Codex/security-20261018/postgresql-17.11/pgsql/bin'),
  [string]$RootCertificate=($env:LOCALAPPDATA+'/Codex/security-20261018/prod-ca-2021.crt')
)
$ErrorActionPreference='Stop'
$opsKeyPointer=[IntPtr]::Zero; $opsPasswordPointer=[IntPtr]::Zero
try {
  New-Item -ItemType Directory -Path $ProtectedDirectory -Force | Out-Null
  $opsSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $null=& icacls.exe $ProtectedDirectory /inheritance:r /grant:r ('*'+$opsSid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'
  if($LASTEXITCODE -ne 0){throw 'backup_directory_acl_failed'}
  $opsKeyPath=Join-Path $ProtectedDirectory 'backup-key.dpapi'
  if(!(Test-Path -LiteralPath $opsKeyPath)) {
    $opsKeyBytes=New-Object byte[] 32
    $opsRng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$opsRng.GetBytes($opsKeyBytes)}finally{$opsRng.Dispose()}
    $opsGeneratedKey=ConvertTo-SecureString ([Convert]::ToBase64String($opsKeyBytes)) -AsPlainText -Force
    try{[IO.File]::WriteAllText($opsKeyPath,($opsGeneratedKey | ConvertFrom-SecureString))}finally{$opsGeneratedKey.Dispose();[Array]::Clear($opsKeyBytes,0,32)}
  }
  $opsKeySecure=ConvertTo-SecureString ([IO.File]::ReadAllText($opsKeyPath).Trim())
  $opsPasswordSecure=ConvertTo-SecureString ([IO.File]::ReadAllText($PasswordDpapiPath).Trim())
  $opsKeyPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($opsKeySecure)
  $opsPasswordPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($opsPasswordSecure)
  $env:SECURITY_BACKUP_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($opsKeyPointer)
  $env:SECURITY_SOURCE_PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($opsPasswordPointer)
  $env:SECURITY_SOURCE_PGHOST='aws-1-eu-central-1.pooler.supabase.com'
  $env:SECURITY_SOURCE_PGUSER='postgres.umpybznthsfehmdvmfly'
  $env:SECURITY_SOURCE_PGSSLROOTCERT=$RootCertificate
  $env:SECURITY_PG_DUMP=Join-Path $PostgresBin 'pg_dump.exe'
  & node (Join-Path $PSScriptRoot '../scripts/security-operations-backup.mjs') capture staging $ProtectedDirectory
  exit $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine('protected_staging_backup_failed')
  exit 1
} finally {
  if($opsKeyPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($opsKeyPointer)}
  if($opsPasswordPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($opsPasswordPointer)}
  if($opsKeySecure){$opsKeySecure.Dispose()};if($opsPasswordSecure){$opsPasswordSecure.Dispose()}
  foreach($opsName in @('SECURITY_BACKUP_KEY','SECURITY_SOURCE_PGPASSWORD','SECURITY_SOURCE_PGHOST','SECURITY_SOURCE_PGUSER','SECURITY_SOURCE_PGSSLROOTCERT','SECURITY_PG_DUMP')){Remove-Item -LiteralPath ('Env:'+$opsName) -ErrorAction SilentlyContinue}
}
