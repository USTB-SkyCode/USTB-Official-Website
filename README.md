# world

Vue 3 + Vite + Rust/wasm 前端项目。

## 技术栈

- Vue 3 / Vite 7 / Pinia / Vue Router
- Rust / wasm-pack（`core/`）
- Node `^20.19.0 || >=22.12.0`

## 快速开始（本地开发）

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run type-check    # 类型检查
npm run lint          # ESLint
npm run build-only    # Vite 构建
npm run build         # 资源构建 + wasm + Vite 全量构建
```

## 运行时配置

前端运行时依赖 `/config.js`（由后端 Flask 提供），从 `window.APP_CONFIG` 读取部署配置。

消费的字段：`API_BASE_URL`、`AUTH_BASE_URL`、`APP_BASE_URL`、`MCA_BASE_URL`、`MODEL_BASE_URL`、`MODEL_COMPILED_BASE_URL`、`MODEL_ASSET_BASE_URL`、`BASIC_BASE_URL`、`BASIC_COMPILED_BASE_URL`、`BASIC_ASSET_BASE_URL`、`SKIN_BASE_URL`、`DEV_BACKEND_PROXY_ENABLED`。

如果部署环境不提供 `/config.js`，应用不会按预期工作。

---

## 生产构建与容器化

前端作为与后端同一 Dokploy Compose 栈中的 `frontend` 服务部署，后端 Caddy 边缘通过 `reverse_proxy` 转发请求到前端容器。

### Dockerfile 三阶段构建

```
Stage 1 (wasm-builder)  — rust:1-slim + wasm-pack → core/pkg/
Stage 2 (frontend-builder) — node:22-slim + npm ci + vite build → dist/
Stage 3 (runtime)       — caddy:2-alpine 静态服务 → :80
```

### 构建与验证

```bash
# 本地构建测试
docker build -t world-frontend .
```

生产部署时，后端仓库中的 `deploy/prod/docker-compose.yml` 会直接把前端 GitHub 仓库作为 `frontend` 服务的构建上下文；只要这份 Compose 被重新部署，Docker 就会重新从该 GitHub 仓库拉取前端源码并构建 `frontend` 服务。

### 前端容器最小配置

前端容器本身 **不需要任何环境变量**。它只是一个静态文件服务器（内置 Caddy），提供：

- Vite 构建产物（JS/CSS/assets）
- SPA fallback（`try_files → /index.html`）
- gzip/zstd 压缩

所有运行时配置由后端 `/config.js` 路由提供，不打包进前端镜像。

### 与后端的对接

1. 后端 compose 中的 `frontend` 服务默认从 `https://github.com/USTB-SkyCode/USTB-Official-Website.git#main` 构建
2. 前后端容器在同一 compose 网络中运行
3. 后端 `.env` 中 `FRONTEND_UPSTREAM` 默认使用 `http://frontend:80`
4. 后端 Caddy 边缘将非后端请求 `reverse_proxy` 到前端容器
5. 缓存策略由边缘 Caddy 控制：
   - `/assets/*`、`/model/*`、`/basic/*` → `immutable, max-age=1y`
   - `/resource/*` → `immutable, max-age=30d`
   - SPA 路由 → `no-store`

Dokploy 自动监听的是绑定给这份 Compose 的后端仓库，不会直接监听前端仓库。前端仓库推送后的自动部署需要由 GitHub Action 调用同一个 Dokploy Compose 应用的 redeploy hook 完成，这样 Dokploy 才会重新部署这份 Compose，并重新构建 `frontend` 服务。

`DOKPLOY_REDEPLOY_HOOK_URL` 使用部署者自己的 GitHub Secret。未配置该 Secret 时，workflow 会跳过，不会影响与该部署无关的使用者；需要自动部署的人在自己的仓库或 fork 中填入自己的 Dokploy redeploy hook 即可。

完整部署流程见 [Official-backend/README.md](../Official-backend/README.md) 中的「生产部署全流程」。

---

## 公开边界

- `.vscode/` 保留为公开协作目录

## 仓库结构

```
src/              前端应用源码
public/           静态资源
core/             wasm / Rust 子工程
deploy/Caddyfile  容器内 Caddy 配置（SPA 静态服务）
Dockerfile        三阶段生产构建
docs/development/ 对外公开的开发文档
scripts/dev/      对外公开的开发辅助脚本
scripts/BlockPaser/ 资源构建脚本
```


