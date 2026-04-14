import type { CharacterModelType } from '@/engine/world/entity/character/modelType'

const NORMAL_MODEL_ALIASES = new Set(['default', 'normal', 'classic', 'steve'])
const SLIM_MODEL_ALIASES = new Set(['slim', 'alex'])

const detectionCache = new Map<string, Promise<CharacterModelType>>()

export function normalizeCharacterModelType(value: unknown): CharacterModelType | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (SLIM_MODEL_ALIASES.has(normalized)) {
    return 'slim'
  }
  if (NORMAL_MODEL_ALIASES.has(normalized)) {
    return 'normal'
  }
  return null
}

export async function detectCharacterModelTypeFromSkinUrl(
  skinUrl: string,
): Promise<CharacterModelType> {
  const normalizedUrl = skinUrl.trim()
  if (!normalizedUrl) {
    return 'normal'
  }

  const existing = detectionCache.get(normalizedUrl)
  if (existing) {
    return existing
  }

  const pending = detectCharacterModelType(normalizedUrl).catch(error => {
    detectionCache.delete(normalizedUrl)
    throw error
  })
  detectionCache.set(normalizedUrl, pending)
  return pending
}

async function detectCharacterModelType(skinUrl: string): Promise<CharacterModelType> {
  try {
    const response = await fetch(skinUrl, {
      credentials: 'include',
      cache: 'force-cache',
    })
    if (!response.ok) {
      return 'normal'
    }

    const blob = await response.blob()
    const source = await createRasterSource(blob)
    try {
      const width = 'naturalWidth' in source ? source.naturalWidth : source.width
      const height = 'naturalHeight' in source ? source.naturalHeight : source.height
      if (width !== 64 || height !== 64) {
        return 'normal'
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        return 'normal'
      }

      context.clearRect(0, 0, width, height)
      context.drawImage(source, 0, 0, width, height)
      const { data } = context.getImageData(0, 0, width, height)
      return hasSlimArmTransparency(data, width) ? 'slim' : 'normal'
    } finally {
      if ('close' in source && typeof source.close === 'function') {
        source.close()
      }
    }
  } catch {
    return 'normal'
  }
}

function hasSlimArmTransparency(data: Uint8ClampedArray, width: number) {
  return (
    hasTransparentPixel(data, width, 54, 56, 20, 32) ||
    hasTransparentPixel(data, width, 46, 48, 52, 64)
  )
}

function hasTransparentPixel(
  data: Uint8ClampedArray,
  width: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
) {
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const alphaIndex = (y * width + x) * 4 + 3
      if ((data[alphaIndex] ?? 255) === 0) {
        return true
      }
    }
  }
  return false
}

async function createRasterSource(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    return await loadImageElement(objectUrl)
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to decode skin image'))
    }
    image.src = url
  })
}
