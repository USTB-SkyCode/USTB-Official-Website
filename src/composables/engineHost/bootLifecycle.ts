import { onUnmounted, watch, type ComputedRef, type Ref } from 'vue'
import { applyEngineRuntimeConfigPatch, type EngineRuntimeConfigPatch } from '@/config/runtime'
import { resolveSceneConfig, resolveSceneCameraPreset } from '@/config/scene'
import { classifyRuntimeConfigPatch } from '@/engine/runtime/EngineRuntimeConfigApplier'
import { registerEngineRuntimeConfigHost } from '@/engine/runtime/EngineRuntimeConfigHostBridge'
import type { ResourceDefinition } from '@/engine/config'
import type { EngineCameraPose, EnginePlayerSkinOverride } from '@/hooks/useEngine'
import type { PlayerRigMotionBehavior } from '@/engine/world/game/PlayerRig'

export type HostBootReason =
  | 'boot-scene'
  | 'switch-resource'
  | 'refresh-runtime-config'
  | 'refresh-player-skin'

export type HostBootLifecycleState = {
  engineStatus: Ref<'idle' | 'booting' | 'ready' | 'error'>
  hostBootReason: Ref<HostBootReason>
}

export type HostBootLifecycleScene = {
  canvasRef: Ref<HTMLCanvasElement | null>
  shouldReservePersistentHost: ComputedRef<boolean>
  sceneKey: ComputedRef<string | null>
  cameraPresetKey: ComputedRef<string | null>
  currentPlayerSkinOverride: ComputedRef<EnginePlayerSkinOverride | null>
  resolvePersistedPose: () => EngineCameraPose | null
}

export type HostBootLifecycleResource = {
  activeResource: ComputedRef<ResourceDefinition>
  activeResourceKey: ComputedRef<string>
}

export type HostBootLifecycleEngine = {
  setup: (
    canvas: HTMLCanvasElement,
    resource: ResourceDefinition,
    opts?: {
      worldBasePath?: string
      initialPose?: EngineCameraPose
      playerSkin?: EnginePlayerSkinOverride
    },
  ) => Promise<unknown>
  dispose: () => void
  refreshEngineSession: (
    resourceOverride?: ResourceDefinition,
    setupOptionsOverride?: { playerSkin?: EnginePlayerSkinOverride },
  ) => Promise<unknown>
  applyCameraPreset: (presetKey: string) => void
  configurePlayerMotionBehavior: (behavior: PlayerRigMotionBehavior | null | undefined) => void
  applyRuntimeConfig: (patch: EngineRuntimeConfigPatch) => {
    controlsUpdated: boolean
    chunkReloadRequested: boolean
    engineRefreshRequested: boolean
  }
  clearTakeoverSurfaces: () => void
}

export type HostBootLifecycleHost = {
  fallbackToDom: (reason: string) => void
  setHostRuntimeReady: (ready: boolean) => void
}

export type HostBootLifecycleOptions = {
  state: HostBootLifecycleState
  scene: HostBootLifecycleScene
  resource: HostBootLifecycleResource
  engine: HostBootLifecycleEngine
  host: HostBootLifecycleHost
}

export function useHostBootLifecycle(options: HostBootLifecycleOptions) {
  const { state, scene, resource, engine, host } = options
  const { engineStatus, hostBootReason } = state
  let bootSerial = 0

  function markHostBootReason(reason: HostBootReason) {
    hostBootReason.value = reason
  }

  function describeRuntimeRefreshPatch(patch: EngineRuntimeConfigPatch) {
    if (
      patch.chunk?.loadDistance !== undefined ||
      patch.lighting?.enableVertexLighting !== undefined ||
      patch.lighting?.enableSmoothLighting !== undefined
    ) {
      return 'refresh-runtime-config' as const
    }
    return null
  }

  function fallbackHostToDom(reason: string, error?: unknown) {
    if (error) {
      console.error(reason, error)
    } else {
      console.error(reason)
    }
    engineStatus.value = 'error'
    engine.clearTakeoverSurfaces()
    host.setHostRuntimeReady(false)
    host.fallbackToDom(reason)
    engine.dispose()
  }

  // --- Runtime config host bridge ---
  const unregisterRuntimeConfigHost = registerEngineRuntimeConfigHost(
    (patch: EngineRuntimeConfigPatch) => {
      if (engineStatus.value !== 'ready') {
        applyEngineRuntimeConfigPatch(patch)
        return classifyRuntimeConfigPatch(patch)
      }

      const result = engine.applyRuntimeConfig(patch)
      const refreshReason = describeRuntimeRefreshPatch(patch)
      if (result.engineRefreshRequested && refreshReason) {
        markHostBootReason(refreshReason)
      }

      return result
    },
  )

  // --- Boot lifecycle watcher ---
  watch(
    [
      scene.shouldReservePersistentHost,
      resource.activeResourceKey,
      scene.canvasRef,
      scene.sceneKey,
    ],
    async (
      [shouldReserveHost, resourceKey, canvas, nextSceneKey],
      [_prevShouldReserveHost, prevResourceKey, _prevCanvas, previousSceneKey],
    ) => {
      const currentBoot = ++bootSerial

      if (!shouldReserveHost) {
        engine.dispose()
        engine.clearTakeoverSurfaces()
        engineStatus.value = 'idle'
        host.setHostRuntimeReady(false)
        return
      }

      if (!nextSceneKey) {
        if (engineStatus.value !== 'idle') {
          engine.dispose()
          engine.clearTakeoverSurfaces()
        }
        engineStatus.value = 'idle'
        host.setHostRuntimeReady(false)
        return
      }

      if (
        engineStatus.value === 'ready' &&
        prevResourceKey === resourceKey &&
        previousSceneKey === nextSceneKey
      ) {
        host.setHostRuntimeReady(true)
        return
      }

      if (!canvas) {
        engineStatus.value = 'idle'
        engine.clearTakeoverSurfaces()
        host.setHostRuntimeReady(false)
        return
      }

      const resourceChanged =
        engineStatus.value === 'ready' &&
        prevResourceKey !== undefined &&
        prevResourceKey !== resourceKey
      if (resourceChanged) {
        markHostBootReason('switch-resource')
        engineStatus.value = 'booting'
        host.setHostRuntimeReady(false)

        try {
          await engine.refreshEngineSession(resource.activeResource.value)

          if (currentBoot !== bootSerial) {
            engine.dispose()
            return
          }

          engineStatus.value = 'ready'
          host.setHostRuntimeReady(true)
        } catch (error) {
          if (currentBoot !== bootSerial) return
          fallbackHostToDom('[PersistentEngineHost] Failed to refresh persistent runtime', error)
        }
        return
      }

      const shouldRebuild = engineStatus.value === 'error'
      if (shouldRebuild) {
        engine.dispose()
      }

      engineStatus.value = 'booting'
      markHostBootReason('boot-scene')
      host.setHostRuntimeReady(false)

      try {
        const resolvedPreset = resolveSceneCameraPreset(scene.cameraPresetKey.value)
        const initialPose = scene.resolvePersistedPose() ?? resolvedPreset
        const sceneConfig = resolveSceneConfig(nextSceneKey)
        engine.configurePlayerMotionBehavior(resolvedPreset?.motionBehavior ?? null)

        await engine.setup(canvas, resource.activeResource.value, {
          worldBasePath: sceneConfig.mcaBaseUrl,
          initialPose: initialPose ?? undefined,
          playerSkin: scene.currentPlayerSkinOverride.value ?? undefined,
        })

        if (currentBoot !== bootSerial) {
          engine.dispose()
          return
        }

        engineStatus.value = 'ready'
        host.setHostRuntimeReady(true)

        if (!initialPose && scene.cameraPresetKey.value) {
          engine.applyCameraPreset(scene.cameraPresetKey.value)
        }
      } catch (error) {
        if (currentBoot !== bootSerial) return
        fallbackHostToDom('[PersistentEngineHost] Failed to boot persistent runtime', error)
      }
    },
    { immediate: true, flush: 'post' },
  )

  onUnmounted(() => {
    unregisterRuntimeConfigHost()
  })

  return { fallbackHostToDom }
}
