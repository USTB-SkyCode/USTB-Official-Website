import { getEnvConfig } from '@/config/env'
import { normalizeApiAssetPayload } from '@/utils/sameOriginAsset'

export function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[2]) : null
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function buildUrl(base: string, path: string): string {
  if (!base) return path
  if (/^https?:\/\//.test(path)) return path
  return `${stripTrailingSlash(base)}${path.startsWith('/') ? path : `/${path}`}`
}

function hasDevBackendProxy(): boolean {
  return getEnvConfig().devBackendProxyEnabled
}

export function getApiBaseUrl(): string {
  return getEnvConfig().apiBaseUrl
}

export function getAuthBaseUrl(): string {
  return getEnvConfig().authBaseUrl
}

export function getAppBaseUrl(): string {
  return getEnvConfig().appBaseUrl
}

export function buildApiUrl(path: string): string {
  return buildUrl(getApiBaseUrl(), path)
}

export function buildAuthUrl(path: string, returnTo?: string): string {
  const authBaseUrl = getAuthBaseUrl()

  if (!authBaseUrl && !hasDevBackendProxy()) {
    throw new Error(
      'Missing APP_CONFIG.AUTH_BASE_URL. Configure /config.js or enable the dev backend proxy before using OAuth login.',
    )
  }

  const target = new URL(buildUrl(authBaseUrl, path), window.location.origin)
  if (returnTo) {
    target.searchParams.set('return_to', returnTo)
  }
  return target.toString()
}

export function buildAppUrl(path: string): string {
  return buildUrl(getAppBaseUrl(), path)
}

export async function initCsrf(): Promise<void> {
  try {
    await fetch(buildApiUrl('/api/session/csrf-token'), { method: 'GET', credentials: 'include' })
  } catch (e) {
    console.warn('initCsrf failed', e)
  }
}

type ApiFetchResult<T = unknown> = {
  ok: boolean
  status: number
  body: T | null
  error?: unknown
  res?: Response
}

export async function apiFetch<T = unknown>(
  input: RequestInfo,
  init: RequestInit = {},
): Promise<ApiFetchResult<T>> {
  const cfg: RequestInit = {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }

  const method = (cfg.method ?? 'GET').toString().toUpperCase()
  if (method !== 'GET') {
    const token = getCookie('XSRF-TOKEN') ?? getCookie('X-CSRFToken') ?? getCookie('XSRF_TOKEN')
    if (token) {
      ;(cfg.headers as Record<string, unknown>)['X-CSRFToken'] = token
    }
  }

  try {
    const target = typeof input === 'string' ? buildApiUrl(input) : input
    const res = await fetch(target, cfg)
    let body: T | null = null
    try {
      body = normalizeApiAssetPayload((await res.json()) as T)
    } catch {
      body = null
    }
    return { ok: res.ok, status: res.status, body, res }
  } catch (error) {
    return { ok: false, status: 0, body: null, error }
  }
}

export default apiFetch
