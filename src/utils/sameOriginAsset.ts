const warnedCrossOriginAssets = new Set<string>()
const SKIN_SITE_PROXY_PREFIX = '/skin-origin-proxy'
const SUPPORTED_SKIN_HOSTS = new Set(['skin.ustb.world'])

function trimUrl(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function warnCrossOriginAsset(message: string, raw: string, origin: string) {
  const cacheKey = `${message} ${origin} ${raw}`
  if (warnedCrossOriginAssets.has(cacheKey)) {
    return
  }

  warnedCrossOriginAssets.add(cacheKey)
  console.warn(`[sameOriginAsset] ${message}: ${raw} (${origin})`)
}

function toSkinProxyPath(url: URL): string | null {
  if (!SUPPORTED_SKIN_HOSTS.has(url.hostname)) {
    return null
  }

  return `${SKIN_SITE_PROXY_PREFIX}${url.pathname}${url.search}`
}

export function toSameOriginAssetUrl(value: string | undefined | null): string {
  const raw = trimUrl(value)
  if (!raw) {
    return ''
  }

  let resolved: URL
  try {
    resolved = new URL(raw, window.location.origin)
  } catch {
    return ''
  }

  if (resolved.origin !== window.location.origin) {
    const proxiedPath = toSkinProxyPath(resolved)
    if (proxiedPath) {
      return new URL(proxiedPath, window.location.origin).toString()
    }

    warnCrossOriginAsset(
      'Rejected cross-origin asset URL. Backend must return a same-origin URL or a supported same-origin proxy path instead',
      raw,
      resolved.origin,
    )
    return ''
  }

  return resolved.toString()
}

function normalizeApiAssetPayloadValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = trimUrl(value)
    if (!trimmed) {
      return value
    }

    let resolved: URL
    try {
      resolved = new URL(trimmed, window.location.origin)
    } catch {
      return value
    }

    if (resolved.origin !== window.location.origin && SUPPORTED_SKIN_HOSTS.has(resolved.hostname)) {
      return toSameOriginAssetUrl(trimmed)
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeApiAssetPayloadValue(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    normalized[key] = normalizeApiAssetPayloadValue(entryValue)
  }

  return normalized
}

export function normalizeApiAssetPayload<T>(value: T): T {
  return normalizeApiAssetPayloadValue(value) as T
}
