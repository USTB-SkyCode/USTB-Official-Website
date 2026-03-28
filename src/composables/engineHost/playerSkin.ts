import { computed, watch, type ComputedRef, type Ref } from 'vue'
import { useUserStore } from '@/stores/user'
import type { HostBootReason } from '@/composables/engineHost/bootLifecycle'
import type { ResourceDefinition } from '@/engine/config'
import type { EnginePlayerSkinOverride } from '@/hooks/useEngine'

export function useHostPlayerSkin(options: {
  routeId: ComputedRef<string>
  shouldReservePersistentHost: ComputedRef<boolean>
  engineStatus: Ref<'idle' | 'booting' | 'ready' | 'error'>
  hostBootReason: Ref<HostBootReason>
  setHostRuntimeReady: (ready: boolean) => void
  refreshEngineSession: (
    resourceOverride?: ResourceDefinition,
    setupOptionsOverride?: { playerSkin?: EnginePlayerSkinOverride },
  ) => Promise<unknown>
}) {
  const userStore = useUserStore()

  const currentPlayerSkinOverride = computed<EnginePlayerSkinOverride | null>(() => {
    const skinUrl = userStore.playerSkinUrl?.trim()
    if (!skinUrl) return null

    const userId = userStore.user?.user_id?.trim() || 'site-user'
    const version = userStore.playerSkinVersion?.trim() || skinUrl
    const modelType: 'normal' | 'slim' =
      userStore.playerSkinModelType === 'slim' ? 'slim' : 'normal'
    return {
      skinId: `player-site-skin:${userId}:${version}:${modelType}`,
      skinUrl,
      modelType,
    }
  })

  const currentPlayerSkinKey = computed(
    () => currentPlayerSkinOverride.value?.skinId ?? 'player-fallback',
  )

  watch(
    currentPlayerSkinKey,
    async (nextKey, previousKey) => {
      if (nextKey === previousKey) return
      if (options.routeId.value === 'login') return
      if (!options.shouldReservePersistentHost.value || options.engineStatus.value !== 'ready')
        return

      options.engineStatus.value = 'booting'
      options.hostBootReason.value = 'refresh-player-skin'
      options.setHostRuntimeReady(false)

      try {
        await options.refreshEngineSession(undefined, {
          playerSkin: currentPlayerSkinOverride.value ?? undefined,
        })
        options.engineStatus.value = 'ready'
        options.setHostRuntimeReady(true)
      } catch (error) {
        console.error('[PersistentEngineHost] Failed to refresh player skin', error)
        options.engineStatus.value = 'error'
        options.setHostRuntimeReady(false)
      }
    },
    { flush: 'post' },
  )

  return {
    currentPlayerSkinOverride,
    currentPlayerSkinKey,
  }
}
