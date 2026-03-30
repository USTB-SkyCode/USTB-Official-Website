# Local Dev

这份文档面向第一次 clone 项目的协作者。

这份文档讲的是“全栈开发里的前端阶段”。

这里的“前端阶段”不是只跑一个孤立页面，而是：

- 页面代码在你的本机 `world/` 里开发
- 浏览器主入口由你本机接管
- API、登录、会话、OAuth 回调仍然依赖远端后端
- 前端工程需要同时理解页面域名、后端域名、资源路径和运行时配置

目标有三个：

- 让你在自己的机器上把前端跑起来
- 让你知道什么时候需要继续接入项目内的同域 HTTPS 开发链路
- 让你在填写配置时，知道每个域名和每个配置项到底负责什么

## 1. 你会在什么目录工作

当前唯一有效的前端工程根目录是：

```text
world/
```

进入目录：

```powershell
cd C:\path\to\repo\world
```

## 2. 前置要求

本地至少需要：

- Node `20.19+`
- npm
- Git

如果你需要构建或重建 `core/pkg` 里的 WASM 产物，还需要把 Rust 侧工具装完整。不要只理解成“装一个 Rust 就行”，当前仓库实际至少需要下面这些东西：

- `rustup`
- Rust stable toolchain（Windows 下建议 `stable-x86_64-pc-windows-msvc`）
- `wasm32-unknown-unknown` target
- `wasm-pack`

Windows 下可以按这个顺序准备：

```powershell
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup default stable-x86_64-pc-windows-msvc
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

安装后建议直接验证：

```powershell
rustc -V
cargo -V
rustup target list --installed
wasm-pack -V
```

这里至少要确认两件事：

- `wasm32-unknown-unknown` 已经在 installed target 里
- `wasm-pack` 命令能直接执行

如果你只是改普通 Vue / TS / CSS 页面，而且仓库里已经有可用的 `core/pkg` 产物，可以先不动 Rust。

但下面这些情况不能再跳过 Rust：

- 仓库里没有可用的 `core/pkg`
- 你改了 `core/src` 下的 Rust 代码
- 你需要自己重新生成 WASM 产物
- `npm run dev` 或 `npm run build:*` 因为 `@world-core` 缺失而报错

## 3. clone 后第一次启动

1. 安装 npm 依赖：

```powershell
npm install
```

2. 复制前端运行时配置模板：

```powershell
Copy-Item .env.example .env
```

如果你只是先把页面跑起来，至少先把 `.env` 里的这些字段补成你当前要访问的浏览器主入口域名或同源资源路径：

```env
API_BASE_URL=
AUTH_BASE_URL=
APP_BASE_URL=
MCA_BASE_URL=
MODEL_BASE_URL=
MODEL_COMPILED_BASE_URL=
MODEL_ASSET_BASE_URL=
BASIC_BASE_URL=
BASIC_COMPILED_BASE_URL=
BASIC_ASSET_BASE_URL=
SKIN_BASE_URL=
```

3. 复制本地 Vite 开发参数模板：

```powershell
Copy-Item .env.local.example .env.local
```

4. 如果仓库里没有现成的 `core/pkg`，或者你需要自己重建 WASM，先执行：

```powershell
npm run build:wasm:dev
```

5. 如果你只是做普通本地页面开发，直接运行：

```powershell
npm run dev
```

6. 首次启动后，建议先跑一次：

```powershell
npm run type-check
```

## 4. `.env` 和 `.env.local` 的区别

- `.env`
  - 决定 `/config.js` 里的运行时配置
  - 更偏部署契约和共享运行时配置
- `.env.local`
  - 只给你自己的本地 Vite 使用
  - 用来调端口、HMR、允许域名、本地代理等

如果只是本地开发，通常先改 `.env.local`，不要随手把机器相关配置写进 `.env`。

## 5. 全栈开发里的“前端阶段”

当前推荐链路不是“前端和后端都跑在你本机”，而是：

- 浏览器页面和 HMR 由你本机前端提供
- 后端接口、登录、会话、OAuth、数据库、副作用任务仍由远端开发环境承担

也就是说，你在前端阶段通常要同时面对两类配置：

- 浏览器真正访问的入口
- 本机接管层背后实际转发到的上游服务

这也是为什么文档里既会出现“浏览器域名”，也会出现“后端直连域名”。它们不是重复，而是职责不同。

## 6. 你到底会碰到多少类地址

做这条链路时，通常会碰到 4 类地址。

### 1. 浏览器主入口域名

示例：`https://dev-app.example.test`

它的职责是：

- 浏览器打开页面时访问它
- 浏览器请求 `/config.js` 时访问它
- 浏览器发起登录、回跳登录、读取同域 Cookie 时访问它
- 浏览器访问同域 `/api/...`、`/auth/...` 时访问它
- HMR websocket 也要挂在这个域名下

在“同域 HTTPS 开发链路”里，它是最重要的那个域名。

### 2. 后端直连域名

示例：`https://api.example.test`

它的职责是：

- 作为你本机 HTTPS 接管层的后端上游目标
- 作为后端排障或直连探活时的兼容入口
- 让你在不经过本机页面入口时，也能单独验证后端是否正常响应

它通常不应该直接出现在浏览器的 `API_BASE_URL`、`AUTH_BASE_URL`、`APP_BASE_URL` 里。全栈前端阶段下，浏览器更应统一使用主入口域名。

### 3. 皮肤服务域名

示例：`https://skin.example.test`

它的职责是：

- 提供皮肤站点或皮肤 API
- 为 launcher、authlib-injector 一类能力提供 `skinapi` 根地址

它和浏览器页面主入口不是一回事。当前前端代码里，`SKIN_API_BASE_URL` 可以指向这个外部皮肤服务，但浏览器页面下真正消费的头像和皮肤图片，仍然应尽量走同源地址或同源代理路径。

### 4. 同源资源路径

示例：

- `/resource/mca/world`
- `/model`
- `/model/compiled`
- `/basic`
- `/assets/skin`
- `/skin-origin-proxy/...`

这类值通常不是新域名，而是挂在浏览器主入口域名下的同源路径。

也就是说，很多配置项虽然看起来像“资源地址”，但你不一定要给它们单独准备一个新域名。很多时候填同源绝对路径就够了。

## 7. 什么时候只用 `npm run dev`

下面这些情况，通常只用：

```powershell
npm run dev
```

适用场景：

- 只改 Vue 页面、组件、样式
- 不要求浏览器入口必须是类似 `https://dev-app.example.test` 这样的同域 HTTPS 地址
- 不依赖同域 Cookie / OAuth 行为做验证
- 只想先把页面和基础逻辑跑起来

## 8. 什么时候要用同域 HTTPS 开发链路

下面这些情况，建议改走仓库内已经提供好的本地 HTTPS 接管链路：

- 要验证 Cookie / Session 行为
- 要验证 OAuth 回跳
- 要验证同域 `/api`、`/auth` 等入口行为
- 要让页面入口和真实部署环境更接近

## 9. 域名和配置项应该怎么对应

这一节只回答一个问题：你填配置的时候，某个字段应该填“浏览器主入口域名”、还是“后端直连域名”、还是“同源路径”。

### 1. `/config.js` 里的运行时字段

`.env.example` 里的这些键会进入 `/config.js`，再由前端在运行时读取。

- `API_BASE_URL`
  - 前端阶段通常填浏览器主入口域名，例如 `https://dev-app.example.test`
  - 因为浏览器里实际请求的应是同域 `/api/...`
- `AUTH_BASE_URL`
  - 前端阶段通常也填浏览器主入口域名，例如 `https://dev-app.example.test`
  - 因为登录入口、退出登录、OAuth 回跳最好和页面入口保持同源
- `APP_BASE_URL`
  - 填浏览器主入口域名，例如 `https://dev-app.example.test`
  - 它是页面绝对链接、回跳地址、站内绝对 URL 的基准
- `SKIN_API_BASE_URL`
  - 填皮肤服务域名下的 API 根地址，例如 `https://skin.example.test/skinapi`
  - 这是给 launcher / Yggdrasil / authlib-injector 一类场景准备的，不是页面主入口
- `MCA_BASE_URL`
  - 通常填同源路径，例如 `/resource/mca/world`
- `MODEL_BASE_URL`
  - 通常填同源路径，例如 `/model`
- `MODEL_COMPILED_BASE_URL`
  - 通常填同源路径，例如 `/model/compiled`
- `MODEL_ASSET_BASE_URL`
  - 通常填同源路径，例如 `/model/assets`
- `BASIC_BASE_URL`
  - 通常填同源路径，例如 `/basic`
- `BASIC_COMPILED_BASE_URL`
  - 通常填同源路径，例如 `/basic/compiled`
- `BASIC_ASSET_BASE_URL`
  - 通常填同源路径，例如 `/basic/assets`
- `SKIN_BASE_URL`
  - 通常填同源路径，例如 `/assets/skin`
  - 它更像静态兜底资源目录，不等于 `SKIN_API_BASE_URL`

### 2. `.env.local` 里的本机开发字段

`.env.local` 不是部署契约，而是本机开发链路的启动参数。

- `VITE_HMR_HOST`
  - 填浏览器主入口域名，例如 `dev-app.example.test`
- `VITE_HMR_PROTOCOL`
  - HTTPS 页面下通常填 `wss`
- `VITE_HMR_CLIENT_PORT`
  - 如果浏览器通过标准 HTTPS 入口访问，通常填 `443`
- `VITE_ALLOWED_HOSTS`
  - 用来允许这个本地域名访问当前 Vite
- `LOCAL_APP_DEV_DOMAIN`
  - 填浏览器主入口域名，不带协议，例如 `dev-app.example.test`
- `LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN`
  - 填后端直连域名，例如 `https://api.example.test`
  - 这是本机 HTTPS 接管层真正转发到的远端后端上游
- `LOCAL_APP_DEV_PROXY_VITE_ORIGIN`
  - 填本机 Vite 实际监听地址，例如 `https://[::1]:5175` 或 `https://localhost:5175`

### 3. 后端侧你至少要确认哪些域名相关配置

即使你主要在写前端，也最好知道后端有哪几类域名配置需要与你对齐。

- 允许浏览器来源
  - 后端一般要允许浏览器主入口域名，例如 `https://dev-app.example.test`
- 允许登录完成后的回跳主机
  - 后端一般要允许浏览器主入口域名
- OAuth 回调地址
  - 应和浏览器主入口域名保持一致，例如 `https://dev-app.example.test/auth/...`
- 后端公开 HTTPS 入口
  - 这是给本机 HTTPS 接管层作为上游目标使用的，例如 `https://api.example.test`

如果这些地方填错，前端常见表现不是“页面打不开”，而是：

- 登录后回跳失败
- Cookie 没带上
- CSRF 初始化失败
- 页面能开，但登录、个人信息、上传之类接口异常


## 10. 如何按当前仓库方式接管本机 HTTPS 入口

当前仓库已经把这条链路封装成现成脚本。按现在的真实开发形式，直接使用仓库内的初始化脚本和本地 HTTPS 入口脚本即可。

### 1. 先运行初始化脚本

在前端根目录执行：

```powershell
npm run setup:local-app
```

这个脚本会按当前仓库约定完成四件事：

- 尝试把本地域名写入 `C:\Windows\System32\drivers\etc\hosts`
- 用 Windows `New-SelfSignedCertificate` 在 `CurrentUser\My` 中签发本机开发证书
- 把证书导出到 `%USERPROFILE%\.config\world-local-app-dev\app-dev-local.pfx`
- 把导出的证书导入 `CurrentUser\Root`，让浏览器信任这张本机开发证书

这一步跑完后，终端里会告诉你下一步该启动什么。

### 2. 如果 hosts 没有自动写成功，就手动补上

`npm run setup:local-app` 如果没有权限修改 `hosts`，会直接在终端里打印提示。此时按下面方式处理：

1. 用管理员身份打开记事本或其他文本编辑器。
2. 打开 `C:\Windows\System32\drivers\etc\hosts`。
3. 按脚本输出里提示的域名，加一行：

```text
127.0.0.1 <脚本提示的本地域名>
```

这里不要自己猜域名，直接以 `npm run setup:local-app` 输出为准。

### 3. 调整 `.env.local`，并确认 `world/.env`

如果你要使用这条本地 HTTPS 接管链路，就把 `.env.local` 改成和脚本输出的域名一致。最少需要这些项：

```env
VITE_DEV_PORT=5175
VITE_ALLOWED_HOSTS=*
VITE_HMR_HOST=<和 hosts 里相同的本地域名>
VITE_HMR_PROTOCOL=wss
VITE_HMR_CLIENT_PORT=443
```

同时确认 `world/.env` 里的运行时配置也已经使用同一个浏览器主入口域名：

```env
API_BASE_URL=https://<和 hosts 里相同的本地域名>
AUTH_BASE_URL=https://<和 hosts 里相同的本地域名>
APP_BASE_URL=https://<和 hosts 里相同的本地域名>
```

这里不要写成 `VITE_API_BASE_URL` 这类键。当前前端运行时 URL 契约来自 `/config.js`，而 `/config.js` 的来源是 `world/.env`。

如果你本机的 Vite 只能从 `localhost` 打开，而不能直接用 `127.0.0.1:5175`，再额外加入：

```env
LOCAL_APP_DEV_PROXY_VITE_ORIGIN=https://localhost:5175
```

### 4. 启动 Vite

执行：

```powershell
npm run host
```

这个命令会用 `vite --host` 拉起开发服务器。当前仓库里还启用了 `@vitejs/plugin-basic-ssl`，所以本机开发服务器本身就是 HTTPS。

默认端口是 `5175`，并且会根据 `.env.local` 里的 HMR 配置把 websocket 暴露给浏览器。

### 5. 启动仓库自带的本地 HTTPS 入口脚本

另开一个终端，执行：

```powershell
npm run proxy:local-app
```

这个脚本是仓库里的 Node HTTPS 入口脚本：

- 它会加载刚才生成的 `app-dev-local.pfx`
- 默认监听本机 `443`
- `/api` 和 `/auth` 会转发到远端后端
- 其他请求会转发到本机 Vite

如果你不想分两个终端，也可以直接执行：

```powershell
npm run app-dev
```

这个聚合命令会同时启动 `host` 和 `proxy:local-app`。

### 6. 做一次状态检查

执行：

```powershell
npm run check:local-app
```

这个检查脚本会验证：

- `hosts` 里是否已经有本地域名映射
- `5175` 是否已经被 Vite 监听
- `.env.local` 里的关键项是否齐全
- 本机 HTTPS 入口首页和 `/api/session/csrf-token` 是否能通

如果你想单独看端口，也可以执行：

```powershell
Get-NetTCPConnection -LocalPort 5175 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, State, OwningProcess
```

### 7. 当前这条链路的边界

当前仓库里公开可见的自动化，核心覆盖的是：

- 本机 HTTPS 页面入口
- HMR
- 同域 `/api`
- 同域 `/auth`

如果你还要复刻更多同域路径，就继续在仓库脚本基础上扩展，不要重新另起一套本地 HTTPS 工具链。

## 11. 全栈前端阶段推荐你这样填配置

如果你想先得到一份能工作的最小配置，可以按这个思路填。

### 1. `world/.env`

```env
API_BASE_URL=https://dev-app.example.test
AUTH_BASE_URL=https://dev-app.example.test
APP_BASE_URL=https://dev-app.example.test
SKIN_API_BASE_URL=https://skin.example.test/skinapi
MCA_BASE_URL=/resource/mca/world
MODEL_BASE_URL=/model
MODEL_COMPILED_BASE_URL=/model/compiled
MODEL_ASSET_BASE_URL=/model/assets
BASIC_BASE_URL=/basic
BASIC_COMPILED_BASE_URL=/basic/compiled
BASIC_ASSET_BASE_URL=/basic/assets
SKIN_BASE_URL=/assets/skin
```

### 2. `world/.env.local`

```env
VITE_DEV_PORT=5175
VITE_ALLOWED_HOSTS=*
VITE_HMR_HOST=dev-app.example.test
VITE_HMR_PROTOCOL=wss
VITE_HMR_CLIENT_PORT=443
LOCAL_APP_DEV_DOMAIN=dev-app.example.test
LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN=https://api.example.test
LOCAL_APP_DEV_PROXY_VITE_ORIGIN=https://[::1]:5175
```

### 3. 你的脑内映射

- `dev-app.example.test` = 浏览器真正访问的站点入口
- `api.example.test` = 本机 HTTPS 接管层背后的远端后端上游
- `skin.example.test` = 皮肤站网址
- `/model`、`/basic`、`/assets/skin` = 开发时前端资源的public下的相对路径

## 12. 当前最常用脚本

- `npm run dev`
  - 普通本地 Vite 开发
- `npm run app-dev`
  - 同域 HTTPS 开发
- `npm run app-dev:stop`
  - 停止本地接管辅助进程
- `npm run type-check`
  - 类型检查
- `npm run lint`
  - ESLint 自动修复
- `npm run build`
  - 完整构建
- `npm run build-only`
  - 只做 Vite 构建

更多脚本说明见：

- `docs/development/npm-scripts.md`

## 13. 如果你要使用远端同步或发布脚本

这类脚本只假设你本机已经能通过标准 `ssh` / `scp` 连到自己的远端环境。

它们不要求固定云厂商，也不要求固定网络接入方案。对脚本来说，最重要的是你先准备好一个可用的 SSH 目标名。

推荐在本机 `~/.ssh/config` 中准备一个通用别名，例如：

```sshconfig
Host world-dev
  HostName ssh.example.test
  User deploy
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

建议满足这几个前提：

- 本机已经装好 `ssh` 和 `scp`
- 远端用户已经能用密钥免密登录
- 你的 SSH 目标名已经能直接执行 `ssh world-dev`
- 如果你要做发布或参考副本同步，远端目录权限也已经准备好

当前脚本默认使用的 SSH 目标名是 `world-dev`。如果你想换成自己的名字，可以设置：

```powershell
$env:WORLD_SSH_HOST = 'my-dev-host'
```

如果你的远端目录结构不是仓库默认约定，再额外设置对应环境变量即可。具体变量名见：

- `docs/development/npm-scripts.md`

## 14. 如果你需要完整构建

完整构建入口：

```powershell
npm run build
```

这里会触发：

- `build:resource`
- `build:prod:static`

而 `build:prod:static` 又会触发：

- `build:wasm:prod`
- `build:vite`

所以如果你本机没有 Rust / `wasm-pack`，先不要把“跑不通完整 build”误判成“前端没法开发”。

## 15. 如果你只想预览构建结果

```powershell
npm run build-only
npm run preview
```

这是本机预览，不是正式发布。

## 16. 当前默认认知

- 当前唯一有效前端根目录是 `world/`
- 日常开发优先在本机完成
- 同域 HTTPS 入口属于增强版开发链路，不是所有协作者第一次启动都必须先配好的前置条件
- 如果你是外部协作者，先把 `npm run dev` 跑通，再决定是否接入 `app-dev` 链路

