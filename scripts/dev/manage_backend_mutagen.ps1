param(
	[ValidateSet('create', 'list', 'monitor', 'flush', 'pause', 'resume', 'terminate', 'dev-up', 'dev-status', 'restart-backend', 'restart-worker', 'prod-status', 'prod-rebuild')]
	[string]$Action = 'list',
	[Alias('Remote')]
	[string]$SshHost = '',
	[string]$LocalRoot = '',
	[string]$RemoteRoot = '',
	[string]$RemoteDevComposeRoot = '',
	[string]$RemoteProdComposeRoot = '',
	[string]$SessionName = 'official-backend-dev',
	[switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'Resolve-RemoteScriptConfig.ps1')

$projectRoot = Get-WorldProjectRoot -ScriptRoot $PSScriptRoot
$sshHost = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com'
$localRoot = Resolve-RemoteSetting -Value $LocalRoot -EnvName 'WORLD_BACKEND_REFERENCE_LOCAL_ROOT' -Default (Join-Path (Split-Path -Parent $projectRoot) 'Official-backend')
$remoteRoot = Resolve-RemoteSetting -Value $RemoteRoot -EnvName 'WORLD_BACKEND_MUTAGEN_REMOTE_ROOT' -Default '/srv/ustb/dev/Official-backend'
$remoteDevComposeRoot = Resolve-RemoteSetting -Value $RemoteDevComposeRoot -EnvName 'WORLD_BACKEND_DEV_COMPOSE_ROOT' -Default '/srv/ustb/dev/Official-backend/deploy/dev'
$remoteProdComposeRoot = Resolve-RemoteSetting -Value $RemoteProdComposeRoot -EnvName 'WORLD_BACKEND_PROD_COMPOSE_ROOT' -Default '/srv/ustb/dev/Official-backend/deploy/prod'

$ignoreRules = @(
	'.env',
	'deploy/dev/.env',
	'deploy/prod/.env',
	'__pycache__',
	'.pytest_cache',
	'.mypy_cache',
	'.ruff_cache',
	'.venv',
	'venv',
	'*.pyc',
	'*.pyo',
	'*.pyd',
	'.coverage',
	'htmlcov',
	'file-data',
	'.idea',
	'.vscode'
)

function Assert-MutagenInstalled {
	$command = Get-Command mutagen -ErrorAction SilentlyContinue
	if (-not $command) {
		throw 'Mutagen is not installed or not on PATH. Install the Windows Mutagen CLI first.'
	}
}

function Assert-LocalRoot {
	if (-not (Test-Path $localRoot)) {
		throw "Local backend root not found: $localRoot"
	}
}

function Invoke-RemoteCommand {
	param([string]$Command)
	ssh $sshHost $Command
	if ($LASTEXITCODE -ne 0) {
		throw "Remote command failed on $sshHost"
	}
}

function New-MutagenCreateArguments {
	$arguments = @(
		'sync',
		'create',
		"--name=$SessionName",
		'--sync-mode=one-way-safe',
		'--ignore-vcs'
	)

	foreach ($rule in $ignoreRules) {
		$arguments += "--ignore=$rule"
	}

	if ($Force) {
		$arguments += '--default-file-mode=0644'
	}

	$arguments += @(
		$localRoot,
		"${sshHost}:$remoteRoot"
	)

	return $arguments
}

function Invoke-MutagenSyncCommand {
	param([string[]]$Arguments)
	Assert-MutagenInstalled
	& mutagen @Arguments
	if ($LASTEXITCODE -ne 0) {
		throw "Mutagen command failed: mutagen $($Arguments -join ' ')"
	}
}

switch ($Action) {
	'create' {
		Assert-LocalRoot
		Invoke-MutagenSyncCommand -Arguments (New-MutagenCreateArguments)
	}
	'list' {
		Invoke-MutagenSyncCommand -Arguments @('sync', 'list')
	}
	'monitor' {
		Invoke-MutagenSyncCommand -Arguments @('sync', 'monitor', $SessionName)
	}
	'flush' {
		Invoke-MutagenSyncCommand -Arguments @('sync', 'flush', $SessionName)
	}
	'pause' {
		Invoke-MutagenSyncCommand -Arguments @('sync', 'pause', $SessionName)
	}
	'resume' {
		Invoke-MutagenSyncCommand -Arguments @('sync', 'resume', $SessionName)
	}
	'terminate' {
		Invoke-MutagenSyncCommand -Arguments @('sync', 'terminate', $SessionName)
	}
	'dev-up' {
		Invoke-RemoteCommand "cd '$remoteDevComposeRoot' && docker compose up -d --build"
	}
	'dev-status' {
		Invoke-RemoteCommand "cd '$remoteDevComposeRoot' && docker compose ps"
	}
	'restart-backend' {
		Invoke-RemoteCommand "cd '$remoteDevComposeRoot' && docker compose restart backend"
	}
	'restart-worker' {
		Invoke-RemoteCommand "cd '$remoteDevComposeRoot' && docker compose restart worker"
	}
	'prod-status' {
		Invoke-RemoteCommand "cd '$remoteProdComposeRoot' && docker compose ps"
	}
	'prod-rebuild' {
		Invoke-RemoteCommand "cd '$remoteProdComposeRoot' && docker compose up -d --build backend worker"
	}
}