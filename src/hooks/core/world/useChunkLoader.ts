import { ref } from 'vue'
import { ChunkManager } from '@/engine/world/chunk'
import type { ResourceDefinition } from '@/engine/config'

/**
 * 创建区块加载器 Hook。
 * @param initialBasePath 初始 MCA 基础路径
 */
export function useChunkLoader(initialBasePath?: string) {
  // 实例化区块管理器。
  const chunkManager = new ChunkManager(initialBasePath)

  // cache/branch miss 统计。
  const cacheMissCount = ref(0)
  const branchMissCount = ref(0)

  // 响应式状态。
  const loadedChunkCount = ref(0) // 当前已加载区块数
  const isUpdating = ref(false) // 是否正在刷新加载范围
  const lastUpdate = ref(0) // 最后一次更新序号

  // 监听 Worker 异步加载回调。
  chunkManager.onChunkLoaded = () => {
    loadedChunkCount.value = chunkManager.state.getLoadedChunksSet().size
    lastUpdate.value++
    cacheMissCount.value = chunkManager.cacheMissCount
  }

  /**
   * 更新区块加载范围。
   * @param playerX 玩家区块坐标 X
   * @param playerZ 玩家区块坐标 Z
   * @param distance 加载半径
   */
  const update = async (playerX: number, playerZ: number, distance: number) => {
    isUpdating.value = true
    try {
      await chunkManager.update(playerX, playerZ, distance)
    } finally {
      isUpdating.value = false
      // 同步最新统计信息。
      loadedChunkCount.value = chunkManager.state.getLoadedChunksSet().size
      cacheMissCount.value = chunkManager.cacheMissCount
    }
  }

  /**
   * 设置资源基础路径。
   * @param path 新路径
   */
  const setBasePath = (path: string) => {
    chunkManager.setBasePath(path)
  }

  /**
   * 设置 Region URL 解析函数。
   * @param resolver 解析函数
   */
  const setRegionUrlResolver = (resolver: (regionX: number, regionZ: number) => string) => {
    chunkManager.setRegionUrlResolver(resolver)
  }

  /**
   * 初始化加载器。
   * @param textureMap 纹理映射表
   * @param resource 资源定义
   */
  const init = async (
    textureMap: Map<string, number> | Record<string, number>,
    resource: ResourceDefinition,
  ) => {
    await chunkManager.init(textureMap, resource)
  }

  return {
    chunkManager,
    loadedChunkCount,
    isUpdating,
    lastUpdate,
    cacheMissCount,
    branchMissCount,
    update,
    setBasePath,
    setRegionUrlResolver,
    init,
  }
}
