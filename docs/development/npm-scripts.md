# NPM Scripts

这份文档以当前 `package.json` 的实际顺序和语义为准。

## Clone 后先做什么

其他人第一次 clone 项目后，建议先按这个顺序处理：

1. 进入前端根目录。

```powershell
cd C:\path\to\repo\world
```

2. 安装依赖。

```powershell
npm install
```

3. 复制前端运行时配置模板。

```powershell
Copy-Item .env.example .env
```

`.env` 会被当前开发服务器读取，并生成 `/config.js`。如果你完全不创建 `.env`，前端运行时拿到的 `APP_CONFIG` 会是空的，登录、OAuth、接口入口等能力会直接缺配置。

4. 复制并检查本地 Vite 参数。

```powershell
Copy-Item .env.local.example .env.local
```

`scripts/dev/*.ps1` 会自动读取项目根目录的 `.env.local`，因此远端相关参数建议放在 `.env.local`，而不是写死在脚本或系统全局环境里。

5. 如果你需要构建或重建 `core/pkg` 里的 WASM 产物，先确认 Rust 侧环境已经装齐：

- `rustup`
- Rust stable toolchain（Windows 推荐 `stable-x86_64-pc-windows-msvc`）
- `wasm32-unknown-unknown`
- `wasm-pack`

可直接用下面几条命令准备：

```powershell
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup default stable-x86_64-pc-windows-msvc
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

如果仓库里没有现成 `core/pkg`，或者你改了 `core/src` 下的 Rust 代码，再执行：

```powershell
npm run build:wasm:dev
```

6. 如果只是普通本地页面开发，直接启动：

```powershell
npm run dev
```

7. 如果要接管类似 `dev-app.example.test` 这样的同域 HTTPS 入口做开发，再额外处理：

```powershell
npm run setup:local-app
npm run app-dev
```

8. 首次启动后，优先跑一次类型检查确认环境可用：

```powershell
npm run type-check
```

## 远端脚本前提

下面三类脚本都只依赖标准 `ssh` / `scp`：

- `npm run release:static`
- `npm run ref:front:push`
- `npm run ref:backend:pull`

注意：后端日常热重载链路不是靠 `npm run ref:backend:pull`。当前真实链路是本机 `Official-backend` 通过 Mutagen 同步到 `/srv/ustb/dev/Official-backend`，对应入口是工作区任务 `backend-mutagen-auto-sync` / `backend-mutagen-validate`，或 `scripts/privacy/remote/ensure_backend_mutagen_sync.ps1`。

这些脚本不关心你底层走的是普通 SSH、内网跳板，还是你自己配置的其他 SSH 到达方式。它们只认一个 SSH 目标名。

当前仓库默认 SSH 目标可以直接写成 `user@example.com`。

如果你更想用别名而不是直接写 `user@host`，推荐先在本机 `~/.ssh/config` 里准备一个通用别名，例如：

```sshconfig
Host tencent-dev
  HostName ssh.example.test
  User user
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

建议使用免密 SSH，也就是密钥登录且不要依赖交互式密码输入。因为这些脚本是非交互式的，过程中会直接调用 `ssh` 和 `scp`。

默认脚本会把 SSH 目标当成 `user@example.com`。如果你想改成自己的别名或其他目标，可以用两种方式覆盖：

1. 设置环境变量：

```powershell
$env:WORLD_SSH_HOST = 'tencent-dev'
```

2. 直接执行脚本并传参：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/dev/publish_static.ps1 -SshHost tencent-dev
```

如果你的远端目录结构和仓库默认约定不同，也可以通过环境变量覆盖：

- `WORLD_REMOTE_ROOT`
- `WORLD_STATIC_STAGE_ROOT`
- `WORLD_STATIC_ROOT`
- `WORLD_PUBLISH_SCRIPT`
- `WORLD_SMOKE_BASE_URL`
- `WORLD_FRONT_REFERENCE_ROOT`
- `WORLD_FRONT_REFERENCE_TEMP_ROOT`
- `WORLD_BACKEND_REFERENCE_ROOT`
- `WORLD_BACKEND_REFERENCE_TEMP_ROOT`
- `WORLD_BACKEND_REFERENCE_LOCAL_ROOT`

## 当前常用入口

- 本机开发：`npm run dev`
- 内网测试: `npm run host`
- 本地域名接管开发：`npm run app-dev`
- 停止本地接管辅助进程：`npm run app-dev:stop`
- 日常校验：`npm run type-check`
- 正式静态发布：`npm run release:static`
- 推送前端参考副本：`npm run ref:front:push`
- 抓取后端参考副本：`npm run ref:backend:pull`

## 全指令列表

- `npm run dev`
  - 只启动本机 Vite。
- `npm run app-dev`
  - 同时启动本机 Vite 和本地域名 HTTPS 接管入口。
- `npm run app-dev:stop`
  - 停掉本地接管链路里常用的 Node 监听端口。
- `npm run release:static`
  - 先执行 `build:prod:static`，成功后再通过 SSH 执行静态原子发布。
- `npm run ref:front:push`
  - 推送当前前端参考源码副本到你配置的远端参考目录。
- `npm run ref:backend:pull`
  - 抓取远端后端参考源码副本到你配置的本地参考目录。
- `npm run lint`
  - 运行 ESLint 自动修复。
- `npm run type-check`
  - 只做 TypeScript / Vue 类型检查。
- `npm run build:resource`
  - 构建项目所需的资源产物。
- `npm run build:wasm`
  - 当前是 `build:wasm:dev` 的聚合入口，也就是默认跑 profiling 版 WASM 构建。
- `npm run host`
  - 只启动本机 Vite 的 `--host` 版本。
- `npm run preview`
  - 本地预览 `dist/`。
- `npm run proxy:local-app`
  - 只启动仓库内置的本地 HTTPS 入口脚本。
- `npm run setup:local-app`
  - 初始化本地同域 HTTPS 开发环境。
- `npm run check:local-app`
  - 检查本地同域 HTTPS 接管状态。
- `npm run format`
  - 格式化 `src/`。
- `npm run build`
  - 完整构建：资源生成 + WASM 生产构建 + 前端生产构建。
- `npm run build-only`
  - 只跑 `vite build`，不额外做类型检查和 WASM 构建。
- `npm run build:vite`
  - 先跑 `type-check`，再执行前端构建。
- `npm run build:wasm:prod`
  - 执行 release 版 WASM 构建，用于 `build:prod:static`。
- `npm run build:wasm:dev`
  - 执行 profiling 版 WASM 构建。
- `npm run build:wasm:debug`
  - 执行 debug 版 WASM 构建。
- `npm run build:prod:static`
  - 先执行 `build:wasm:prod`，再执行 `build:vite`，不包含资源生成。
- `npm run publish:static`
  - 仅执行静态原子发布，要求现成 `dist/` 已经存在。


## 构建关系

- `build` = `build:resource` + `build:prod:static`
- `build:prod:static` = `build:wasm:prod` + `build:vite`
- `build:vite` = `type-check` + `build-only`
- `release:static` = `build:prod:static` + `publish:static`
- `build:wasm` 当前不是 production 入口，而是开发态 profiling 入口
