import type { ResourceDefinition } from '@/engine/config'

export type ResourceRuntimeEndpoints = {
  compiledBase: string
  assestBase: string
  textureManifestUrl?: string
  textureBinaryUrl?: string
  resourceBinaryUrl?: string
  variantLutUrl?: string
  colormapBase?: string
}

export type ResolvedResourceEndpoints = {
  cacheKey: string
  compiledBase: string
  assestBase: string
  textureManifestUrl: string
  textureBinaryUrl: string
  resourceBinaryUrl: string
  variantLutUrl: string
  colormapBase: string
  getColormapUrl(name: 'grass' | 'foliage'): string
}

function normalizeBasePath(value: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw.length === 0) {
    throw new Error('Resource endpoint path must be a non-empty string')
  }
  const normalized = raw
  const isAbsolute =
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('//')
  const withLeadingSlash = normalized.startsWith('/') || isAbsolute ? normalized : `/${normalized}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

function joinUrl(base: string, suffix: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedSuffix = suffix.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedSuffix}`
}

function getRequiredResourceEndpoints(resource: ResourceDefinition) {
  const endpoints = resource.ENDPOINTS
  if (!endpoints) {
    throw new Error(`Resource '${resource.key}' is missing explicit ENDPOINTS configuration`)
  }
  if (!endpoints.compiledBase) {
    throw new Error(`Resource '${resource.key}' is missing ENDPOINTS.compiledBase`)
  }
  if (!endpoints.assestBase) {
    throw new Error(`Resource '${resource.key}' is missing ENDPOINTS.assestBase`)
  }

  return endpoints
}

export function resolveResourceEndpoints(resource: ResourceDefinition): ResolvedResourceEndpoints {
  const overrides = getRequiredResourceEndpoints(resource)
  const compiledBase = normalizeBasePath(overrides.compiledBase)
  const assestBase = normalizeBasePath(overrides.assestBase)
  const textureManifestUrl =
    overrides.textureManifestUrl ?? joinUrl(compiledBase, 'textures.manifest.bin.deflate')
  const textureBinaryUrl =
    overrides.textureBinaryUrl ?? joinUrl(compiledBase, 'textures.bin.deflate')
  const resourceBinaryUrl =
    overrides.resourceBinaryUrl ?? joinUrl(compiledBase, 'resources.bin.deflate')
  const variantLutUrl = overrides.variantLutUrl ?? joinUrl(assestBase, 'variant_lut.png')
  const colormapBase = normalizeBasePath(overrides.colormapBase ?? assestBase)

  return {
    cacheKey: resource.key,
    compiledBase,
    assestBase,
    textureManifestUrl,
    textureBinaryUrl,
    resourceBinaryUrl,
    variantLutUrl,
    colormapBase,
    getColormapUrl(name) {
      return joinUrl(colormapBase, `${name}.png`)
    },
  }
}

export function getResourceEndpointSignature(resource: ResourceDefinition): string {
  const endpoints = resolveResourceEndpoints(resource)
  return [
    endpoints.cacheKey,
    endpoints.compiledBase,
    endpoints.textureManifestUrl,
    endpoints.textureBinaryUrl,
    endpoints.resourceBinaryUrl,
    endpoints.variantLutUrl,
    endpoints.assestBase,
    endpoints.colormapBase,
  ].join('|')
}
