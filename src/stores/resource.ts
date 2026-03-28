import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { GAME_CONFIG, type ResourceDefinition } from '@/engine/config'
import { resolveResourceEndpoints } from '@/resource/endpoints'

// 本地持久化键。
const STORAGE_KEY = 'world-resource-pack'

export const useResourceStore = defineStore('resource', () => {
  // 可选资源包列表。
  const resources = GAME_CONFIG.RESOURCE.RESOURCES
  const defaultKey = GAME_CONFIG.RESOURCE.DEFAULT_KEY

  // 缺失资源配置时直接报错。
  if (!resources.length) {
    throw new Error('GAME_CONFIG.RESOURCE.RESOURCES is empty')
  }
  const fallback = resources.find(res => res.key === defaultKey) ?? resources[0]

  // 读取上一次保存的资源键。
  let savedKey: string | null = null
  if (typeof window !== 'undefined') {
    try {
      savedKey = window.localStorage.getItem(STORAGE_KEY)
    } catch (err) {
      console.warn('Resource store: failed to read saved key', err)
    }
  }

  // 初始化激活键，优先使用本地持久化值。
  const initialKey = resources.find(res => res.key === savedKey)?.key ?? fallback.key
  const activeKey = ref(initialKey)

  // 当前激活的资源定义与其派生端点。
  const activeResource = computed<ResourceDefinition>(() => {
    return resources.find(res => res.key === activeKey.value) ?? fallback
  })
  const activeResourceEndpoints = computed(() => resolveResourceEndpoints(activeResource.value))

  /**
   * 切换资源包。
   * @param key 目标资源键
   */
  const setResource = (key: string) => {
    if (activeKey.value === key) return
    if (resources.some(res => res.key === key)) {
      activeKey.value = key
    } else {
      console.warn(`Resource store: unknown resource key ${key}`)
    }
  }

  // 在浏览器环境中持久化当前选择。
  if (typeof window !== 'undefined') {
    watch(
      activeKey,
      key => {
        try {
          window.localStorage.setItem(STORAGE_KEY, key)
        } catch (err) {
          console.warn('Resource store: failed to save key', err)
        }
      },
      { immediate: true },
    )
  }

  return {
    resources,
    activeKey,
    activeResource,
    activeResourceEndpoints,
    setResource,
  }
})
