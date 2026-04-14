import type { EngineRuntimeLightingConfig, EngineRuntimeMutableConfig } from '@/config/runtime'
import type { ResourceDefinition } from '@/engine/config'
import type { RenderBackendKind } from '@/engine/render/backend/shared/runtime/RenderBackendCapabilities'
import type { CharacterModelType } from '@/engine/world/entity/character/modelType'
import type { EngineCameraPose } from '../camera/useCameraController'

export type EnginePlayerSkinOverride = {
  skinId: string
  skinUrl: string
  modelType?: CharacterModelType
}

export type EngineSessionSetupOptions = {
  initialPose?: EngineCameraPose
  worldBasePath?: string
  regionUrlResolver?: (regionX: number, regionZ: number) => string
  playerSkin?: EnginePlayerSkinOverride
  renderBackend?: RenderBackendKind
}

type EngineSetupState = {
  canvas: HTMLCanvasElement
  resource: ResourceDefinition
  options: EngineSessionSetupOptions
}

type UseSessionLifecycleOptions = {
  initialPose?: EngineCameraPose
  initialCanvasInputEnabled: boolean
  initialWorldInteractionEnabled: boolean
  getRuntimeConfigSnapshot: () => EngineRuntimeMutableConfig
  subscribeRuntimeConfig: (listener: (nextConfig: EngineRuntimeMutableConfig) => void) => () => void
  onRuntimeConfigSnapshot: (nextConfig: EngineRuntimeMutableConfig) => void
  getRuntimeLightingConfig: () => EngineRuntimeLightingConfig
  setSessionLightingConfig: (config: EngineRuntimeLightingConfig) => void
  setSessionChunkLoadDistance: (distance: number) => void
  captureCameraPose: () => EngineCameraPose
  setPose: (pose: EngineCameraPose) => void
  getCanvasInputEnabled: () => boolean
  setCanvasInputEnabled: (enabled: boolean) => void
  getWorldInteractionEnabled: () => boolean
  setWorldInteractionEnabled: (enabled: boolean) => void
  setDebugStatus: (status: string) => void
  initializeRenderSession: (
    canvas: HTMLCanvasElement,
    resource: ResourceDefinition,
    setupOptions: EngineSessionSetupOptions,
  ) => Promise<void>
  applyWorldSourceConfig: (setupOptions: EngineSessionSetupOptions) => void
  bindChunkRuntimeCallbacks: (onWorkerReady: () => void) => void
  initializeChunkManager: (resource: ResourceDefinition) => Promise<void>
  initializeBlockInteraction: (canvas: HTMLCanvasElement) => void
  applyRuntimeMesherOptions: () => void
  remeshLoadedChunks: () => void
  beginChunkWarmup: (durationMs?: number) => void
  requestChunkRefreshNow: () => void
  startLoop: () => void
  disposeRenderSession: () => void
  clearChunkManager: () => void
  terminateChunkManager: () => void
  setWorkerReady: (ready: boolean) => void
  getResourceSignature: (resource: ResourceDefinition) => string
}

export function useSessionLifecycle(options: UseSessionLifecycleOptions) {
  let activeSetupState: EngineSetupState | null = null
  let refreshSessionPromise: Promise<boolean> | null = null
  let unsubscribeRuntimeConfig: (() => void) | null = null
  let chunkRuntimeActive = false

  function shouldInitializeChunkRuntime(setupOptions: EngineSessionSetupOptions) {
    return (setupOptions.renderBackend ?? 'webgl2') === 'webgl2'
  }

  function refreshEngineSession(
    resourceOverride?: ResourceDefinition,
    setupOptionsOverride: Partial<EngineSessionSetupOptions> = {},
    canvasOverride?: HTMLCanvasElement,
  ) {
    const setupState = activeSetupState
    if (!setupState) {
      return Promise.resolve(false)
    }

    const runRefresh = async () => {
      const nextCanvas = canvasOverride ?? setupState.canvas
      const nextResource = resourceOverride ?? setupState.resource
      const nextPose = options.captureCameraPose()
      const shouldEnableCanvasInput = options.getCanvasInputEnabled()
      const shouldEnableWorldInteraction = options.getWorldInteractionEnabled()
      const hadChunkRuntime = chunkRuntimeActive
      const resourceChanged =
        resourceOverride !== undefined &&
        options.getResourceSignature(nextResource) !==
          options.getResourceSignature(setupState.resource)

      options.setDebugStatus('Refreshing engine session...')
      options.disposeRenderSession()
      options.setWorkerReady(false)

      activeSetupState = {
        canvas: nextCanvas,
        resource: nextResource,
        options: {
          ...setupState.options,
          ...setupOptionsOverride,
          initialPose: nextPose,
        },
      }

      options.setSessionLightingConfig(options.getRuntimeLightingConfig())
      options.setPose(nextPose)
      options.setCanvasInputEnabled(shouldEnableCanvasInput)
      options.setWorldInteractionEnabled(shouldEnableWorldInteraction)

      const nextShouldInitializeChunkRuntime = shouldInitializeChunkRuntime(
        activeSetupState.options,
      )
      if (!nextShouldInitializeChunkRuntime && hadChunkRuntime) {
        options.clearChunkManager()
        chunkRuntimeActive = false
      }

      await options.initializeRenderSession(nextCanvas, nextResource, activeSetupState.options)
      options.applyWorldSourceConfig(activeSetupState.options)

      if (nextShouldInitializeChunkRuntime) {
        let workerReadyHandled = false
        options.bindChunkRuntimeCallbacks(() => {
          if (workerReadyHandled) {
            return
          }

          workerReadyHandled = true
          options.setDebugStatus('Worker ready')
          options.setWorkerReady(true)
          options.remeshLoadedChunks()
          options.beginChunkWarmup()
          options.requestChunkRefreshNow()
        })

        if (resourceChanged || !hadChunkRuntime) {
          await options.initializeChunkManager(nextResource)
        } else {
          options.applyRuntimeMesherOptions()
          options.setWorkerReady(true)
          options.remeshLoadedChunks()
          options.beginChunkWarmup()
          options.requestChunkRefreshNow()
        }

        if (options.getWorldInteractionEnabled()) {
          options.initializeBlockInteraction(nextCanvas)
        }

        chunkRuntimeActive = true
      } else {
        options.setWorkerReady(true)
        options.clearChunkManager()
        chunkRuntimeActive = false
      }

      options.setDebugStatus('Running')
      options.startLoop()

      return true
    }

    const queuedRefresh = (refreshSessionPromise ?? Promise.resolve(true))
      .catch(() => true)
      .then(runRefresh)

    refreshSessionPromise = queuedRefresh.finally(() => {
      if (refreshSessionPromise === queuedRefresh) {
        refreshSessionPromise = null
      }
    })

    return queuedRefresh
  }

  async function setup(
    canvas: HTMLCanvasElement,
    resource: ResourceDefinition,
    setupOptions: EngineSessionSetupOptions = {},
  ) {
    if (!canvas) {
      return false
    }

    try {
      activeSetupState = {
        canvas,
        resource,
        options: { ...setupOptions },
      }
      options.setSessionChunkLoadDistance(options.getRuntimeConfigSnapshot().chunk.loadDistance)
      const initialPose = setupOptions.initialPose ?? options.initialPose
      options.setSessionLightingConfig(options.getRuntimeLightingConfig())

      if (initialPose) {
        options.setPose(initialPose)
      }

      unsubscribeRuntimeConfig?.()
      unsubscribeRuntimeConfig = options.subscribeRuntimeConfig(nextConfig => {
        options.onRuntimeConfigSnapshot(nextConfig)
      })

      const shouldBootChunkRuntime = shouldInitializeChunkRuntime(activeSetupState.options)
      await options.initializeRenderSession(canvas, resource, activeSetupState.options)
      options.applyWorldSourceConfig(setupOptions)
      if (shouldBootChunkRuntime) {
        options.bindChunkRuntimeCallbacks(() => {
          options.setDebugStatus('Worker ready')
          options.setWorkerReady(true)
          options.beginChunkWarmup()
          options.requestChunkRefreshNow()
        })

        await options.initializeChunkManager(resource)
        options.beginChunkWarmup()
        options.requestChunkRefreshNow()
        if (options.getWorldInteractionEnabled()) {
          options.initializeBlockInteraction(canvas)
        }

        chunkRuntimeActive = true
      } else {
        options.setWorkerReady(true)
        options.clearChunkManager()
        chunkRuntimeActive = false
      }

      options.setDebugStatus('Running')
      options.startLoop()

      return true
    } catch (error) {
      console.error(error)
      options.setDebugStatus(error instanceof Error ? `Error: ${error.message}` : 'Unknown error')
      dispose()
      throw error
    }
  }

  function dispose() {
    unsubscribeRuntimeConfig?.()
    unsubscribeRuntimeConfig = null
    options.disposeRenderSession()
    options.setCanvasInputEnabled(options.initialCanvasInputEnabled)
    options.setWorldInteractionEnabled(options.initialWorldInteractionEnabled)
    options.clearChunkManager()
    chunkRuntimeActive = false
    options.setWorkerReady(false)
    console.log('[useEngine] Engine state disposed, workers preserved.')
  }

  function terminate() {
    dispose()
    options.terminateChunkManager()
    activeSetupState = null
    refreshSessionPromise = null
    console.log('[useEngine] Engine totally terminated.')
  }

  return {
    setup,
    dispose,
    terminate,
    refreshEngineSession,
  }
}
