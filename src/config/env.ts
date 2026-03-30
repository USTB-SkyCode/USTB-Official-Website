/**
 * Resolves runtime environment configurations from `/config.js`.
 * The config source is environment-specific, but the frontend always reads
 * the same `window.APP_CONFIG` shape at runtime.
 */

type RuntimeAppConfig = {
  API_BASE_URL?: string
  AUTH_BASE_URL?: string
  APP_BASE_URL?: string
  SKIN_API_BASE_URL?: string
  MCA_BASE_URL?: string
  SKIN_BASE_URL?: string
  DEV_BACKEND_PROXY_ENABLED?: boolean | string
}

function stripTrailingSlash(value: string | undefined | null): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function readBoolean(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true'
  }
  return false
}

export function getEnvConfig() {
  const appConfig: RuntimeAppConfig = window.APP_CONFIG ?? {}

  const rawApiBase = appConfig.API_BASE_URL
  const rawAuthBase = appConfig.AUTH_BASE_URL
  const rawAppBase = appConfig.APP_BASE_URL
  const rawSkinApiBase = appConfig.SKIN_API_BASE_URL

  const apiBaseUrl = stripTrailingSlash(rawApiBase)

  return {
    apiBaseUrl,
    authBaseUrl: stripTrailingSlash(rawAuthBase) || apiBaseUrl,
    appBaseUrl: stripTrailingSlash(rawAppBase) || window.location.origin,
    skinApiBaseUrl: stripTrailingSlash(rawSkinApiBase),
    mcaBaseUrl: stripTrailingSlash(appConfig.MCA_BASE_URL),
    skinBaseUrl: stripTrailingSlash(appConfig.SKIN_BASE_URL),
    devBackendProxyEnabled: readBoolean(appConfig.DEV_BACKEND_PROXY_ENABLED),
  }
}
