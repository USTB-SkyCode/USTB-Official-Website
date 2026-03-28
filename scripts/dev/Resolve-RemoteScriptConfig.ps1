function Get-WorldProjectRoot {
	param([string]$ScriptRoot)

	if ([string]::IsNullOrWhiteSpace($ScriptRoot)) {
		throw 'Script root is required.'
	}

	return [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot '..\..'))
}

$script:WorldEnvLocalCacheInitialized = $false
$script:WorldEnvLocalCache = @{}

function Get-WorldEnvLocalMap {
	param([string]$ScriptRoot)

	if ($script:WorldEnvLocalCacheInitialized) {
		return $script:WorldEnvLocalCache
	}

	$script:WorldEnvLocalCacheInitialized = $true
	$script:WorldEnvLocalCache = @{}

	if ([string]::IsNullOrWhiteSpace($ScriptRoot)) {
		return $script:WorldEnvLocalCache
	}

	$worldRoot = Get-WorldProjectRoot -ScriptRoot $ScriptRoot
	$envFile = Join-Path $worldRoot '.env.local'
	if (-not (Test-Path $envFile)) {
		return $script:WorldEnvLocalCache
	}

	$lines = Get-Content -Path $envFile
	foreach ($line in $lines) {
		if ([string]::IsNullOrWhiteSpace($line)) {
			continue
		}

		$trimmedLine = $line.Trim()
		if ($trimmedLine.StartsWith('#')) {
			continue
		}

		$eqIndex = $trimmedLine.IndexOf('=')
		if ($eqIndex -lt 1) {
			continue
		}

		$key = $trimmedLine.Substring(0, $eqIndex).Trim()
		if ($key.StartsWith('export ')) {
			$key = $key.Substring(7).Trim()
		}

		if ([string]::IsNullOrWhiteSpace($key)) {
			continue
		}

		$value = $trimmedLine.Substring($eqIndex + 1).Trim()
		if ($value.Length -ge 2) {
			if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
				$value = $value.Substring(1, $value.Length - 2)
			}
		}

		$script:WorldEnvLocalCache[$key] = $value
	}

	return $script:WorldEnvLocalCache
}

function Join-RemotePath {
	param(
		[string]$Base,
		[string[]]$Segments
	)

	if ([string]::IsNullOrWhiteSpace($Base)) {
		throw 'Remote base path is required.'
	}

	$current = $Base.TrimEnd('/')
	foreach ($segment in $Segments) {
		if ([string]::IsNullOrWhiteSpace($segment)) {
			continue
		}

		$current = "$current/$($segment.Trim('/'))"
	}

	return $current
}

function Resolve-RemoteSetting {
	param(
		[AllowEmptyString()]
		[string]$Value,
		[string]$EnvName,
		[string]$Default = '',
		[string]$ScriptRoot = ''
	)

	if (-not [string]::IsNullOrWhiteSpace($Value)) {
		return $Value
	}

	if (-not [string]::IsNullOrWhiteSpace($EnvName)) {
		$envValue = [Environment]::GetEnvironmentVariable($EnvName)
		if (-not [string]::IsNullOrWhiteSpace($envValue)) {
			return $envValue
		}

		$envLocalMap = Get-WorldEnvLocalMap -ScriptRoot $ScriptRoot
		if ($envLocalMap.ContainsKey($EnvName)) {
			$localValue = [string]$envLocalMap[$EnvName]
			if (-not [string]::IsNullOrWhiteSpace($localValue)) {
				return $localValue
			}
		}
	}

	return $Default
}