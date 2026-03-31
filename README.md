# USTB Official Website (Frontend)

Vue 3 + Vite + Rust (WASM) 前端项目。生产部署由后端仓库的 Docker Compose 统一管理。

## 生产部署

本项目不需要独立部署。后端仓库的 `docker compose up -d` 会自动从本仓库拉取源码、构建镜像、并将前端服务纳入统一的 Compose 网络。

所有运行时配置（API 地址、域名等）由后端的 `/config.js` 动态注入，前端无需 `.env`。

### 资源包编译

部署首次需要运行资源包编译。详见后端仓库 README 步骤 4。

### 推送自动重部署

1. 在 Dokploy 面板复制 Compose 应用的 Deploy Webhook URL。
2. 本仓库 Settings → Secrets → Actions 中新建 `DOKPLOY_REDEPLOY_HOOK_URL`。
3. 推送 `main` 后自动触发后端 Compose 重部署，重建 frontend 服务。

## 本地开发

```bash
npm install
npm run dev
```

| 命令 | 说明 |
|---|---|
| `npm run dev` | 本地 HMR 开发服务器 |
| `npm run type-check` | 类型检查 |
| `npm run build-only` | Vite 前端构建 |
| `npm run build` | 全量构建（含 WASM） |
| `npm run build:resource` | 编译资源包到 `public/packs/` |

完整本地 HTTPS 开发链路配置参见 [docs/development/open-source-local-dev.md](docs/development/open-source-local-dev.md)。
