param(
    [ValidateSet('ensure', 'validate', 'watch')]
    [string]$Action = 'ensure',
    [string]$SshHost = '',
    [string]$SessionName = 'official-backend-dev',
    [string]$LocalRoot = '',
    [string]$RemoteRoot = '',
    [string]$RemoteDevComposeRoot = '',
    [string]$InstallRoot = '',
    [double]$WatchInterval = 0.5
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'Resolve-RemoteScriptConfig.ps1')

$projectRoot = Get-WorldProjectRoot -ScriptRoot $PSScriptRoot
$sshHost = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com'
$localRoot = Resolve-RemoteSetting -Value $LocalRoot -EnvName 'WORLD_BACKEND_REFERENCE_LOCAL_ROOT' -Default (Join-Path (Split-Path -Parent $projectRoot) 'Official-backend')
$remoteRoot = Resolve-RemoteSetting -Value $RemoteRoot -EnvName 'WORLD_BACKEND_MUTAGEN_REMOTE_ROOT' -Default '/srv/ustb/dev/Official-backend'
$remoteDevComposeRoot = Resolve-RemoteSetting -Value $RemoteDevComposeRoot -EnvName 'WORLD_BACKEND_DEV_COMPOSE_ROOT' -Default '/srv/ustb/dev/Official-backend/deploy/dev'
$installRoot = Resolve-RemoteSetting -Value $InstallRoot -EnvName 'WORLD_MUTAGEN_INSTALL_ROOT' -Default (Join-Path $env:USERPROFILE 'tools\mutagen')
$mutagenExe = Join-Path $installRoot 'mutagen.exe'
$mutagenAgents = Join-Path $installRoot 'mutagen-agents.tar.gz'

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

function Invoke-Mutagen {
    param([string[]]$Arguments)
    & $mutagenExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Mutagen failed: $mutagenExe $($Arguments -join ' ')"
    }
}

function Initialize-Mutagen {
    if ((Test-Path $mutagenExe) -and (Test-Path $mutagenAgents)) {
        return
    }

    New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/mutagen-io/mutagen/releases/latest'
    $asset = $release.assets | Where-Object { $_.name -match '^mutagen_windows_amd64_v.+\.zip$' } | Select-Object -First 1
    if (-not $asset) {
        throw 'Unable to locate the Windows amd64 Mutagen release asset.'
    }

    $zipPath = Join-Path $env:TEMP $asset.name
    $extractRoot = Join-Path $env:TEMP ("mutagen-extract-" + [System.Guid]::NewGuid().ToString('N'))
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
    $downloadedFiles = Get-ChildItem -Path $extractRoot -Recurse | Where-Object { -not $_.PSIsContainer }
    $downloadedExe = $downloadedFiles | Where-Object { $_.Name -eq 'mutagen.exe' } | Select-Object -First 1
    $downloadedAgents = $downloadedFiles | Where-Object { $_.Name -eq 'mutagen-agents.tar.gz' } | Select-Object -First 1
    if ((-not $downloadedExe) -or (-not $downloadedAgents)) {
        throw 'Downloaded Mutagen archive did not contain the full runtime payload.'
    }

    if (-not (Test-Path $mutagenExe)) {
        Copy-Item -Path $downloadedExe.FullName -Destination $mutagenExe -Force
    }
    if (-not (Test-Path $mutagenAgents)) {
        Copy-Item -Path $downloadedAgents.FullName -Destination $mutagenAgents -Force
    }
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractRoot -Force -Recurse -ErrorAction SilentlyContinue
}

function Invoke-RemoteCommand {
    param([string]$Command)
    ssh $sshHost $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Remote command failed on $sshHost"
    }
}

function Test-SessionExists {
    $ErrorActionPreference = 'SilentlyContinue'
    $null = & $mutagenExe sync list $SessionName 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    return ($exitCode -eq 0)
}

function Test-SessionNeedsRecreate {
    if (-not (Test-SessionExists)) {
        return $false
    }

    $ErrorActionPreference = 'SilentlyContinue'
    $details = (& $mutagenExe sync list '--long' $SessionName 2>&1) -join "`n"
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    
    if ($exitCode -ne 0) {
        return $false
    }

    $expectedAlpha = [regex]::Escape($localRoot)
    $expectedBeta = [regex]::Escape("${sshHost}:$remoteRoot")
    $requiredIgnorePatterns = @(
        '(?m)^\s+\.env$',
        '(?m)^\s+deploy/dev/\.env$',
        '(?m)^\s+deploy/prod/\.env$'
    )
    $missingIgnoreRule = $false
    foreach ($pattern in $requiredIgnorePatterns) {
        if ($details -notmatch $pattern) {
            $missingIgnoreRule = $true
            break
        }
    }

    return (
        $missingIgnoreRule -or
        $details -notmatch $expectedAlpha -or
        $details -notmatch $expectedBeta
    )
}

function Reset-SessionIfAmbiguous {
    $ErrorActionPreference = 'SilentlyContinue'
    $syncOutput = & $mutagenExe sync list 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    
    if ($exitCode -ne 0) {
        return
    }
    
    $sessionMatches = @($syncOutput | Select-String -Pattern "^Name:\s+$([regex]::Escape($SessionName))$").Count
    if ($sessionMatches -gt 1) {
        Invoke-Mutagen -Arguments @('sync', 'terminate', $SessionName)
    }
}

function Initialize-Session {
    if (-not (Test-Path $localRoot)) {
        throw "Local backend root not found: $localRoot"
    }

    Invoke-RemoteCommand "mkdir -p '$remoteRoot'"
    Reset-SessionIfAmbiguous
    
    if (Test-SessionNeedsRecreate) {
        Invoke-Mutagen -Arguments @('sync', 'terminate', $SessionName)
    }
    
    if (-not (Test-SessionExists)) {
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
        $arguments += @(
            $localRoot,
            "${sshHost}:$remoteRoot"
        )
        Invoke-Mutagen -Arguments $arguments
    }

    Invoke-Mutagen -Arguments @('sync', 'resume', $SessionName)
    Invoke-Mutagen -Arguments @('sync', 'flush', $SessionName)
}

function Validate-State {
    Write-Output '=== Mutagen Version ==='
    Invoke-Mutagen -Arguments @('version')

    Write-Output '=== Sync Session ==='
    Invoke-Mutagen -Arguments @('sync', 'list', '--long', $SessionName)

    Write-Output '=== Remote Root ==='
    Invoke-RemoteCommand "cd '$remoteRoot' && pwd && find . -maxdepth 2 -type d | sort | sed -n '1,80p'"

    Write-Output '=== Development Compose Status ==='
    Invoke-RemoteCommand "cd '$remoteDevComposeRoot' && pwd && docker compose ps"

    Write-Output '=== Dev Backend Health ==='
    Invoke-RemoteCommand "docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' official-backend-dev-app 2>/dev/null || echo missing"

    Write-Output '=== Dev Worker State ==='
    Invoke-RemoteCommand "docker inspect --format='{{.State.Status}}' official-backend-dev-worker 2>/dev/null || echo missing"
}

function Show-WatchDisplay {
    param([double]$IntervalSeconds = 0.5)
    
    $spinner = @('|', '/', '-', '\')
    $spinIdx = 0
    
    while ($true) {
        $ErrorActionPreference = 'SilentlyContinue'
        $details = & $mutagenExe sync list --long $SessionName 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        
        Clear-Host
        
        $timestamp = Get-Date -Format 'HH:mm:ss.fff'
        $spinChar = $spinner[$spinIdx % 4]
        $spinIdx++
        
        Write-Host "+------------------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host "|  MUTAGEN LIVE WATCH  [$spinChar]  $timestamp                          |" -ForegroundColor Cyan
        Write-Host "+------------------------------------------------------------------+" -ForegroundColor Cyan
        
        if ($exitCode -ne 0) {
            Write-Host "|  [!] Session not running                                          |" -ForegroundColor Red
            Write-Host "|      Initializing...                                              |" -ForegroundColor Yellow
            
            try {
                Initialize-Session
                continue
            }
            catch {
                Write-Host "|  [X] Init failed: $_" -ForegroundColor Red
            }
        }
        else {
            $status = "Unknown"
            $alphaConnected = $false
            $betaConnected = $false
            $fileCount = 0
            $stagingCount = 0
            $transitionCount = 0
            
            foreach ($line in $details) {
                if ($line -match "Status:\s+(\w+)") { 
                    $status = $matches[1]
                }
                if ($line -match "Connected") { 
                    if ($line -match "Alpha") { $alphaConnected = $true }
                    if ($line -match "Beta") { $betaConnected = $true }
                }
                if ($line -match "Scanned:\s+(\d+)") { $fileCount = [int]$matches[1] }
                if ($line -match "Staging:\s+(\d+)") { $stagingCount = [int]$matches[1] }
                if ($line -match "Transitioning:\s+(\d+)") { $transitionCount = [int]$matches[1] }
            }
            
            $statusColor = switch ($status) {
                "Watching" { "Green" }
                "Scanning" { "Yellow" }
                "Staging" { "Cyan" }
                "Transitioning" { "Magenta" }
                "Halted" { "Red" }
                default { "Gray" }
            }
            
            $alphaIcon = if ($alphaConnected) { "[OK]" } else { "[XX]" }
            $betaIcon = if ($betaConnected) { "[OK]" } else { "[XX]" }
            
            Write-Host "|  Status: " -NoNewline
            Write-Host "$status" -ForegroundColor $statusColor -NoNewline
            Write-Host " " -NoNewline
            
            $activity = switch ($status) {
                "Watching" { "[Monitoring]" }
                "Scanning" { "[Scanning files]" }
                "Staging" { "[Preparing sync]" }
                "Transitioning" { "[Syncing...]" }
                "Halted" { "[Paused]" }
                default { "[Waiting]" }
            }
            Write-Host $activity -ForegroundColor White
            
            Write-Host "+------------------------------------------------------------------+" -ForegroundColor Cyan
            Write-Host "|  Connect: $alphaIcon Local  ->  $betaIcon $sshHost" -ForegroundColor Gray
            Write-Host "|  Files: $fileCount scanned" -ForegroundColor Gray
            
            if ($stagingCount -gt 0 -or $transitionCount -gt 0) {
                Write-Host "+------------------------------------------------------------------+" -ForegroundColor Cyan
                Write-Host "|  Transfer Queue:" -ForegroundColor Yellow
                if ($stagingCount -gt 0) {
                    Write-Host "|     Staging: $stagingCount files" -ForegroundColor Cyan
                }
                if ($transitionCount -gt 0) {
                    Write-Host "|     Active: $transitionCount files" -ForegroundColor Green
                    
                    $barWidth = 40
                    $filled = [math]::Min($transitionCount, $barWidth)
                    if ($filled -gt $barWidth) { $filled = $barWidth }
                    $empty = $barWidth - $filled
                    $bar = "#" * $filled + "-" * $empty
                    Write-Host "|     [$bar]" -ForegroundColor Green
                }
            }
            
            Write-Host "+------------------------------------------------------------------+" -ForegroundColor Cyan
            Write-Host "|  Session: $SessionName" -ForegroundColor Gray
            Write-Host "|  Local:  $localRoot" -ForegroundColor DarkGray
            Write-Host "|  Remote: ${sshHost}:$remoteRoot" -ForegroundColor DarkGray
        }
        
        Write-Host "+------------------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host "  Press Ctrl+C to exit" -ForegroundColor DarkGray
        
        Start-Sleep -Milliseconds ([int]($IntervalSeconds * 1000))
    }
}

Initialize-Mutagen

switch ($Action) {
    'ensure' {
        Initialize-Session
    }
    'validate' {
        Initialize-Session
        Validate-State
    }
    'watch' {
        if (-not (Test-SessionExists)) {
            Write-Host "[!] Session not found, initializing..." -ForegroundColor Yellow
            Initialize-Session
            Start-Sleep -Seconds 1
        }
        Show-WatchDisplay -IntervalSeconds $WatchInterval
    }
}