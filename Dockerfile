# ============================================
# Stage 1 — Build WASM (Rust → wasm-pack)
# ============================================
FROM rust:1-slim AS wasm-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh

WORKDIR /build
COPY core/.cargo   core/.cargo
COPY core/Cargo.toml core/Cargo.lock core/
COPY core/src      core/src

RUN wasm-pack build core --target web --release -- --no-default-features

# ============================================
# Stage 2 — Frontend Dependencies / Resource Builder Base
# ============================================
FROM node:22-slim AS frontend-deps

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
COPY --from=wasm-builder /build/core/pkg/ core/pkg/

# ============================================
# Stage 3 — Manual Resource Builder
# ============================================
FROM frontend-deps AS resource-builder

# ============================================
# Stage 4 — Build Frontend (Node → Vite)
# ============================================
FROM frontend-deps AS frontend-builder

RUN npx vue-tsc --build && npx vite build

# ============================================
# Stage 5 — Serve (Caddy static file server)
# ============================================
FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-builder /build/dist /srv

# Seed: preserve built-in packs so first-run can populate the volume
RUN if [ -d /srv/packs ]; then cp -a /srv/packs /seed-packs; else mkdir /seed-packs; fi
RUN mkdir -p /data/packs

COPY deploy/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
