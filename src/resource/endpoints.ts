import type { ResourceDefinition } from '@/engine/config'

export type ResourceRuntimeEndpoints = {
  packRoot?: string
  compiledBase?: string
  assetsBase?: string
  metadataUrl?: string
  textureManifestUrl?: string
  textureBinaryUrl?: string
  resourceBinaryUrl?: string
  variantLutUrl?: string
  colormapBase?: string
}

export type ResolvedResourceEndpoints = {
  cacheKey: string
  packRoot: string
  compiledBase: string
  assetsBase: string
  metadataUrl: string
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

  const packRoot = endpoints.packRoot ?? resource.MODELS
  if (!packRoot) {
    throw new Error(`Resource '${resource.key}' is missing ENDPOINTS.packRoot`)
  }

  return {
    ...endpoints,
    packRoot,
  }
}

export function resolveResourceEndpoints(resource: ResourceDefinition): ResolvedResourceEndpoints {
  const overrides = getRequiredResourceEndpoints(resource)
  const packRoot = normalizeBasePath(overrides.packRoot)
  const compiledBase = normalizeBasePath(overrides.compiledBase ?? joinUrl(packRoot, 'compiled'))
  const assetsBase = normalizeBasePath(overrides.assetsBase ?? joinUrl(packRoot, 'assets'))
  const metadataUrl = overrides.metadataUrl ?? joinUrl(packRoot, 'metadata.json')
  const textureManifestUrl =
    overrides.textureManifestUrl ?? joinUrl(compiledBase, 'textures.manifest.bin.deflate')
  const textureBinaryUrl =
    overrides.textureBinaryUrl ?? joinUrl(compiledBase, 'textures.bin.deflate')
  const resourceBinaryUrl =
    overrides.resourceBinaryUrl ?? joinUrl(compiledBase, 'resources.bin.deflate')
  const variantLutUrl = overrides.variantLutUrl ?? joinUrl(assetsBase, 'variant_lut.png')
  const colormapBase = normalizeBasePath(overrides.colormapBase ?? assetsBase)

  return {
    cacheKey: resource.key,
    packRoot,
    compiledBase,
    assetsBase,
    metadataUrl,
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
    endpoints.packRoot,
    endpoints.compiledBase,
    endpoints.textureManifestUrl,
    endpoints.textureBinaryUrl,
    endpoints.resourceBinaryUrl,
    endpoints.variantLutUrl,
    endpoints.assetsBase,
    endpoints.metadataUrl,
    endpoints.colormapBase,
  ].join('|')
}
