param(
  [string]$Domain = '',
  [int]$VitePort = 0,
  [string]$EnvFile = '.env.local'
)

$ErrorActionPreference = 'SilentlyContinue'

. (Join-Path (Split-Path $PSScriptRoot -Parent) 'Resolve-RemoteScriptConfig.ps1')
$DevScriptRoot = Split-Path $PSScriptRoot -Parent
$ProjectRoot = Get-WorldProjectRoot -ScriptRoot $DevScriptRoot

$Domain = Resolve-RemoteSetting -Value $Domain -EnvName 'LOCAL_APP_DEV_DOMAIN' -Default 'local-app.example.test' -ScriptRoot $DevScriptRoot
if ($VitePort -le 0) {
  $resolvedPort = Resolve-RemoteSetting -Value '' -EnvName 'VITE_DEV_PORT' -Default '5175' -ScriptRoot $DevScriptRoot
  $parsedPort = 5175
  if ([int]::TryParse($resolvedPort, [ref]$parsedPort)) {
    $VitePort = $parsedPort
  } else {
    $VitePort = 5175
  }
}

$EnvFilePath = $EnvFile
if (-not [System.IO.Path]::IsPathRooted($EnvFilePath)) {
  $EnvFilePath = Join-Path $ProjectRoot $EnvFilePath
}

Write-Host '== Local app-dev check ==' -ForegroundColor Cyan

$hostsPath = 'C:\Windows\System32\drivers\etc\hosts'
$hostsMatch = $false
if (Test-Path $hostsPath) {
  $hostsMatch = Select-String -Path $hostsPath -Pattern "^\s*127\.0\.0\.1\s+$([regex]::Escape($Domain))(\s|$)" -Quiet
}

Write-Host ''
Write-Host '[hosts]' -ForegroundColor Yellow
if ($hostsMatch) {
  Write-Host "OK: $Domain -> 127.0.0.1"
} else {
  Write-Host "MISSING: add '127.0.0.1 $Domain' to hosts"
}

$conn = Get-NetTCPConnection -LocalPort $VitePort | Select-Object -First 1
Write-Host ''
Write-Host '[vite port]' -ForegroundColor Yellow
if ($conn) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)"
  Write-Host "Port $VitePort listener: $($conn.LocalAddress):$($conn.LocalPort) pid=$($conn.OwningProcess) name=$($proc.Name)"
  if ($conn.LocalAddress -eq '127.0.0.1') {
    Write-Host 'WARNING: Vite is loopback-only; expected 0.0.0.0 or :: for local reverse proxy use.'
  }
} else {
  Write-Host "NOT LISTENING: nothing bound to $VitePort"
}

Write-Host ''
Write-Host '[env]' -ForegroundColor Yellow
$envMap = @{}
if (Test-Path $EnvFilePath) {
  foreach ($line in (Get-Content $EnvFilePath)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $trimmed = $line.Trim()
    if ($trimmed.StartsWith('#')) {
      continue
    }

    $idx = $trimmed.IndexOf('=')
    if ($idx -le 0) {
      continue
    }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    $envMap[$key] = $value
  }

  $checks = @(
    @{ Key = 'VITE_DEV_PORT'; Expected = [string]$VitePort },
    @{ Key = 'VITE_HMR_HOST'; Expected = $Domain },
    @{ Key = 'VITE_HMR_PROTOCOL'; Expected = 'wss' },
    @{ Key = 'VITE_HMR_CLIENT_PORT'; Expected = '443' },
    @{ Key = 'LOCAL_APP_DEV_DOMAIN'; Expected = $Domain },
    @{ Key = 'LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN'; Expected = '' },
    @{ Key = 'LOCAL_APP_DEV_PROXY_VITE_ORIGIN'; Expected = '' }
  )

  foreach ($check in $checks) {
    $key = $check.Key
    if (-not $envMap.ContainsKey($key)) {
      Write-Host "MISSING: $key"
      continue
    }

    $actualValue = [string]$envMap[$key]
    $expectedValue = [string]$check.Expected

    if (-not [string]::IsNullOrWhiteSpace($expectedValue) -and $actualValue -ne $expectedValue) {
      Write-Host "DIFF: $key expected '$expectedValue' actual '$actualValue'"
      continue
    }

    if ([string]::IsNullOrWhiteSpace($actualValue)) {
      Write-Host "MISSING/EMPTY: $key"
      continue
    }

    Write-Host "OK: $key=$actualValue"
  }
} else {
  Write-Host "NOT FOUND: $EnvFilePath"
}

Write-Host ''
Write-Host '[backend tunnel]' -ForegroundColor Yellow
$remoteOrigin = ''
if ($envMap.ContainsKey('LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN')) {
  $remoteOrigin = [string]$envMap['LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN']
}

$tunnelPort = 0
if ($envMap.ContainsKey('LOCAL_APP_DEV_PROXY_TUNNEL_PORT')) {
  $parsedTunnelPort = 0
  if ([int]::TryParse([string]$envMap['LOCAL_APP_DEV_PROXY_TUNNEL_PORT'], [ref]$parsedTunnelPort)) {
    $tunnelPort = $parsedTunnelPort
  }
}

$remoteUri = $null
if (-not [string]::IsNullOrWhiteSpace($remoteOrigin)) {
  try {
    $remoteUri = [Uri]$remoteOrigin
  } catch {
    $remoteUri = $null
  }
}

$usesLocalTunnel = $false
if ($remoteUri -and $remoteUri.IsAbsoluteUri) {
  $usesLocalTunnel = $remoteUri.Host -in @('127.0.0.1', 'localhost', '[::1]', '::1')
  if ($tunnelPort -le 0 -and $usesLocalTunnel -and $remoteUri.Port -gt 0) {
    $tunnelPort = $remoteUri.Port
  }
}

if ($usesLocalTunnel) {
  foreach ($key in @('LOCAL_APP_DEV_PROXY_BACKEND_HOST_HEADER', 'LOCAL_APP_DEV_PROXY_BACKEND_SERVERNAME')) {
    if (-not $envMap.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$envMap[$key])) {
      Write-Host "MISSING/EMPTY: $key"
    } else {
      Write-Host "OK: $key=$($envMap[$key])"
    }
  }

  if ($tunnelPort -gt 0) {
    $tunnelConn = Get-NetTCPConnection -LocalPort $tunnelPort | Select-Object -First 1
    if ($tunnelConn) {
      $tunnelProc = Get-CimInstance Win32_Process -Filter "ProcessId = $($tunnelConn.OwningProcess)"
      Write-Host "Port $tunnelPort listener: $($tunnelConn.LocalAddress):$($tunnelConn.LocalPort) pid=$($tunnelConn.OwningProcess) name=$($tunnelProc.Name)"
    } else {
      Write-Host "NOT LISTENING: nothing bound to backend tunnel port $tunnelPort"
    }
  }
} elseif (-not [string]::IsNullOrWhiteSpace($remoteOrigin)) {
  Write-Host "INFO: backend upstream is $remoteOrigin"
} else {
  Write-Host 'SKIP: LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN not set'
}

Write-Host ''
Write-Host '[http probes]' -ForegroundColor Yellow
try {
  $local = Invoke-WebRequest -Uri "https://$Domain/" -UseBasicParsing -TimeoutSec 5
  Write-Host "OK: https://$Domain/ -> $($local.StatusCode)"
} catch {
  Write-Host "FAIL: https://$Domain/ -> $($_.Exception.Message)"
}

try {
  $api = Invoke-WebRequest -Uri "https://$Domain/api/session/csrf-token" -UseBasicParsing -TimeoutSec 5
  Write-Host "OK: https://$Domain/api/session/csrf-token -> $($api.StatusCode)"
} catch {
  Write-Host "FAIL: https://$Domain/api/session/csrf-token -> $($_.Exception.Message)"
}

Write-Host ''
Write-Host 'Reference local reverse proxy template:' -ForegroundColor Yellow
Write-Host 'docs/development/open-source-local-dev.md'