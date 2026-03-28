import { getEnvConfig } from '@/config/env'
import { buildApiUrl, buildAppUrl, buildAuthUrl, getAppBaseUrl, getAuthBaseUrl } from '@/utils/api'

const DEFAULT_AUTH_PROVIDER = 'ustb'
const DEFAULT_SKIN_API_BASE_URL = 'https://skin.ustb.world/skinapi'

export type LauncherDropProfile = {
  type: 'official-world-launcher-profile'
  version: 1
  serverName: string
  serverIp: string
  serverAddress: string
  autoLoginServerIp: string
  autoJoinServerIp: string
  autoJoinServerAddress: string
  preferredServerAddress: string
  quickPlayServer: string
  authMode: 'oauth-browser'
  authProvider: string
  authEntryUrl: string
  skinBaseUrl: string
  skinApiUrl: string
  apiBaseUrl: string
  authBaseUrl: string
  appBaseUrl: string
  authlibInjectorServerUrl: string
  authlibInjectorUri: string
}

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function resolveAbsoluteUrl(value: string, fallbackPath: string) {
  const fallbackUrl = new URL(fallbackPath, window.location.origin).toString()
  const raw = String(value || '').trim()
  if (!raw) {
    return stripTrailingSlash(fallbackUrl)
  }

  return stripTrailingSlash(new URL(raw, window.location.origin).toString())
}

function resolveApiBaseUrl() {
  return resolveAbsoluteUrl(buildApiUrl('/'), '/')
}

function resolveAuthBaseUrl() {
  return resolveAbsoluteUrl(getAuthBaseUrl(), '/')
}

function resolveAppBaseUrl() {
  return resolveAbsoluteUrl(getAppBaseUrl(), '/')
}

function resolveSkinBaseUrl() {
  return resolveAbsoluteUrl(getEnvConfig().skinBaseUrl, '/')
}

function resolveSkinApiBaseUrl() {
  const configuredSkinApiBaseUrl = resolveAbsoluteUrl(getEnvConfig().skinApiBaseUrl, '/')
  if (configuredSkinApiBaseUrl) {
    return configuredSkinApiBaseUrl
  }

  return DEFAULT_SKIN_API_BASE_URL
}

export function buildLauncherDropProfile(
  serverName: string,
  serverIp: string,
): LauncherDropProfile {
  const trimmedIp = String(serverIp || '').trim()
  if (!trimmedIp) {
    throw new Error('当前服务器未暴露可用 IP，无法拖拽到启动器。')
  }

  const skinBaseUrl = resolveSkinBaseUrl()
  const skinApiUrl = resolveSkinApiBaseUrl()
  const apiBaseUrl = resolveApiBaseUrl()
  const authBaseUrl = resolveAuthBaseUrl()
  const appBaseUrl = resolveAppBaseUrl()
  const authEntryUrl = buildAuthUrl(`/auth/${DEFAULT_AUTH_PROVIDER}`, buildAppUrl('/home'))
  const authlibInjectorUri = `authlib-injector:yggdrasil-server:${encodeURIComponent(skinApiUrl)}`

  return {
    type: 'official-world-launcher-profile',
    version: 1,
    serverName: String(serverName || 'USTB Server').trim() || 'USTB Server',
    serverIp: trimmedIp,
    serverAddress: trimmedIp,
    autoLoginServerIp: trimmedIp,
    autoJoinServerIp: trimmedIp,
    autoJoinServerAddress: trimmedIp,
    preferredServerAddress: trimmedIp,
    quickPlayServer: trimmedIp,
    authMode: 'oauth-browser',
    authProvider: DEFAULT_AUTH_PROVIDER,
    authEntryUrl,
    skinBaseUrl,
    skinApiUrl,
    apiBaseUrl,
    authBaseUrl,
    appBaseUrl,
    authlibInjectorServerUrl: skinApiUrl,
    authlibInjectorUri,
  }
}

export function populateLauncherDragData(dataTransfer: DataTransfer, profile: LauncherDropProfile) {
  const serializedProfile = JSON.stringify(profile)
  const serverAddress = profile.autoJoinServerAddress

  dataTransfer.effectAllowed = 'copyLink'
  dataTransfer.dropEffect = 'copy'
  dataTransfer.setData('text/plain', profile.authlibInjectorUri)
  dataTransfer.setData('text/uri-list', profile.authlibInjectorUri)
  dataTransfer.setData('text/x-official-world-server-address', serverAddress)
  dataTransfer.setData('application/x-official-world-server-address', serverAddress)
  dataTransfer.setData('text/x-minecraft-server-address', serverAddress)
  dataTransfer.setData('application/x-minecraft-server-address', serverAddress)
  dataTransfer.setData(
    'DownloadURL',
    `application/json:${profile.serverName}.official-world.json:data:application/json,${encodeURIComponent(serializedProfile)}`,
  )
  dataTransfer.setData('application/json', serializedProfile)
  dataTransfer.setData('application/x-official-world-launcher-profile+json', serializedProfile)
  dataTransfer.setData('text/x-official-world-launcher-profile+json', serializedProfile)
}
