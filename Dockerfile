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
# Stage 2 — Build Frontend (Node → Vite)
# ============================================
FROM node:22-slim AS frontend-builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
COPY --from=wasm-builder /build/core/pkg/ core/pkg/

RUN npm run build:resource && npx vue-tsc --build && npx vite build

# ============================================
# Stage 3 — Serve (Caddy static file server)
# ============================================
FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-builder /build/dist /srv

EXPOSE 80
