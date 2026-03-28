#!/usr/bin/env python3
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


RUNNING = True


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_meminfo() -> dict:
    data = {}
    try:
        with open('/proc/meminfo', 'r', encoding='utf-8') as handle:
            for line in handle:
                key, value = line.split(':', 1)
                amount = value.strip().split()[0]
                data[key] = int(amount)
    except Exception as exc:
        data['error'] = str(exc)
    return {
        'mem_total_kb': data.get('MemTotal'),
        'mem_available_kb': data.get('MemAvailable'),
        'swap_total_kb': data.get('SwapTotal'),
        'swap_free_kb': data.get('SwapFree'),
        'raw_error': data.get('error'),
    }


def run_ps() -> list[dict]:
    command = [
        'ps',
        '-eo',
        'pid=,ppid=,pcpu=,pmem=,rss=,vsz=,etimes=,state=,comm=,args=',
        '--sort=-rss',
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or 'ps failed')

    rows = []
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split(None, 9)
        if len(parts) < 10:
            continue
        pid, ppid, pcpu, pmem, rss, vsz, etimes, state, comm, args = parts
        rows.append(
            {
                'pid': int(pid),
                'ppid': int(ppid),
                'cpu_percent': float(pcpu),
                'mem_percent': float(pmem),
                'rss_kb': int(rss),
                'vsz_kb': int(vsz),
                'elapsed_seconds': int(etimes),
                'state': state,
                'command': comm,
                'args': args,
            }
        )
    return rows


def is_relevant_process(proc: dict) -> bool:
    args = proc['args']
    command = proc['command']
    markers = (
        '.vscode-server',
        'extensionhost',
        'ptyhost',
        'github.copilot',
        'copilot',
        'ripgrep',
        '/rg',
    )
    args_lower = args.lower()
    command_lower = command.lower()
    if any(marker in args_lower for marker in markers):
        return True
    if command_lower in {'rg', 'ripgrep'}:
        return True
    return False


def get_relevant_processes() -> list[dict]:
    return [proc for proc in run_ps() if is_relevant_process(proc)]


def append_json_line(handle, payload: dict) -> None:
    handle.write(json.dumps(payload, ensure_ascii=False) + '\n')
    handle.flush()
    os.fsync(handle.fileno())


def write_state(path: Path, payload: dict) -> None:
    tmp_path = path.with_suffix('.tmp')
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp_path, path)


def signal_handler(signum, _frame):
    global RUNNING
    RUNNING = False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--interval', type=float, default=1.0)
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    root.mkdir(parents=True, exist_ok=True)

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    pid_path = root / 'monitor.pid'
    state_path = root / 'monitor_state.json'
    samples_path = root / 'samples.jsonl'
    events_path = root / 'events.jsonl'

    pid_path.write_text(str(os.getpid()), encoding='utf-8')

    session_started_at = utc_now()
    hostname = socket.gethostname()
    known_pids: dict[int, dict] = {}
    sample_count = 0

    with samples_path.open('a', encoding='utf-8', buffering=1) as samples_handle, events_path.open(
        'a', encoding='utf-8', buffering=1
    ) as events_handle:
        append_json_line(
            events_handle,
            {
                'ts': session_started_at,
                'type': 'monitor_started',
                'pid': os.getpid(),
                'hostname': hostname,
                'interval_seconds': args.interval,
                'root': str(root),
            },
        )

        while RUNNING:
            ts = utc_now()
            try:
                meminfo = read_meminfo()
                load1, load5, load15 = os.getloadavg()
                processes = get_relevant_processes()
                process_map = {proc['pid']: proc for proc in processes}

                for pid, proc in process_map.items():
                    if pid not in known_pids:
                        append_json_line(
                            events_handle,
                            {
                                'ts': ts,
                                'type': 'process_seen',
                                'pid': pid,
                                'process': proc,
                            },
                        )

                for pid, proc in list(known_pids.items()):
                    if pid not in process_map:
                        append_json_line(
                            events_handle,
                            {
                                'ts': ts,
                                'type': 'process_gone',
                                'pid': pid,
                                'last_seen_process': proc,
                            },
                        )

                sample = {
                    'ts': ts,
                    'sample_index': sample_count,
                    'hostname': hostname,
                    'monitor_pid': os.getpid(),
                    'loadavg': {'1m': load1, '5m': load5, '15m': load15},
                    'memory': meminfo,
                    'process_count': len(processes),
                    'processes': processes,
                }
                append_json_line(samples_handle, sample)
                write_state(
                    state_path,
                    {
                        'ts': ts,
                        'session_started_at': session_started_at,
                        'sample_index': sample_count,
                        'process_count': len(processes),
                        'top_rss_kb': max((proc['rss_kb'] for proc in processes), default=0),
                    },
                )
                known_pids = process_map
                sample_count += 1
            except Exception as exc:
                append_json_line(
                    events_handle,
                    {
                        'ts': ts,
                        'type': 'monitor_error',
                        'message': str(exc),
                    },
                )

            time.sleep(args.interval)

        append_json_line(
            events_handle,
            {
                'ts': utc_now(),
                'type': 'monitor_stopped',
                'pid': os.getpid(),
                'samples_written': sample_count,
            },
        )

    return 0


if __name__ == '__main__':
    sys.exit(main())