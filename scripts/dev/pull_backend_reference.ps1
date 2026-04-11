param(
	[Alias('Remote')]
	[string]$SshHost = '',
	[string]$RemoteBaseRoot = '',
	[string]$Workspace = '',
	[string]$RemoteRoot = '',
	[string]$RemoteTempRoot = '',
	[string]$LocalRoot = '',
	[switch]$KeepBackup
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'Resolve-RemoteScriptConfig.ps1')

$Remote = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com' -ScriptRoot $PSScriptRoot
$Workspace = Resolve-RemoteSetting -Value $Workspace -EnvName 'WORLD_WORKSPACE_ROOT' -Default (Get-WorldProjectRoot -ScriptRoot $PSScriptRoot) -ScriptRoot $PSScriptRoot
$RemoteBaseRoot = Resolve-RemoteSetting -Value $RemoteBaseRoot -EnvName 'WORLD_REMOTE_ROOT' -Default '/srv/ustb' -ScriptRoot $PSScriptRoot

$defaultRemoteRoot = Join-RemotePath -Base $RemoteBaseRoot -Segments @('dev', 'Official-backend', 'reference', 'backend')
$RemoteRoot = Resolve-RemoteSetting -Value $RemoteRoot -EnvName 'WORLD_BACKEND_REFERENCE_ROOT' -Default $defaultRemoteRoot -ScriptRoot $PSScriptRoot
$RemoteTempRoot = Resolve-RemoteSetting -Value $RemoteTempRoot -EnvName 'WORLD_BACKEND_REFERENCE_TEMP_ROOT' -Default '/tmp/backend-reference-download' -ScriptRoot $PSScriptRoot
$LocalRoot = Resolve-RemoteSetting -Value $LocalRoot -EnvName 'WORLD_BACKEND_REFERENCE_LOCAL_ROOT' -Default (Join-Path (Split-Path -Parent $Workspace) 'Official-backend') -ScriptRoot $PSScriptRoot

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localArchive = Join-Path $env:TEMP "official-backend-ref-$timestamp.tar.gz"
$localStageRoot = Join-Path $env:TEMP "official-backend-ref-stage-$timestamp"
$localBackupRoot = "$LocalRoot.backup-$timestamp"

function Assert-LastExitCode {
	param([string]$Label)

	if ($LASTEXITCODE -ne 0) {
		throw "$Label failed with exit code $LASTEXITCODE"
	}
}

function Remove-PathIfExists {
	param([string]$Path)

	if (Test-Path $Path) {
		Remove-Item -Force -Recurse $Path
	}
}

function Ensure-Directory {
	param([string]$Path)

	if (-not (Test-Path $Path)) {
		New-Item -ItemType Directory -Path $Path | Out-Null
	}
}

$remoteArchive = "$RemoteTempRoot/backend-ref.tar.gz"
$remoteCommand = @(
	"set -eu",
	"mkdir -p '$RemoteTempRoot'",
	"cd '$RemoteRoot'",
	"tar --exclude='.git' --exclude='.env' --exclude='deploy/dev/.env' --exclude='deploy/prod/.env' --exclude='file-data' --exclude='__pycache__' --exclude='.pytest_cache' --exclude='*.pyc' --exclude='.venv' --exclude='venv' -czf '$remoteArchive' ."
) -join ' ; '

try {
	Remove-PathIfExists -Path $localArchive
	Remove-PathIfExists -Path $localStageRoot

	Write-Host 'Creating remote backend reference archive ...'
	ssh $Remote $remoteCommand
	Assert-LastExitCode -Label 'ssh remote backend archive'

	Write-Host 'Downloading backend reference archive ...'
	scp "$Remote`:$remoteArchive" $localArchive
	Assert-LastExitCode -Label 'scp backend reference archive'

	ssh $Remote "rm -f '$remoteArchive'"
	Assert-LastExitCode -Label 'ssh remote backend archive cleanup'

	Write-Host 'Extracting backend reference archive into local staging ...'
	Ensure-Directory -Path $localStageRoot
	tar -xzf $localArchive -C $localStageRoot
	Assert-LastExitCode -Label 'tar backend reference extract'

	if (Test-Path $LocalRoot) {
		Write-Host "Moving existing backend reference to $localBackupRoot ..."
		Move-Item -Path $LocalRoot -Destination $localBackupRoot
	}

	$parentRoot = Split-Path -Parent $LocalRoot
	if ($parentRoot) {
		Ensure-Directory -Path $parentRoot
	}

	Move-Item -Path $localStageRoot -Destination $LocalRoot

	if ((-not $KeepBackup) -and (Test-Path $localBackupRoot)) {
		Remove-PathIfExists -Path $localBackupRoot
	}

	Write-Host 'Backend reference updated.' -ForegroundColor Green
	Write-Host "Local backend reference root: $LocalRoot"
	if ($KeepBackup -and (Test-Path $localBackupRoot)) {
		Write-Host "Backup kept at: $localBackupRoot"
	}
}
finally {
	Remove-PathIfExists -Path $localArchive
	if (Test-Path $localStageRoot) {
		Remove-PathIfExists -Path $localStageRoot
	}
}