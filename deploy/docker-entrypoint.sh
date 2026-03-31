#!/bin/sh
set -e

SERVE_PACKS=/srv/packs
DATA_PACKS=/data/packs
SEED_PACKS=/seed-packs

if [ -f "$DATA_PACKS/index.json" ]; then
  # External packs available (from resource-builder volume) — use them
  rm -rf "$SERVE_PACKS"
  ln -s "$DATA_PACKS" "$SERVE_PACKS"
elif [ -f "$SEED_PACKS/index.json" ]; then
  # First run with empty volume — seed from image built-in packs
  cp -a "$SEED_PACKS"/. "$DATA_PACKS"/
  rm -rf "$SERVE_PACKS"
  ln -s "$DATA_PACKS" "$SERVE_PACKS"
fi
# else: neither exists (no packs in repo, no resource build done) — /srv/packs
# stays as-is from the image (may be empty or have whatever was in public/packs)

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
