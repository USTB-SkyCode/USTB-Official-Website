param(
	[ValidateSet('install', 'start', 'stop', 'status', 'tail', 'install-service', 'service-status', 'uninstall-service')]
	[string]$Action = 'status',
	[Alias('Remote')]
	[string]$SshHost = '',
	[string]$RemoteRoot = '',
	[double]$IntervalSeconds = 1.0,
	[int]$TailLines = 20
)

. (Join-Path $PSScriptRoot '..\Resolve-RemoteScriptConfig.ps1')

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$sshHost = Resolve-RemoteSetting -Value $SshHost -EnvName 'WORLD_SSH_HOST' -Default 'user@example.com'
$remoteRoot = Resolve-RemoteSetting -Value $RemoteRoot -EnvName 'WORLD_VSCODE_MONITOR_ROOT' -Default '~/.local/share/world-vscode-monitor'
$localMonitor = Join-Path $projectRoot 'scripts\dev\remote\vscode_resource_monitor.py'
$remoteMonitor = "$remoteRoot/vscode_resource_monitor.py"

if (-not (Test-Path $localMonitor)) {
	throw "Local monitor script not found: $localMonitor"
}

function Invoke-RemoteCommand {
	param([string]$Command)
	ssh $sshHost $Command
	if ($LASTEXITCODE -ne 0) {
		throw "Remote command failed on $sshHost"
	}
}

function Get-RemoteUser {
	$remoteUser = ssh $sshHost 'whoami'
	if ($LASTEXITCODE -ne 0) {
		throw "Failed to resolve remote user on $sshHost"
	}

	return ($remoteUser | Out-String).Trim()
}

function Format-RemoteBashCommand {
	param([string]$Template)

	$lines = $Template -split "`r?`n"
	$trimmed = foreach ($line in $lines) {
		$value = $line.Trim()
		if ($value) {
			$value
		}
	}

	return ($trimmed -join ' ')
}

function Install-Monitor {
	Invoke-RemoteCommand "mkdir -p $remoteRoot"
	scp $localMonitor "${sshHost}:$remoteMonitor" | Out-Null
	if ($LASTEXITCODE -ne 0) {
		throw "Failed to copy monitor script to $sshHost"
	}
	Invoke-RemoteCommand "chmod 755 $remoteMonitor"
}

function Start-Monitor {
	Install-Monitor
	$startTemplate = @'
mkdir -p {REMOTE_ROOT};
if [ -f {REMOTE_ROOT}/monitor.pid ]; then
	old_pid=$(cat {REMOTE_ROOT}/monitor.pid 2>/dev/null);
	if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
		echo already-running:$old_pid;
		exit 0;
	fi;
fi;
nohup python3 {REMOTE_MONITOR} --root {REMOTE_ROOT} --interval {INTERVAL} >> {REMOTE_ROOT}/launcher.log 2>&1 < /dev/null &
new_pid=$!;
echo $new_pid > {REMOTE_ROOT}/monitor.pid;
sleep 2;
echo started:$new_pid;
tail -n 3 {REMOTE_ROOT}/events.jsonl 2>/dev/null || true;
'@
	$startCommand = Format-RemoteBashCommand ($startTemplate.Replace('{REMOTE_ROOT}', $remoteRoot).Replace('{REMOTE_MONITOR}', $remoteMonitor).Replace('{INTERVAL}', $IntervalSeconds.ToString([System.Globalization.CultureInfo]::InvariantCulture)))
	Invoke-RemoteCommand "bash -lc '$startCommand'"
}

function Stop-Monitor {
	$stopTemplate = @'
if [ ! -f {REMOTE_ROOT}/monitor.pid ]; then
	echo not-running;
	exit 0;
fi;
pid=$(cat {REMOTE_ROOT}/monitor.pid 2>/dev/null);
if [ -z "$pid" ]; then
	echo not-running;
	exit 0;
fi;
if kill -0 "$pid" 2>/dev/null; then
	kill "$pid";
	sleep 1;
	echo stopped:$pid;
else
	echo stale-pid:$pid;
fi;
rm -f {REMOTE_ROOT}/monitor.pid;
'@
	$stopCommand = Format-RemoteBashCommand ($stopTemplate.Replace('{REMOTE_ROOT}', $remoteRoot))
	Invoke-RemoteCommand "bash -lc '$stopCommand'"
}

function Show-Status {
	$statusTemplate = @'
if [ -f {REMOTE_ROOT}/monitor.pid ]; then
	pid=$(cat {REMOTE_ROOT}/monitor.pid 2>/dev/null);
	if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
		echo running:$pid;
	else
		echo stale-pid:$pid;
	fi;
else
	echo not-running;
fi;
echo --- state ---;
cat {REMOTE_ROOT}/monitor_state.json 2>/dev/null || true;
echo --- recent events ---;
tail -n {TAIL_LINES} {REMOTE_ROOT}/events.jsonl 2>/dev/null || true;
echo --- recent samples ---;
tail -n 2 {REMOTE_ROOT}/samples.jsonl 2>/dev/null || true;
'@
	$statusCommand = Format-RemoteBashCommand ($statusTemplate.Replace('{REMOTE_ROOT}', $remoteRoot).Replace('{TAIL_LINES}', $TailLines.ToString()))
	Invoke-RemoteCommand "bash -lc '$statusCommand'"
}

function Tail-Logs {
	$tailTemplate = @'
tail -n {TAIL_LINES} {REMOTE_ROOT}/events.jsonl 2>/dev/null;
echo ---;
tail -n {TAIL_LINES} {REMOTE_ROOT}/samples.jsonl 2>/dev/null;
'@
	$tailCommand = "bash -lc '$(Format-RemoteBashCommand ($tailTemplate.Replace('{REMOTE_ROOT}', $remoteRoot).Replace('{TAIL_LINES}', $TailLines.ToString())))'"
	Invoke-RemoteCommand $tailCommand
}

function Install-MonitorService {
	Install-Monitor
	$remoteUser = Get-RemoteUser
	$unitName = 'world-vscode-monitor.service'
	$remoteUnitTmp = "/tmp/$unitName"
	$serviceRoot = $remoteRoot
	$serviceMonitor = $remoteMonitor
	if ($serviceRoot -eq '~') {
		$serviceRoot = "/home/$remoteUser"
	}
	elseif ($serviceRoot.StartsWith('~/')) {
		$serviceRoot = "/home/$remoteUser/$($serviceRoot.Substring(2))"
	}
	if ($serviceMonitor -eq '~') {
		$serviceMonitor = "/home/$remoteUser"
	}
	elseif ($serviceMonitor.StartsWith('~/')) {
		$serviceMonitor = "/home/$remoteUser/$($serviceMonitor.Substring(2))"
	}
	$unitContent = @"
[Unit]
Description=World VS Code resource monitor
After=network.target

[Service]
Type=simple
User=$remoteUser
Group=$remoteUser
WorkingDirectory=$serviceRoot
ExecStart=/usr/bin/python3 $serviceMonitor --root $serviceRoot --interval $($IntervalSeconds.ToString([System.Globalization.CultureInfo]::InvariantCulture))
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
"@
	$tempUnitPath = [System.IO.Path]::GetTempFileName()
	Set-Content -Path $tempUnitPath -Value $unitContent -Encoding ASCII
	Stop-Monitor
	scp $tempUnitPath "${sshHost}:$remoteUnitTmp" | Out-Null
	if ($LASTEXITCODE -ne 0) {
		Remove-Item -Path $tempUnitPath -Force -ErrorAction SilentlyContinue
		throw "Failed to copy systemd unit to $sshHost"
	}
	Remove-Item -Path $tempUnitPath -Force -ErrorAction SilentlyContinue
	Invoke-RemoteCommand "sudo systemctl disable --now $unitName 2>/dev/null || true"
	Invoke-RemoteCommand "sudo systemctl unmask $unitName 2>/dev/null || true"
	Invoke-RemoteCommand "sudo rm -f /etc/systemd/system/$unitName"
	Invoke-RemoteCommand "sudo mv $remoteUnitTmp /etc/systemd/system/$unitName"
	Invoke-RemoteCommand "sudo chown root:root /etc/systemd/system/$unitName"
	Invoke-RemoteCommand "sudo chmod 644 /etc/systemd/system/$unitName"
	Invoke-RemoteCommand "sudo systemctl daemon-reload"
	Invoke-RemoteCommand "sudo systemctl enable --now $unitName"
	Invoke-RemoteCommand "sudo systemctl --no-pager --full status $unitName | sed -n '1,20p'"
}

function Show-ServiceStatus {
	Invoke-RemoteCommand "sudo systemctl --no-pager --full status world-vscode-monitor.service"
}

function Uninstall-MonitorService {
	$removeTemplate = @'
systemctl disable --now world-vscode-monitor.service 2>/dev/null || true;
rm -f /etc/systemd/system/world-vscode-monitor.service;
systemctl daemon-reload;
systemctl reset-failed world-vscode-monitor.service 2>/dev/null || true;
'@
	$removeCommand = "sudo bash -lc '$(Format-RemoteBashCommand $removeTemplate)'"
	Invoke-RemoteCommand $removeCommand
}

switch ($Action) {
	'install' { Install-Monitor }
	'start' { Start-Monitor }
	'stop' { Stop-Monitor }
	'status' { Show-Status }
	'tail' { Tail-Logs }
	'install-service' { Install-MonitorService }
	'service-status' { Show-ServiceStatus }
	'uninstall-service' { Uninstall-MonitorService }
}