# USTB Official Website (Frontend)

Vue 3 + Vite + Rust (WASM) 前端仓库，负责站点 UI、运行时宿主和 3D 渲染层。生产部署由后端仓库统一接管；日常前端开发则在本仓库本地完成。

## 仓库定位

- 日常前端代码修改、HMR 调试、页面与渲染联调都在 `world/` 完成。
- 生产和共享预览不直接在远端运行 Vite；正式部署由后端仓库的 Compose 拉取并构建本仓库源码。
- 当前本地浏览器主入口固定为你接管的同域 HTTPS 开发域名。

## 文档入口

- [dev.md](dev.md)：前端运行时配置、开发链路和背景说明。
- [docs/development/open-source-local-dev.md](docs/development/open-source-local-dev.md)：本地 HTTPS 域名接管与 tunnel 联调细节。
- [docs/development/npm-scripts.md](docs/development/npm-scripts.md)：脚本说明和 SSH / 发布相关约定。

## 生产与共享预览

- 本仓库不单独维护一套线上 Node / Vite 运行形态。
- 生产与远端预览环境都依赖 `/config.js -> window.APP_CONFIG` 这一套运行时配置契约。
- 正式部署时，`/config.js` 由后端返回；本地 `app-dev` 开发时，Vite 会从 `world/.env` 生成同形态 payload。
- 共享预览优先使用 `npm run build-only` 产出静态文件，再由远端静态托管承接，而不是在远端启动 Vite。

### 资源包编译

资源包编译属于部署流程的一部分。首次部署或资源源文件更新后，按后端仓库 README 中的资源包编译步骤执行。

### 推送自动重部署

1. 在 Dokploy 的 Compose 服务页面进入 Deployments，复制自动部署 webhook URL。
2. 在本仓库 Settings → Secrets → Actions 中新建 `DOKPLOY_REDEPLOY_HOOK_URL`。
3. 推送 `main` 后，GitHub Actions 会把这次 push 的 webhook payload 转发给 Dokploy，从而触发后端 Compose 重部署。

## 本地开发

当前标准链路是：浏览器统一访问你的同域 HTTPS 开发入口，本机 Vite 负责前端页面与 HMR，本地 HTTPS 代理承接同域入口，后端拥有的路径再经本机 SSH tunnel 转到远端 `Official-backend/deploy/dev` 的 Caddy / backend。

推荐顺序：

1. 先确保后端仓库的 Mutagen 同步与远端 `deploy/dev` 基础栈已经就绪。
2. 首次接管本地域名时执行一次 `npm run setup:local-app`。
3. 日常开发直接执行 `npm run app-dev`。
4. 浏览器打开你的同域 HTTPS 开发入口。

```powershell
cd D:\vueCode\OfficalWorld\world
npm install
npm run setup:local-app
npm run app-dev
```

### 当前运行时约定

- `APP_BASE_URL`、`API_BASE_URL`、`AUTH_BASE_URL` 保持同一个同域 HTTPS 开发入口
- `MCA_BASE_URL=/resource/mca/ustb`
- `.env.local` 中 `LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN=https://127.0.0.1:15443`
- `.env.local` 中 `LOCAL_APP_DEV_PROXY_BACKEND_HOST_HEADER` / `LOCAL_APP_DEV_PROXY_BACKEND_SERVERNAME` 保持浏览器主入口对应的域名
- 远端直连调试入口只保留给排障，不作为浏览器运行时默认入口

`npm run app-dev` 会同时拉起本机 Vite、本地 HTTPS 代理和后端 SSH tunnel。若你只想裸跑 Vite，可用 `npm run dev`，但它不是当前日常联调主入口。

### 日常验证

```powershell
npm run check:local-app
npm run type-check
curl.exe https://<your-dev-host>/config.js
```

| 命令 | 说明 |
|---|---|
| `npm run app-dev` | 日常同域 HTTPS 前端开发入口 |
| `npm run app-dev:stop` | 停止本地 HTTPS 接管辅助进程 |
| `npm run check:local-app` | 检查 hosts、证书、端口、后端探测 |
| `npm run dev` | 仅启动本地 Vite HMR 服务器 |
| `npm run type-check` | 类型检查 |
| `npm run build-only` | 仅构建前端静态产物 |
| `npm run build` | 全量构建（含 WASM） |
| `npm run build:resource` | 编译资源包到 `public/packs/` |

更完整的本地开发细节见 [docs/development/open-source-local-dev.md](docs/development/open-source-local-dev.md)。
