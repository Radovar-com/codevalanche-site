param(
  [Parameter(Mandatory=$true)][ValidateSet('hvevaxsfeyiikjhcsafi','umpybznthsfehmdvmfly')][string]$ProjectRef,
  [switch]$SetMinimumPasswordLength12,
  [switch]$VerifyShortPassword,
  [switch]$ReadPoolerMetadata
)
$ErrorActionPreference = 'Stop'
$opsPhase='credential_read'
# Read the already registered CLI credential in this short-lived process only.
# Do not print the credential, HTTP headers, response body or exception object.
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SecurityOperationsCredential {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
    public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr credential);
  public static byte[] Read() {
    IntPtr ptr;
    if (!CredRead("Supabase CLI:supabase", 1, 0, out ptr)) throw new Exception("credential_unavailable");
    try {
      var credential = (Credential)Marshal.PtrToStructure(ptr, typeof(Credential));
      var bytes = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
      return bytes;
    } finally { CredFree(ptr); }
  }
}
'@
  $opsBytes = [SecurityOperationsCredential]::Read()
  $opsToken = [Text.Encoding]::UTF8.GetString($opsBytes)
  if ($opsToken -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'credential_encoding_unavailable' }
  $opsEndpoint = 'https://api.supabase.com/v1/projects/' + $ProjectRef
  $opsPhase='auth_config_read'
  $opsActual = Invoke-RestMethod -Uri ($opsEndpoint + '/config/auth') -Method Get -Headers @{ Authorization = ('Bearer ' + $opsToken) } -TimeoutSec 30
  $opsMutation = $null
  if ($SetMinimumPasswordLength12) {
    if ($null -eq $opsActual.password_min_length -or $opsActual.password_min_length -isnot [ValueType]) { throw 'password_policy_field_unqualified' }
    $opsBefore = [long]$opsActual.password_min_length
    if ($opsBefore -gt 12) { throw 'password_policy_refuses_weaker_setting' }
    if ($opsBefore -ne 12) {
      # The only supported mutation is this exact one-field body, approved for this release.
      $opsPhase='password_policy_patch'
      $null = Invoke-RestMethod -Uri ($opsEndpoint + '/config/auth') -Method Patch -Headers @{ Authorization = ('Bearer ' + $opsToken) } -ContentType 'application/json' -Body '{"password_min_length":12}' -TimeoutSec 30
    }
    $opsPhase='password_policy_readback'
    $opsActual = Invoke-RestMethod -Uri ($opsEndpoint + '/config/auth') -Method Get -Headers @{ Authorization = ('Bearer ' + $opsToken) } -TimeoutSec 30
    if ($opsActual.password_min_length -ne 12) { throw 'password_policy_readback_failed' }
    $opsMutation = [ordered]@{onlyField='password_min_length';before=$opsBefore;after=12;readbackVerified=$true}
  }
  $opsReport = [ordered]@{projectRef=$ProjectRef;observedAt=[DateTime]::UtcNow.ToString('o');status='observed';settings=[ordered]@{}}
  $opsNumbers = @('jwt_exp','password_min_length','mailer_otp_exp','sms_otp_exp','security_refresh_token_reuse_interval','mfa_max_enrolled_factors','rate_limit_email_sent','rate_limit_sms_sent','rate_limit_token_refresh','rate_limit_verify','rate_limit_anonymous_users','rate_limit_sign_in_sign_ups','rate_limit_mfa_challenge_verified','rate_limit_web3')
  $opsBooleans = @('refresh_token_rotation_enabled','mailer_autoconfirm','phone_autoconfirm','mailer_secure_email_change_enabled','security_update_password_require_reauthentication','security_captcha_enabled','mfa_totp_enroll_enabled','mfa_totp_verify_enabled','mfa_phone_enroll_enabled','mfa_phone_verify_enabled','password_hibp_enabled')
  foreach($opsName in $opsNumbers) {
    $opsValue = $opsActual.$opsName
    if ($null -ne $opsValue -and $opsValue -is [ValueType]) { $opsReport.settings[$opsName]=[long]$opsValue }
  }
  foreach($opsName in $opsBooleans) {
    $opsValue = $opsActual.$opsName
    if ($opsValue -is [bool]) { $opsReport.settings[$opsName]=$opsValue }
  }
  foreach($opsName in @('site_url','uri_allow_list')) {
    $opsUrls = @()
    foreach($opsCandidate in ($opsActual.$opsName -split ',')) {
      $opsUri = $null
      if ([Uri]::TryCreate($opsCandidate.Trim(),[UriKind]::Absolute,[ref]$opsUri) -and $opsUri.Scheme -in @('https','http') -and !$opsUri.UserInfo -and !$opsUri.Query -and !$opsUri.Fragment) { $opsUrls += $opsUri.AbsoluteUri }
      elseif ($opsCandidate) { $opsUrls += '[non-HTTPS-or-pattern-entry-omitted]' }
    }
    $opsReport.settings[$opsName]=$opsUrls
  }
  if ($opsMutation) { $opsReport.mutation=$opsMutation }
  if ($ReadPoolerMetadata) {
    $opsPhase='pooler_metadata_read'
    $opsPoolers=Invoke-RestMethod -Uri ($opsEndpoint + '/config/database/pooler') -Method Get -Headers @{ Authorization = ('Bearer ' + $opsToken) } -TimeoutSec 30
    $opsReport.poolers=@($opsPoolers | ForEach-Object {
      $opsPooler=[ordered]@{}
      foreach($opsName in @('db_host','db_name','db_user','pool_mode')) {
        $opsValue=$_.$opsName
        if($opsValue -is [string] -and $opsValue -match '^[a-zA-Z0-9_.-]+$'){$opsPooler[$opsName]=$opsValue}
      }
      if($_.db_port -is [ValueType]){$opsPooler.db_port=[int]$_.db_port}
      $opsPooler
    })
    $opsPoolers=$null
  }
  if ($VerifyShortPassword) {
    if ($ProjectRef -ne 'umpybznthsfehmdvmfly' -or $opsActual.password_min_length -ne 12) { throw 'short_password_probe_staging_only' }
    $opsPhase='public_key_read'
    $opsKeys = Invoke-RestMethod -Uri ($opsEndpoint + '/api-keys') -Method Get -Headers @{ Authorization = ('Bearer ' + $opsToken) } -TimeoutSec 30
    $opsPublicKey = ($opsKeys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1).api_key
    if (!$opsPublicKey) { throw 'public_key_unavailable' }
    $opsRejected=$false; $opsStatus=0; $opsCode=$null
    $opsPhase='staging_short_password_probe'
    try {
      # A synthetic address is submitted only with a password below the read-back provider minimum.
      # GoTrue must reject it before creating an account or sending confirmation mail.
      $null = Invoke-WebRequest -UseBasicParsing -Uri ('https://' + $ProjectRef + '.supabase.co/auth/v1/signup') -Method Post -Headers @{apikey=$opsPublicKey} -ContentType 'application/json' -Body '{"email":"password-policy-preflight-20261018@example.com","password":"aB7!short11"}' -TimeoutSec 30
    } catch {
      $opsStatus = [int]$_.Exception.Response.StatusCode
      try {
        $opsErrorText=$_.ErrorDetails.Message
        if(!$opsErrorText -and $_.Exception.Response){$opsReader=New-Object IO.StreamReader($_.Exception.Response.GetResponseStream());try{$opsErrorText=$opsReader.ReadToEnd()}finally{$opsReader.Dispose()}}
        $opsError = $opsErrorText | ConvertFrom-Json; $opsCode=$opsError.error_code; if(!$opsCode){$opsCode=$opsError.code}
      } catch {}
      $opsRejected = $opsStatus -eq 422 -and $opsCode -eq 'weak_password'
    }
    $opsReport.shortPasswordProbe=[ordered]@{stagingOnly=$true;httpStatus=$opsStatus;errorCode=($(if($opsCode -in @('weak_password','over_email_send_rate_limit','over_request_rate_limit','validation_failed')){$opsCode}else{'unclassified'}));weakPasswordRejected=$opsRejected;accountCreationExpected=$false;mailExpected=$false}
    $opsPublicKey=$null; $opsKeys=$null; $opsError=$null
    if(!$opsRejected){throw 'short_password_probe_not_qualified'}
  }
  $opsReport | ConvertTo-Json -Depth 5
} catch {
  if($opsReport){$opsReport.status='incomplete';$opsReport.phase=$opsPhase;$opsReport | ConvertTo-Json -Depth 5}
  else {[ordered]@{projectRef=$ProjectRef;status='unavailable';phase=$opsPhase;reason='authenticated_auth_config_read_failed'} | ConvertTo-Json}
  exit 2
} finally {
  if($opsBytes){[Array]::Clear($opsBytes,0,$opsBytes.Length)}
  $opsToken=$null; $opsActual=$null
}
