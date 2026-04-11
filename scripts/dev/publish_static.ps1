param(
	[Alias('Remote')]
	[string]$SshHost = '',
	[string]$RemoteBaseRoot = '',
	[string]$Workspace = '',
	[string]$RemoteStageBase = '',
	[string]$RemoteStaticRoot = '',
	[string]$RemotePublishScript = '',
	[string]$SmokeCheckBaseUrl = '',
	[int]$KeepReleases = 3
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'Resolve-RemoteScriptConfig.ps1')

$Remote = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com' -ScriptRoot $PSScriptRoot
$Workspace = Resolve-RemoteSetting -Value $Workspace -EnvName 'WORLD_WORKSPACE_ROOT' -Default (Get-WorldProjectRoot -ScriptRoot $PSScriptRoot) -ScriptRoot $PSScriptRoot
$RemoteBaseRoot = Resolve-RemoteSetting -Value $RemoteBaseRoot -EnvName 'WORLD_REMOTE_ROOT' -Default '/srv/ustb' -ScriptRoot $PSScriptRoot

$defaultRemoteStageBase = Join-RemotePath -Base $RemoteBaseRoot -Segments @('dev', 'Official-backend', 'deploy', 'prod', 'payload')
$defaultRemoteStaticRoot = Join-RemotePath -Base $RemoteBaseRoot -Segments @('prod', 'front-static')
$defaultRemotePublishScript = Join-RemotePath -Base $RemoteBaseRoot -Segments @('dev', 'Official-backend', 'deploy', 'prod', 'scripts', 'publish_front_release.sh')

$RemoteStageBase = Resolve-RemoteSetting -Value $RemoteStageBase -EnvName 'WORLD_STATIC_STAGE_ROOT' -Default $defaultRemoteStageBase -ScriptRoot $PSScriptRoot
$RemoteStaticRoot = Resolve-RemoteSetting -Value $RemoteStaticRoot -EnvName 'WORLD_STATIC_ROOT' -Default $defaultRemoteStaticRoot -ScriptRoot $PSScriptRoot
$RemotePublishScript = Resolve-RemoteSetting -Value $RemotePublishScript -EnvName 'WORLD_PUBLISH_SCRIPT' -Default $defaultRemotePublishScript -ScriptRoot $PSScriptRoot
$SmokeCheckBaseUrl = Resolve-RemoteSetting -Value $SmokeCheckBaseUrl -EnvName 'WORLD_SMOKE_BASE_URL' -Default 'https://example.test' -ScriptRoot $PSScriptRoot

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$releaseName = "release-$timestamp"

$distRoot = Join-Path $Workspace 'dist'
$localPayloadRoot = Join-Path $env:TEMP 'ustb_front_static_payload'
$localArchive = Join-Path $env:TEMP 'ustb_front_static_payload.tar.gz'

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

function Assert-PathExists {
	param(
		[string]$Path,
		[string]$Label
	)

	if (-not (Test-Path $Path)) {
		throw "$Label not found: $Path"
	}
}

function Get-SmokeCheckAssetPath {
	param([string]$DistPath)

	$assetsDir = Join-Path $DistPath 'assets'
	if (-not (Test-Path $assetsDir)) {
		throw "dist/assets not found: $assetsDir"
	}

	$file = Get-ChildItem -Path $assetsDir -File |
		Where-Object { $_.Extension -in @('.js', '.css', '.wasm') } |
		Sort-Object Name |
		Select-Object -First 1

	if ($null -eq $file) {
		throw 'No smoke-checkable asset found in dist/assets'
	}

	return "/assets/$($file.Name)"
}

Assert-PathExists -Path $distRoot -Label 'Built dist directory'
Assert-PathExists -Path (Join-Path $distRoot 'assets') -Label 'dist/assets'
Assert-PathExists -Path (Join-Path $distRoot 'basic') -Label 'dist/basic'
Assert-PathExists -Path (Join-Path $distRoot 'model') -Label 'dist/model'
Assert-PathExists -Path (Join-Path $distRoot 'index.html') -Label 'dist/index.html'

$smokeCheckAssetPath = Get-SmokeCheckAssetPath -DistPath $distRoot

try {
	Write-Host 'Preparing static payload ...'
	Remove-PathIfExists -Path $localPayloadRoot
	Remove-PathIfExists -Path $localArchive

	New-Item -ItemType Directory -Path $localPayloadRoot | Out-Null
	Copy-Item -Path (Join-Path $distRoot '*') -Destination $localPayloadRoot -Recurse

	Write-Host 'Compressing payload ...'
	& tar -czf $localArchive -C $localPayloadRoot .
	Assert-LastExitCode -Label 'tar'

	Write-Host 'Uploading compressed payload ...'
	$remoteArchivePath = "$RemoteStageBase/static.tar.gz"
	ssh $Remote "mkdir -p '$RemoteStageBase'"
	Assert-LastExitCode -Label 'ssh remote payload mkdir'
	scp $localArchive "$Remote`:$remoteArchivePath"
	Assert-LastExitCode -Label 'scp payload upload'

	Write-Host 'Calling server-side publisher ...'
	$remoteCommand = @(
		"set -eu",
		"test -x '$RemotePublishScript'",
		"'$RemotePublishScript' --archive '$remoteArchivePath' --static-root '$RemoteStaticRoot' --site-url '$SmokeCheckBaseUrl' --keep '$KeepReleases' --release-name '$releaseName' --smoke-asset '$smokeCheckAssetPath'"
	) -join ' ; '
	ssh $Remote $remoteCommand
	Assert-LastExitCode -Label 'ssh remote publish'

	Write-Host 'Static publish completed.' -ForegroundColor Green
	Write-Host "Remote static root: $RemoteStaticRoot"
	Write-Host "Release name: $releaseName"
	Write-Host "Smoke-checked asset: $smokeCheckAssetPath"
}
finally {
	Remove-PathIfExists -Path $localPayloadRoot
	Remove-PathIfExists -Path $localArchive
}