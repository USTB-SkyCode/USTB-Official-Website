# 脚本归类说明

本文档用于说明前端仓库脚本的开源边界：哪些脚本属于公开能力，哪些脚本属于个人私有工作流。

## 公开脚本（由 npm scripts 调用）

| 脚本 | 作用 | 在 docs/development 中涉及的文档 |
|---|---|---|
| `scripts/dev/publish_static.ps1` | 静态资源原子发布（上传归档 + 触发远端发布脚本） | `docs/development/npm-scripts.md` |
| `scripts/dev/push_front_reference.ps1` | 推送前端参考副本到远端目录 | `docs/development/npm-scripts.md` |
| `scripts/dev/pull_backend_reference.ps1` | 从远端抓取后端参考副本到本地 `Official-backend` | `docs/development/npm-scripts.md` |
| `scripts/dev/local_proxy/local_app_dev_proxy.mjs` | 本地 HTTPS 同域代理入口 | `docs/development/npm-scripts.md`、`docs/development/open-source-local-dev.md` |
| `scripts/dev/local_proxy/setup_local_app_dev.ps1` | 本地 hosts/证书初始化 | `docs/development/npm-scripts.md`、`docs/development/open-source-local-dev.md` |
| `scripts/dev/local_proxy/check_local_app_dev.ps1` | 本地同域接管检查 | `docs/development/npm-scripts.md`、`docs/development/open-source-local-dev.md` |
| `scripts/dev/Resolve-RemoteScriptConfig.ps1` | 公开远端脚本的通用配置解析 helper | 无直接文档引用 |