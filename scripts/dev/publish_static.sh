#!/usr/bin/env bash

set -euo pipefail

SSH_HOST="${WORLD_SSH_HOST:-world-dev}"
REMOTE_BASE_ROOT="${WORLD_REMOTE_ROOT:-/srv/ustb}"
WORKSPACE="${WORLD_WORKSPACE_ROOT:-}"
REMOTE_STAGE_BASE="${WORLD_STATIC_STAGE_ROOT:-}"
REMOTE_STATIC_ROOT="${WORLD_STATIC_ROOT:-}"
REMOTE_PUBLISH_SCRIPT="${WORLD_PUBLISH_SCRIPT:-}"
SMOKE_CHECK_BASE_URL="${WORLD_SMOKE_BASE_URL:-https://example.test}"
KEEP_RELEASES="${WORLD_KEEP_RELEASES:-3}"

usage() {
  cat <<'EOF'
Usage:
  publish_static.sh [options]

Options:
  --ssh-host HOST             Remote SSH host alias or destination
  --workspace PATH            Local world project root
  --remote-base-root PATH     Remote base root, default /srv/ustb
  --remote-stage-base PATH    Remote staging directory for uploaded archive
  --remote-static-root PATH   Remote static release root
  --remote-publish-script     Remote publish_front_release.sh path
  --smoke-check-base-url URL  Site base URL used for smoke checks
  --keep N                    Number of releases to keep
  -h, --help                  Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-host)
      SSH_HOST="$2"
      shift 2
      ;;
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --remote-base-root)
      REMOTE_BASE_ROOT="$2"
      shift 2
      ;;
    --remote-stage-base)
      REMOTE_STAGE_BASE="$2"
      shift 2
      ;;
    --remote-static-root)
      REMOTE_STATIC_ROOT="$2"
      shift 2
      ;;
    --remote-publish-script)
      REMOTE_PUBLISH_SCRIPT="$2"
      shift 2
      ;;
    --smoke-check-base-url)
      SMOKE_CHECK_BASE_URL="$2"
      shift 2
      ;;
    --keep)
      KEEP_RELEASES="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"
WORKSPACE="${WORKSPACE:-$PROJECT_ROOT}"

REMOTE_STAGE_BASE="${REMOTE_STAGE_BASE:-$REMOTE_BASE_ROOT/dev/Official-backend/deploy/prod/payload}"
REMOTE_STATIC_ROOT="${REMOTE_STATIC_ROOT:-$REMOTE_BASE_ROOT/prod/front-static}"
REMOTE_PUBLISH_SCRIPT="${REMOTE_PUBLISH_SCRIPT:-$REMOTE_BASE_ROOT/dev/Official-backend/deploy/prod/scripts/publish_front_release.sh}"

DIST_ROOT="$WORKSPACE/dist"
[[ -d "$DIST_ROOT" ]] || { printf 'Built dist directory not found: %s\n' "$DIST_ROOT" >&2; exit 1; }
[[ -d "$DIST_ROOT/assets" ]] || { printf 'dist/assets not found\n' >&2; exit 1; }
[[ -d "$DIST_ROOT/basic" ]] || { printf 'dist/basic not found\n' >&2; exit 1; }
[[ -d "$DIST_ROOT/model" ]] || { printf 'dist/model not found\n' >&2; exit 1; }
[[ -f "$DIST_ROOT/index.html" ]] || { printf 'dist/index.html not found\n' >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

require_cmd ssh
require_cmd scp
require_cmd tar
require_cmd mktemp
require_cmd find

discover_smoke_asset() {
  find "$DIST_ROOT/assets" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' -o -name '*.wasm' \) | sort | head -n 1
}

SMOKE_ASSET_FILE="$(discover_smoke_asset)"
[[ -n "$SMOKE_ASSET_FILE" ]] || { printf 'No smoke-checkable asset found in dist/assets\n' >&2; exit 1; }
SMOKE_ASSET_PATH="/assets/$(basename "$SMOKE_ASSET_FILE")"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_NAME="release-$TIMESTAMP"
TEMP_ARCHIVE="$(mktemp -t ustb_front_static_payload.XXXXXX.tar.gz)"
trap 'rm -f "$TEMP_ARCHIVE"' EXIT

printf 'Compressing dist payload...\n'
tar -czf "$TEMP_ARCHIVE" -C "$DIST_ROOT" .

REMOTE_ARCHIVE_PATH="$REMOTE_STAGE_BASE/static.tar.gz"

printf 'Ensuring remote staging directory...\n'
ssh "$SSH_HOST" "mkdir -p '$REMOTE_STAGE_BASE'"

printf 'Uploading payload archive...\n'
scp "$TEMP_ARCHIVE" "$SSH_HOST:$REMOTE_ARCHIVE_PATH"

printf 'Running remote publish script...\n'
ssh "$SSH_HOST" "set -eu; test -x '$REMOTE_PUBLISH_SCRIPT'; '$REMOTE_PUBLISH_SCRIPT' --archive '$REMOTE_ARCHIVE_PATH' --static-root '$REMOTE_STATIC_ROOT' --site-url '$SMOKE_CHECK_BASE_URL' --keep '$KEEP_RELEASES' --release-name '$RELEASE_NAME' --smoke-asset '$SMOKE_ASSET_PATH'"

printf 'Static publish completed.\n'
printf 'Remote static root: %s\n' "$REMOTE_STATIC_ROOT"
printf 'Release name: %s\n' "$RELEASE_NAME"
printf 'Smoke-checked asset: %s\n' "$SMOKE_ASSET_PATH"
