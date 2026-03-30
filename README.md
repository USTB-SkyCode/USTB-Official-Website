# USTB Official Website (Frontend)

基于 Vue 3 + Vite + Rust (WASM) 构建的前端项目。由于在正式环境中前端运行时高度依赖于后端的动态配置 (/config.js) 及其配套的内部防跨域代理等，因此**本项目主要推荐直接连同后端仓库使用 Dokploy Compose 进行一体化部署**。

## 生产部署 (Dokploy)

**无需在前端单独配置和配置环境变量！**
当你在 Dokploy 中部署后端对应的 docker-compose.yml 时，该 Compose 内部的 frontend 服务会自动从本前端仓库拉取包含构建环境的源码进行 docker build 并交付。

所有的运行时挂载配置变量交由后端全局管控提供（不需要给本前端提供额外的 .env）。

### 建立推送代码自动协同触发机制

此模式下由于后端系统直接接管了整个应用（通过前端上下文路径打包前端代码），Dokploy 本身只能监听到后端代码库变化；要想在前端推送代码后也实现服务器热更新，通过以下 GitHub Actions 集成即可：

1. 在 Dokploy 面板中，拿到你部署后端建立的 **Compose 应用** 的 **Deploy Webhook URL**。
2. 回到本前端 GitHub 仓库，前往 **Settings -> Secrets and variables -> Actions**。
3. 新建一个名为 DOKPLOY_REDEPLOY_HOOK_URL 的 Repository Secret，将刚才的 Webhook URL 填入。

完成以上设置后，下一次向 main 分支提交前端或者直接通过 Github Action 合并代码，后端服务器所在的主机就会接收到热更新触发命令，利用最新的前端源码重新打包发布

---

## 本地纯前端开发指南

如果你需要完整接入本地https开发链路，详细配置请参阅： [这里](./docs/development/open-source-local-dev.md)。

如果你主要是做 Vue 等前端相关的常规修改与静态预览测试,项目默认是伪https的localhost形式,仅在本地windows测试成立,其余平台不确定
``bash
# 1. 安装项目依赖
npm install

# 2. 拉起本地带有 HMR 的开发服务器
npm run dev

# (可选常见命令)
npm run type-check   # 纯类型检查
npm run build-only   # Vite 常规前端构建
npm run build        # 附加引擎和 wasm 的终极全量发行构建
``
