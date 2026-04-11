param(
  [string]$Domain = '',
  [string]$OutputDir = "$HOME\.config\world-local-app-dev",
  [System.Security.SecureString]$PfxPassphrase
)

$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path $PSScriptRoot -Parent) 'Resolve-RemoteScriptConfig.ps1')
$DevScriptRoot = Split-Path $PSScriptRoot -Parent

$Domain = Resolve-RemoteSetting -Value $Domain -EnvName 'LOCAL_APP_DEV_DOMAIN' -Default 'local-app.example.test' -ScriptRoot $DevScriptRoot

if (-not $PSBoundParameters.ContainsKey('PfxPassphrase')) {
  $resolvedPassphrase = Resolve-RemoteSetting -Value '' -EnvName 'LOCAL_APP_DEV_PROXY_CERT_PASSPHRASE' -Default 'world-local-dev' -ScriptRoot $DevScriptRoot
	$PfxPassphrase = ConvertTo-SecureString $resolvedPassphrase -AsPlainText -Force
}

$pfxPath = Join-Path $OutputDir 'app-dev-local.pfx'
$cerPath = Join-Path $OutputDir 'app-dev-local.cer'

Write-Host '== Setup local app-dev ==' -ForegroundColor Cyan

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$hostsPath = 'C:\Windows\System32\drivers\etc\hosts'
$hostsEntry = "127.0.0.1 $Domain"
$hostsUpdated = $false
try {
  $hostsContent = Get-Content $hostsPath -ErrorAction Stop
  if (-not ($hostsContent | Where-Object { $_ -match "^\s*127\.0\.0\.1\s+$([regex]::Escape($Domain))(\s|$)" })) {
    Add-Content -Path $hostsPath -Value $hostsEntry -ErrorAction Stop
    $hostsUpdated = $true
  }
  Write-Host "hosts OK: $Domain -> 127.0.0.1"
} catch {
  Write-Warning "Unable to update hosts automatically. Add this line manually as administrator: $hostsEntry"
}

$existing = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
  $_.Subject -match [regex]::Escape("CN=$Domain")
} | Select-Object -First 1

if (-not $existing) {
  Write-Host 'Creating self-signed certificate in CurrentUser\My ...'
  $existing = New-SelfSignedCertificate `
    -DnsName $Domain, 'localhost' `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -FriendlyName 'world-local-app-dev' `
    -NotAfter (Get-Date).AddYears(5) `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1')
}

Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($existing.Thumbprint)" -FilePath $pfxPath -Password $PfxPassphrase -Force | Out-Null
Export-Certificate -Cert "Cert:\CurrentUser\My\$($existing.Thumbprint)" -FilePath $cerPath -Force | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

Write-Host "Certificate exported: $pfxPath"
Write-Host "Certificate trusted in CurrentUser\\Root"
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '1. Start Vite: npm run host'
Write-Host '2. Start local proxy: npm run proxy:local-app'
Write-Host '3. Start backend tunnel: npm run proxy:remote-backend-tunnel'
Write-Host '4. Or run all required processes together: npm run app-dev'
if (-not $hostsUpdated) {
  Write-Host '5. If hosts was not updated automatically, add the hosts entry manually as administrator.'
}