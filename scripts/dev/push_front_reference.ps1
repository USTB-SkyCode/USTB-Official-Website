param(
	[Alias('Remote')]
	[string]$SshHost = '',
	[string]$RemoteBaseRoot = '',
	[string]$Workspace = '',
	[string]$RemoteRoot = '',
	[string]$RemoteTempRoot = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'Resolve-RemoteScriptConfig.ps1')

$Remote = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com' -ScriptRoot $PSScriptRoot
$Workspace = Resolve-RemoteSetting -Value $Workspace -EnvName 'WORLD_WORKSPACE_ROOT' -Default (Get-WorldProjectRoot -ScriptRoot $PSScriptRoot) -ScriptRoot $PSScriptRoot
$RemoteBaseRoot = Resolve-RemoteSetting -Value $RemoteBaseRoot -EnvName 'WORLD_REMOTE_ROOT' -Default '/srv/ustb' -ScriptRoot $PSScriptRoot

$defaultRemoteRoot = Join-RemotePath -Base $RemoteBaseRoot -Segments @('dev', 'Official-backend', 'reference', 'front')
$RemoteRoot = Resolve-RemoteSetting -Value $RemoteRoot -EnvName 'WORLD_FRONT_REFERENCE_ROOT' -Default $defaultRemoteRoot -ScriptRoot $PSScriptRoot
$RemoteTempRoot = Resolve-RemoteSetting -Value $RemoteTempRoot -EnvName 'WORLD_FRONT_REFERENCE_TEMP_ROOT' -Default '/tmp/front-reference-upload' -ScriptRoot $PSScriptRoot

$payloadRoot = Join-Path $env:TEMP 'official-front-ref-payload'
$payloadArchive = Join-Path $env:TEMP 'official-front-ref.tar.gz'
$publicDeltaRoot = Join-Path $env:TEMP 'official-front-ref-public-delta'
$publicArchive = Join-Path $env:TEMP 'official-front-ref-public.tar.gz'

function Remove-PathIfExists {
	param([string]$Path)

	if (Test-Path $Path) {
		Remove-Item -Recurse -Force $Path
	}
}

function Assert-LastExitCode {
	param([string]$Label)

	if ($LASTEXITCODE -ne 0) {
		throw "$Label failed with exit code $LASTEXITCODE"
	}
}

function Assert-RobocopyExitCode {
	param([string]$Label)

	if ($LASTEXITCODE -gt 7) {
		throw "$Label failed with exit code $LASTEXITCODE"
	}
}

function Copy-IfExists {
	param(
		[string]$Source,
		[string]$Destination
	)

	if (Test-Path $Source) {
		$destinationDir = Split-Path -Parent $Destination
		if ($destinationDir) {
			New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
		}
		Copy-Item $Source -Destination $Destination -Force
	}
}

function Get-RemotePublicMtimeMap {
	param(
		[string]$RemoteName,
		[string]$RemotePublicRoot
	)

	$command = "if [ -d '$RemotePublicRoot' ]; then cd '$RemotePublicRoot' && find . -type f -printf '%P|%T@`n'; fi"
	$lines = ssh $RemoteName $command
	Assert-LastExitCode -Label 'ssh remote public stat'

	$result = @{}
	foreach ($line in $lines) {
		if ([string]::IsNullOrWhiteSpace($line)) {
			continue
		}

		$parts = $line -split '\|', 2
		if ($parts.Length -ne 2) {
			continue
		}

		$relativePath = ($parts[0] -replace '^[./]+', '').Trim()
		$mtimeRaw = $parts[1].Trim()
		$mtime = 0.0
		if (-not [double]::TryParse($mtimeRaw, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$mtime)) {
			continue
		}

		$result[$relativePath] = $mtime
	}

	return $result
}

function Get-LocalUnixTimestamp {
	param([datetime]$Value)

	return [long][DateTimeOffset]::new($Value.ToUniversalTime()).ToUnixTimeSeconds()
}

function Build-PublicDelta {
	param(
		[string]$LocalPublicRoot,
		[string]$DeltaRoot,
		[hashtable]$RemoteMtimeMap
	)

	if (-not (Test-Path $LocalPublicRoot)) {
		return 0
	}

	$changedCount = 0
	$publicPrefix = $LocalPublicRoot.TrimEnd('\') + '\'

	Get-ChildItem -Path $LocalPublicRoot -Recurse -File | ForEach-Object {
		$relativePath = $_.FullName.Substring($publicPrefix.Length).Replace('\', '/')
		$localUnixTime = Get-LocalUnixTimestamp -Value $_.LastWriteTimeUtc
		$remoteUnixTime = if ($RemoteMtimeMap.ContainsKey($relativePath)) { [long][math]::Floor([double]$RemoteMtimeMap[$relativePath]) } else { -1 }

		if ($remoteUnixTime -ge $localUnixTime) {
			return
		}

		$destination = Join-Path (Join-Path $DeltaRoot 'public') $relativePath.Replace('/', '\')
		Copy-IfExists -Source $_.FullName -Destination $destination
		$changedCount += 1
	}

	return $changedCount
}

function Build-MainPayload {
	param(
		[string]$SourceRoot,
		[string]$DestinationRoot
	)

	$topFiles = @(
		'.editorconfig',
		'.env.example',
		'.env.local.example',
		'.gitattributes',
		'.gitignore',
		'.npmrc',
		'.prettierignore',
		'.prettierrc.json',
		'base.md',
		'config.template.js',
		'env.d.ts',
		'eslint.config.ts',
		'index.html',
		'package-lock.json',
		'package.json',
		'README.md',
		'tsconfig.app.json',
		'tsconfig.eslint.json',
		'tsconfig.json',
		'tsconfig.node.json',
		'vite.config.ts'
	)

	foreach ($file in $topFiles) {
		Copy-IfExists -Source (Join-Path $SourceRoot $file) -Destination (Join-Path $DestinationRoot $file)
	}

	$extensionsJson = Join-Path $SourceRoot '.vscode\extensions.json'
	$settingsJson = Join-Path $SourceRoot '.vscode\settings.json'
	if ((Test-Path $extensionsJson) -or (Test-Path $settingsJson)) {
		Copy-IfExists -Source $extensionsJson -Destination (Join-Path $DestinationRoot '.vscode\extensions.json')
		Copy-IfExists -Source $settingsJson -Destination (Join-Path $DestinationRoot '.vscode\settings.json')
	}

	robocopy (Join-Path $SourceRoot 'src') (Join-Path $DestinationRoot 'src') /E /NFL /NDL /NJH /NJS /NP | Out-Null
	Assert-RobocopyExitCode -Label 'robocopy src'

	robocopy (Join-Path $SourceRoot 'core') (Join-Path $DestinationRoot 'core') /E /XD target pkg /XF flamegraph.svg perf.data perf.data.old profile-summary.txt profile.json profile.json.gz | Out-Null
	Assert-RobocopyExitCode -Label 'robocopy core'

	$blockParserRoot = Join-Path $SourceRoot 'scripts\BlockPaser'
	if (Test-Path $blockParserRoot) {
		robocopy $blockParserRoot (Join-Path $DestinationRoot 'scripts\BlockPaser') /E /NFL /NDL /NJH /NJS /NP | Out-Null
		Assert-RobocopyExitCode -Label 'robocopy scripts/BlockPaser'
	}

	Copy-IfExists -Source (Join-Path $SourceRoot 'scripts\tsconfig.json') -Destination (Join-Path $DestinationRoot 'scripts\tsconfig.json')
	Copy-IfExists -Source (Join-Path $SourceRoot 'resource\.gitkeep') -Destination (Join-Path $DestinationRoot 'resource\.gitkeep')
	Copy-IfExists -Source (Join-Path $SourceRoot 'resource\mca\.gitkeep') -Destination (Join-Path $DestinationRoot 'resource\mca\.gitkeep')
}

try {
	Remove-PathIfExists -Path $payloadRoot
	Remove-PathIfExists -Path $payloadArchive
	Remove-PathIfExists -Path $publicDeltaRoot
	Remove-PathIfExists -Path $publicArchive

	New-Item -ItemType Directory -Path $payloadRoot | Out-Null
	Build-MainPayload -SourceRoot $Workspace -DestinationRoot $payloadRoot

	Write-Host 'Compressing main reference payload ...'
	tar -czf $payloadArchive -C $payloadRoot .
	Assert-LastExitCode -Label 'tar main payload'

	Write-Host 'Uploading main reference payload ...'
	ssh $Remote "mkdir -p '$RemoteRoot' '$RemoteTempRoot'"
	Assert-LastExitCode -Label 'ssh remote mkdir'

	scp $payloadArchive "$Remote`:$RemoteTempRoot/front-ref-main.tar.gz"
	Assert-LastExitCode -Label 'scp main payload'

	ssh $Remote "tar -xzf '$RemoteTempRoot/front-ref-main.tar.gz' -C '$RemoteRoot' && rm -f '$RemoteTempRoot/front-ref-main.tar.gz'"
	Assert-LastExitCode -Label 'ssh extract main payload'

	$remotePublicMap = Get-RemotePublicMtimeMap -RemoteName $Remote -RemotePublicRoot "$RemoteRoot/public"
	$changedPublicCount = Build-PublicDelta -LocalPublicRoot (Join-Path $Workspace 'public') -DeltaRoot $publicDeltaRoot -RemoteMtimeMap $remotePublicMap

	if ($changedPublicCount -gt 0) {
		Write-Host "Uploading $changedPublicCount changed public file(s) by mtime ..."
		tar -czf $publicArchive -C $publicDeltaRoot public
		Assert-LastExitCode -Label 'tar public delta'

		scp $publicArchive "$Remote`:$RemoteTempRoot/front-ref-public.tar.gz"
		Assert-LastExitCode -Label 'scp public delta'

		ssh $Remote "tar -xzf '$RemoteTempRoot/front-ref-public.tar.gz' -C '$RemoteRoot' && rm -f '$RemoteTempRoot/front-ref-public.tar.gz'"
		Assert-LastExitCode -Label 'ssh extract public delta'
	}
	else {
		Write-Host 'No changed public files detected by mtime; skipped public upload.'
	}

	Write-Host 'Front reference payload uploaded.' -ForegroundColor Green
	Write-Host "Remote reference root: $RemoteRoot"
}
finally {
	Remove-PathIfExists -Path $payloadRoot
	Remove-PathIfExists -Path $payloadArchive
	Remove-PathIfExists -Path $publicDeltaRoot
	Remove-PathIfExists -Path $publicArchive
}