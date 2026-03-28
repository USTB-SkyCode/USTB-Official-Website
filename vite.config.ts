import { fileURLToPath, URL } from 'node:url'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import basicSsl from '@vitejs/plugin-basic-ssl'

import glsl from 'vite-plugin-glsl'
import { visualizer } from 'rollup-plugin-visualizer'

type RuntimeAppConfig = {
  API_BASE_URL: string
  AUTH_BASE_URL: string
  APP_BASE_URL: string
  SKIN_API_BASE_URL: string
  MCA_BASE_URL: string
  MODEL_BASE_URL: string
  MODEL_COMPILED_BASE_URL: string
  MODEL_ASSET_BASE_URL: string
  BASIC_BASE_URL: string
  BASIC_COMPILED_BASE_URL: string
  BASIC_ASSET_BASE_URL: string
  SKIN_BASE_URL: string
  DEV_BACKEND_PROXY_ENABLED: boolean
}

function parseSharedFrontendEnv(projectRoot: string): Record<string, string> {
  const envPath = path.resolve(projectRoot, '.env')
  if (!existsSync(envPath)) {
    return {}
  }

  const raw = readFileSync(envPath, 'utf-8')
  const parsed: Record<string, string> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const separatorIndex = normalized.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = normalized.slice(0, separatorIndex).trim()
    let value = normalized.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }

  return parsed
}

function readRuntimeAppConfig(projectRoot: string): RuntimeAppConfig {
  const env = parseSharedFrontendEnv(projectRoot)

  return {
    API_BASE_URL: env.API_BASE_URL?.trim() ?? '',
    AUTH_BASE_URL: env.AUTH_BASE_URL?.trim() ?? '',
    APP_BASE_URL: env.APP_BASE_URL?.trim() ?? '',
    SKIN_API_BASE_URL: env.SKIN_API_BASE_URL?.trim() ?? '',
    MCA_BASE_URL: env.MCA_BASE_URL?.trim() ?? '',
    MODEL_BASE_URL: env.MODEL_BASE_URL?.trim() ?? '',
    MODEL_COMPILED_BASE_URL: env.MODEL_COMPILED_BASE_URL?.trim() ?? '',
    MODEL_ASSET_BASE_URL: env.MODEL_ASSET_BASE_URL?.trim() ?? '',
    BASIC_BASE_URL: env.BASIC_BASE_URL?.trim() ?? '',
    BASIC_COMPILED_BASE_URL: env.BASIC_COMPILED_BASE_URL?.trim() ?? '',
    BASIC_ASSET_BASE_URL: env.BASIC_ASSET_BASE_URL?.trim() ?? '',
    SKIN_BASE_URL: env.SKIN_BASE_URL?.trim() ?? '',
    DEV_BACKEND_PROXY_ENABLED: false,
  }
}

function serializeRuntimeAppConfig(config: RuntimeAppConfig): string {
  return `window.APP_CONFIG = ${JSON.stringify(config, null, 2)}\n`
}

function createAppConfigMiddleware(projectRoot: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const requestUrl = req.url ?? ''
    const pathname = decodeURIComponent(requestUrl.split('?')[0])
    if (pathname !== '/config.js') {
      next()
      return
    }

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(serializeRuntimeAppConfig(readRuntimeAppConfig(projectRoot)))
  }
}

function createResourceMiddleware(projectRoot: string): Connect.NextHandleFunction {
  const resourceRoot = path.resolve(projectRoot, 'resource')

  const mimeByExt: Record<string, string> = {
    '.mca': 'application/octet-stream',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.bin': 'application/octet-stream',
  }

  return (req, res, next) => {
    const requestUrl = req.url ?? ''
    if (!requestUrl.startsWith('/resource/')) {
      next()
      return
    }

    const pathname = decodeURIComponent(requestUrl.split('?')[0])
    const relativePath = pathname.slice('/resource/'.length)
    const fsPath = path.resolve(resourceRoot, relativePath)
    if (!fsPath.startsWith(resourceRoot)) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }

    if (!existsSync(fsPath)) {
      if (pathname.endsWith('.mca')) {
        console.warn(`[vite-resource] missing ${pathname}`)
      }
      next()
      return
    }

    const stat = statSync(fsPath)
    if (!stat.isFile()) {
      next()
      return
    }

    const ext = path.extname(fsPath).toLowerCase()
    if (ext === '.mca') {
      console.log(`[vite-resource] ${pathname}`)
    }
    res.setHeader('Content-Type', mimeByExt[ext] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    createReadStream(fsPath).pipe(res)
  }
}

function localResourcePlugin(projectRoot: string): Plugin {
  return {
    name: 'local-resource-static',
    configureServer(server) {
      server.middlewares.use(createResourceMiddleware(projectRoot))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createResourceMiddleware(projectRoot))
    },
  }
}

function runtimeAppConfigPlugin(projectRoot: string): Plugin {
  return {
    name: 'runtime-app-config',
    configureServer(server) {
      server.middlewares.use(createAppConfigMiddleware(projectRoot))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAppConfigMiddleware(projectRoot))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const projectRoot = fileURLToPath(new URL('./', import.meta.url))
  const env = loadEnv(mode, projectRoot, '')
  const rawAllowedHosts = (env.VITE_ALLOWED_HOSTS || 'localhost,127.0.0.1')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const allowedHosts = rawAllowedHosts.includes('*') ? true : rawAllowedHosts

  const proxyTarget = env.VITE_DEV_BACKEND_PROXY_TARGET?.trim()
  const hmrHost = env.VITE_HMR_HOST?.trim()
  const hmrProtocol = env.VITE_HMR_PROTOCOL?.trim() as 'ws' | 'wss' | undefined
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : undefined
  const devPort = env.VITE_DEV_PORT ? Number(env.VITE_DEV_PORT) : 5175

  return {
    plugins: [
      basicSsl(),
      vue(),
      mode === 'development' && vueDevTools(),
      wasm(),
      topLevelAwait(),
      glsl({
        include: ['**/*.glsl', '**/*.vsh', '**/*.fsh', '**/*.vert', '**/*.frag'],
        watch: true,
        minify: true,
      }),
      runtimeAppConfigPlugin(projectRoot),
      localResourcePlugin(projectRoot),
      visualizer({
        open: false,
        filename: 'stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    define: {
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_OPTIONS_API__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@world-core': fileURLToPath(new URL('./core/pkg', import.meta.url)),
        '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
        '@composables': fileURLToPath(new URL('./src/composables', import.meta.url)),
        '@world': fileURLToPath(new URL('./src', import.meta.url)),
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
        '@render': fileURLToPath(new URL('./src/engine/render', import.meta.url)),
        '@shaders': fileURLToPath(new URL('./src/engine/render/shaders', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: devPort,
      allowedHosts,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              secure: false,
            },
            '/auth': {
              target: proxyTarget,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
      hmr: hmrHost
        ? {
            host: hmrHost,
            protocol: hmrProtocol,
            clientPort: hmrClientPort,
          }
        : undefined,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  }
})
