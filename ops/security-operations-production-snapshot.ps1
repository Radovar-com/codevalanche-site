param([string]$ProtectedDirectory=($env:LOCALAPPDATA+'/Codex/security-20261018/backups'))
$ErrorActionPreference='Stop'
$opsPointer=[IntPtr]::Zero
try {
  $opsKeySecure=ConvertTo-SecureString ([IO.File]::ReadAllText((Join-Path $ProtectedDirectory 'backup-key.dpapi')).Trim())
  $opsPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($opsKeySecure)
  $env:SECURITY_BACKUP_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($opsPointer)
  & node (Join-Path $PSScriptRoot '../scripts/security-operations-snapshot.mjs') capture $ProtectedDirectory
  exit $LASTEXITCODE
}catch{[Console]::Error.WriteLine('protected_production_snapshot_failed');exit 1}
finally {
  if($opsPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($opsPointer)}
  if($opsKeySecure){$opsKeySecure.Dispose()}
  Remove-Item Env:SECURITY_BACKUP_KEY -ErrorAction SilentlyContinue
}
