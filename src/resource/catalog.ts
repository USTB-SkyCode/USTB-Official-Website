/**
 * 运行时资源包目录。
 *
 * 应用启动时从 /packs/index.json 加载，替代编译期生成的常量。
 */

export interface PackIndexEntry {
  key: string
  label: string
  description: string
  directory: string
  maxTextureSize: number
  labPbr: boolean
  sourcePacks: string[]
}

interface PackIndex {
  defaultKey: string
  packs: PackIndexEntry[]
}

let loaded: PackIndex | null = null

/**
 * 从 /packs/index.json 加载资源包目录。
 * 必须在应用挂载前调用且仅调用一次。
 */
export async function loadResourcePackCatalog(): Promise<void> {
  const response = await fetch('/packs/index.json')
  if (!response.ok) {
    throw new Error(`Failed to load resource pack index: ${response.status}`)
  }
  const data: PackIndex = await response.json()
  if (!data.packs?.length) {
    throw new Error('Resource pack index contains no packs')
  }
  loaded = data
}

export function getResourcePackCatalog(): PackIndex {
  if (!loaded) {
    throw new Error('Resource pack catalog not loaded. Call loadResourcePackCatalog() first.')
  }
  return loaded
}
