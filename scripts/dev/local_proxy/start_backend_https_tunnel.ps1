param(
  [string]$SshHost = '',
  [int]$LocalPort = 0,
  [string]$RemoteOrigin = '',
  [string]$RemoteHost = '127.0.0.1',
  [int]$RemotePort = 443
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path (Split-Path $PSScriptRoot -Parent) 'Resolve-RemoteScriptConfig.ps1')
$DevScriptRoot = Split-Path $PSScriptRoot -Parent

$sshHost = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com' -ScriptRoot $DevScriptRoot
$resolvedRemoteOrigin = Resolve-RemoteSetting -Value $RemoteOrigin -EnvName 'LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN' -Default 'https://127.0.0.1:15443' -ScriptRoot $DevScriptRoot

$remoteUri = $null
try {
  $remoteUri = [Uri]$resolvedRemoteOrigin
} catch {
  throw "LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN is not a valid absolute URI: $resolvedRemoteOrigin"
}

$usesLocalTunnel = $remoteUri.Host -in @('127.0.0.1', 'localhost', '[::1]', '::1')
if (-not $usesLocalTunnel) {
  Write-Host "[local-app-tunnel] skip: backend upstream is $resolvedRemoteOrigin"
  exit 0
}

if ($LocalPort -le 0) {
  $resolvedPort = Resolve-RemoteSetting -Value '' -EnvName 'LOCAL_APP_DEV_PROXY_TUNNEL_PORT' -Default '15443' -ScriptRoot $DevScriptRoot
  if (-not [int]::TryParse($resolvedPort, [ref]$LocalPort)) {
    $LocalPort = 15443
  }
}

Write-Host "[local-app-tunnel] 127.0.0.1:$LocalPort -> $sshHost -> ${RemoteHost}:$RemotePort"

$sshArguments = @(
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'StrictHostKeyChecking=yes',
  '-N',
  '-L', "${LocalPort}:${RemoteHost}:${RemotePort}",
  $sshHost
)

ssh @sshArguments