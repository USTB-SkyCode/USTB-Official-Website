import { ref, readonly, onUnmounted, watch } from 'vue'
import { vec3 } from '@/engine/render/utils/math'
import { GAME_CONFIG, type ResourceDefinition } from '@/engine/config'
import {
  applyEngineRuntimeConfigPatch,
  getEngineRuntimeConfig,
  getEngineRuntimeLightingConfig,
  subscribeEngineRuntimeConfig,
  type EngineRuntimeLightingConfig,
  type EngineRuntimeConfigPatch,
} from '@/config/runtime'
import { DEBUG_FLAGS } from '@/config/debug'
import { getResourceEndpointSignature, resolveResourceEndpoints } from '@/resource/endpoints'
import {
  classifyRuntimeConfigPatch,
  type EngineRuntimeConfigApplyResult,
} from '@/engine/runtime/EngineRuntimeConfigApplier'
import type { ChunkArtifactPayloadArenaReleaseHandle } from '@/engine/world/chunk/domain'
import type { IRenderBackend } from '@/engine/render/backend/shared/contracts/IRenderBackend'
import type { CharacterRenderBridgePort } from '@/engine/render/entity/runtime/character/types'

// Managers
import type { TextureManager } from '@/engine/render/backend/webgl2/texture/TextureManager'
import type { ChunkArtifactRenderBridge } from '@/engine/render/backend/webgl2/terrain/runtime/ChunkArtifactRenderBridge'
import { RenderQueueBuilder } from '@/engine/render/queue/RenderQueueBuilder'

import type { Player } from '@/engine/world/entity/character/Player'
import type { FirstPersonHand } from '@/engine/world/entity/character/firstPerson/FirstPersonHand'
import { CHARACTER_LOCAL_HEIGHT } from '@/engine/world/entity/character/Character'
import { DayNightCycle } from '@/engine/world/game/DayNightCycle'
import type { CharacterModelType } from '@/engine/world/entity/character/modelType'
import {
  getCharacterBodyGroupId,
  getCharacterBodyGroupObjectId,
} from '@/engine/world/entity/character/renderGroups'
import { CSMCalculator } from '@/engine/render/core/lighting/CSMCalculator'
import { TextureLoader } from '@/engine/render/texture/TextureLoader'

// Hooks
import { useRenderer } from './core/render/useRenderer'
import { usePlayerRig } from '@/engine/world/game/PlayerRig'
import { useBlockInteraction } from '@/engine/world/game/BlockInteraction/BlockInteraction'
import { useFirstPersonHandAnimation } from '@/engine/world/entity/character/firstPerson/FirstPersonHandAnimation'
import {
  useCameraController,
  type EngineCameraPose as InternalEngineCameraPose,
  type EngineCameraTransitionEasing as InternalEngineCameraTransitionEasing,
  type EngineCameraTransitionOptions as InternalEngineCameraTransitionOptions,
} from './core/camera/useCameraController'
import { useGameLoop } from './core/frame/useGameLoop'
import { type TakeoverSurfaceConsumerState } from '@/engine/takeover/TakeoverSurfaceConsumer'
import { type TakeoverSurfaceRenderAdapterState } from '@/engine/takeover/TakeoverSurfaceRenderAdapter'
import { type TakeoverSurfaceUi3dStagingState } from '@/engine/takeover/TakeoverSurfaceUi3dStaging'
import {
  useTakeover,
  type EngineTakeoverSurfaceFrame as InternalEngineTakeoverSurfaceFrame,
  type EngineTakeoverUi3dSubmissionState as InternalEngineTakeoverUi3dSubmissionState,
} from './core/takeover/useTakeover'
import { useFrameRuntime } from './core/frame/useFrameRuntime'
import {
  loadRenderSessionModules,
  type RenderSessionBackendKind,
} from './core/session/useRenderSessionModules'
import { useSessionLifecycle } from './core/session/useSessionLifecycle'
import { usePerformanceStats } from './core/frame/usePerformanceStats'
import { useChunkLoader } from './core/world/useChunkLoader' // 复用现有的 ChunkLoader Hook
import { useEngineDayNightController } from './core/dayNight/useEngineDayNightController'
import { resolveSceneCameraPreset } from '@/config/scene'
import type { PlayerRigMotionBehavior } from '@/engine/world/game/PlayerRig'

/**
 * @file useEngine.ts
 * @brief 引擎主入口 Hook
 * @description 统合各个子系统 (Renderer, World, Camera, Loop)，提供统一的初始化和控制接口。
 */
type UseEngineOptions = {
  enableRuntimeDebug?: boolean
  enableWorldInteraction?: boolean
  enableCanvasInput?: boolean
  showAvatarInMainView?: boolean
  enableTakeoverUi3dSubmit?: boolean
  initialPose?: EngineCameraPose
  syncDayNightWithTheme?: boolean
}

export type EngineCameraPose = InternalEngineCameraPose
export type EngineCameraTransitionEasing = InternalEngineCameraTransitionEasing
export type EngineCameraTransitionOptions = InternalEngineCameraTransitionOptions

export type EngineTakeoverSurfaceFrame = InternalEngineTakeoverSurfaceFrame

export type EngineTakeoverSurfaceConsumerSnapshot = TakeoverSurfaceConsumerState
export type EngineTakeoverSurfaceRenderAdapterSnapshot = TakeoverSurfaceRenderAdapterState
export type EngineTakeoverSurfaceUi3dStagingSnapshot = TakeoverSurfaceUi3dStagingState
export type EngineTakeoverUi3dSubmissionState = InternalEngineTakeoverUi3dSubmissionState

export type EnginePlayerSkinOverride = {
  skinId: string
  skinUrl: string
  modelType?: CharacterModelType
}

export type UseEngineSetupOptions = {
  initialPose?: EngineCameraPose
  worldBasePath?: string
  regionUrlResolver?: (regionX: number, regionZ: number) => string
  playerSkin?: EnginePlayerSkinOverride
  renderBackend?: RenderSessionBackendKind
}

export type ApplyEngineRuntimeConfigResult = EngineRuntimeConfigApplyResult

type EngineDebugWindow = Window & {
  captureFrameDebug?: () => void
  dumpRigDebug?: () => Record<string, unknown>
}

export function useEngine(options: UseEngineOptions = {}) {
  const syncDayNightWithTheme = options.syncDayNightWithTheme ?? true
  const enableRuntimeDebug = options.enableRuntimeDebug ?? DEBUG_FLAGS.runtime
  const initialWorldInteractionEnabled = options.enableWorldInteraction ?? true
  const initialCanvasInputEnabled = options.enableCanvasInput ?? true
  const showAvatarInMainView = options.showAvatarInMainView ?? true
  const enableTakeoverUi3dSubmit =
    options.enableTakeoverUi3dSubmit ?? DEBUG_FLAGS.takeoverUi3dSubmit
  const artifactRuntimeConfig = GAME_CONFIG.RENDER.ARTIFACT_RUNTIME
  const DEFAULT_CAMERA_TRANSITION_DURATION_MS = 600

  // 1. 基础状态
  const debugStatus = ref('Initializing...')
  const worldInteractionEnabled = ref(initialWorldInteractionEnabled)
  const canvasInputEnabled = ref(initialCanvasInputEnabled)
  const runtimeConfigSnapshot = ref(getEngineRuntimeConfig())
  let sessionLightingConfig: EngineRuntimeLightingConfig = getEngineRuntimeLightingConfig()
  let sessionChunkLoadDistance = runtimeConfigSnapshot.value.chunk.loadDistance

  // 2. 引入子 Hooks
  const { renderer, init: initRenderer, dispose: disposeRenderer } = useRenderer()
  const {
    playerRigRenderState,
    attachInput,
    detachInput,
    fixedUpdate: fixedUpdateCamera,
    syncRenderPose: syncRenderCamera,
    motionAnchorPosition,
    motionAnchorLookTarget,
    renderMotionAnchorPosition,
    renderMotionAnchorLookTarget,
    renderCameraEyePosition,
    renderCameraEyeLookTarget,
    renderCameraViewPosition,
    renderCameraViewLookTarget,
    cameraUp,
    perspectiveMode,
    isFirstPersonView,
    isEyeView,
    setPerspectiveMode,
    cyclePerspectiveMode,
    setMotionBehavior,
    teleportMotionAnchor,
    setPose,
  } = usePlayerRig()
  const {
    realFps,
    performanceSnapshot,
    initGpuTimer,
    beginFrame,
    endFrame,
    dispose: disposeStats,
  } = usePerformanceStats()
  let frameRuntime: ReturnType<typeof useFrameRuntime> | null = null

  function beginChunkWarmup(durationMs?: number) {
    frameRuntime?.beginChunkWarmup(durationMs)
  }

  function requestChunkRefreshNow(
    position: ArrayLike<number> = motionAnchorPosition,
    lookTarget: ArrayLike<number> = motionAnchorLookTarget,
  ) {
    frameRuntime?.requestChunkRefreshNow(position, lookTarget)
  }

  const {
    currentCameraPresetKey,
    isCameraAnimationActive,
    cameraAnimationProgress,
    captureCameraPose,
    fixedUpdate: updateCameraAnimation,
    applyCameraPose,
    applyCameraPerspective,
    animateCameraToPose,
    cancelCameraAnimation,
    applyCameraPreset,
    animateCameraToPreset,
  } = useCameraController({
    defaultTransitionDurationMs: DEFAULT_CAMERA_TRANSITION_DURATION_MS,
    readPose: () => ({
      position: [motionAnchorPosition[0], motionAnchorPosition[1], motionAnchorPosition[2]],
      lookTarget: [motionAnchorLookTarget[0], motionAnchorLookTarget[1], motionAnchorLookTarget[2]],
      perspectiveMode: perspectiveMode(),
    }),
    setPose,
    setPerspectiveMode,
    resolveCameraPreset: presetKey => resolveSceneCameraPreset(presetKey),
    beginChunkWarmup,
    requestChunkRefresh: (position, lookTarget) => requestChunkRefreshNow(position, lookTarget),
  })
  const {
    takeoverSurfaceFrame,
    takeoverSurfaceConsumerSnapshot,
    takeoverSurfaceRenderAdapterSnapshot,
    takeoverSurfaceUi3dStagingSnapshot,
    takeoverUi3dSubmissionState,
    takeoverLiquidGlassEditorRevision,
    syncTakeoverUi3dSubmission,
    syncTakeoverSurfaces,
    refreshTakeoverUi3dStaging,
    clearTakeoverSurfaces,
  } = useTakeover({
    enableTakeoverUi3dSubmit,
    resolveRenderer: () => renderer.value,
  })

  // 3. 实例化核心管理器 (Singletons within the scope of this hook usage)
  const dayNightCycle = new DayNightCycle()
  const {
    dayNightMode,
    fixedTimeHours,
    realtimeOffsetHours,
    applyDayNightMode,
    applyFixedTimeHours,
    applyRealtimeOffsetHours,
  } = useEngineDayNightController({
    dayNightCycle,
    syncWithTheme: syncDayNightWithTheme,
  })
  const csmCalculator = new CSMCalculator()
  const renderQueueBuilder = new RenderQueueBuilder()
  const characterModelScale = GAME_CONFIG.WORLD.PLAYER.MODEL_WORLD_HEIGHT / CHARACTER_LOCAL_HEIGHT
  const firstPersonHandOffset = ref({ ...GAME_CONFIG.WORLD.PLAYER.FIRST_PERSON_HAND_OFFSET })
  const firstPersonHandRotation = ref({ ...GAME_CONFIG.WORLD.PLAYER.FIRST_PERSON_HAND_ROTATION })
  const firstPersonHandAnimation = useFirstPersonHandAnimation()
  let textureManager: TextureManager | null = null
  let renderBackend: IRenderBackend | null = null
  let artifactRenderBridge: ChunkArtifactRenderBridge | null = null
  let characterRenderBridge: CharacterRenderBridgePort | null = null
  let player: Player | null = null
  let firstPersonHand: FirstPersonHand | null = null
  let interactiveCanvas: HTMLCanvasElement | null = null

  function enableInteractiveControls(canvas?: HTMLCanvasElement | null) {
    const nextCanvas = canvas ?? interactiveCanvas
    if (!nextCanvas) {
      return
    }

    interactiveCanvas = nextCanvas

    if (!canvasInputEnabled.value) {
      attachInput(nextCanvas)
      canvasInputEnabled.value = true
    }

    if (!worldInteractionEnabled.value) {
      initializeBlockInteraction(nextCanvas)
      worldInteractionEnabled.value = true
    }
  }

  function disableInteractiveControls() {
    if (canvasInputEnabled.value) {
      detachInput()
      canvasInputEnabled.value = false
    }

    if (worldInteractionEnabled.value) {
      disposeBlockInteraction()
      worldInteractionEnabled.value = false
    }
  }

  function configurePlayerMotionBehavior(config: PlayerRigMotionBehavior | null | undefined) {
    setMotionBehavior(config)
  }

  function applyRuntimeConfig(patch: EngineRuntimeConfigPatch): ApplyEngineRuntimeConfigResult {
    const nextConfig = applyEngineRuntimeConfigPatch(patch)
    runtimeConfigSnapshot.value = nextConfig

    const result = classifyRuntimeConfigPatch(patch)

    if (patch.lighting) {
      const refreshRequired = result.engineRefreshRequested
      const vertexLightingChanged = patch.lighting.enableVertexLighting !== undefined
      const pointLightsChanged = patch.lighting.enablePointLights !== undefined
      const smoothLightingChanged = patch.lighting.enableSmoothLighting !== undefined

      if (
        !refreshRequired &&
        !vertexLightingChanged &&
        (pointLightsChanged || smoothLightingChanged)
      ) {
        sessionLightingConfig = {
          enablePointLights: pointLightsChanged
            ? nextConfig.lighting.enablePointLights
            : sessionLightingConfig.enablePointLights,
          enableVertexLighting: sessionLightingConfig.enableVertexLighting,
          enableSmoothLighting: smoothLightingChanged
            ? sessionLightingConfig.enableVertexLighting && nextConfig.lighting.enableSmoothLighting
            : sessionLightingConfig.enableSmoothLighting,
        }

        renderer.value?.setLightingConfig(sessionLightingConfig)

        if (smoothLightingChanged) {
          chunkManager.setLightingConfig(sessionLightingConfig)
          chunkManager.applyRuntimeMesherOptions()
          chunkManager.remeshLoadedChunks()
          beginChunkWarmup()
          requestChunkRefreshNow()
          result.chunkReloadRequested = true
        }
      }

      if (!refreshRequired && pointLightsChanged && !smoothLightingChanged) {
        sessionLightingConfig = {
          ...sessionLightingConfig,
          enablePointLights: nextConfig.lighting.enablePointLights,
        }
        renderer.value?.setLightingConfig(sessionLightingConfig)
      }
    }

    if (result.engineRefreshRequested) {
      void refreshEngineSession()
    }

    return result
  }

  function applyWorldSourceConfig(setupOptions: UseEngineSetupOptions) {
    const { worldBasePath, regionUrlResolver } = setupOptions
    if (!worldBasePath && !regionUrlResolver) {
      throw new Error('Engine setup requires an explicit worldBasePath or regionUrlResolver')
    }

    const resolvedRegionUrlResolver =
      regionUrlResolver ?? ((rx, rz) => `${worldBasePath}/r.${rx}.${rz}.mca`)

    if (worldBasePath) {
      setBasePath(worldBasePath)
    }
    setRegionUrlResolver(resolvedRegionUrlResolver)
  }

  async function initializeRenderSession(
    canvas: HTMLCanvasElement,
    resource: ResourceDefinition,
    setupOptions: UseEngineSetupOptions,
  ) {
    const selectedRenderBackend = setupOptions.renderBackend ?? 'webgl2'

    await initRenderer(canvas, selectedRenderBackend)
    if (!renderer.value) {
      throw new Error('Failed to init renderer')
    }
    renderer.value.setLightingConfig(sessionLightingConfig)
    syncTakeoverUi3dSubmission()

    const debugWindow = window as EngineDebugWindow
    debugWindow.captureFrameDebug = () => {
      if (renderer.value?.kind !== 'webgl2') {
        console.warn('[useEngine] Frame debug capture is only implemented for WebGL2 sessions')
        return
      }

      renderer.value?.captureDebugSnapshots()
    }

    if (renderer.value.kind === 'webgl2') {
      const gl = renderer.value.canvas.getContext('webgl2')
      if (!gl) {
        throw new Error('Failed to acquire WebGL2 context for WebGL2 render session')
      }

      initGpuTimer(gl)
    }

    const sessionModules = await loadRenderSessionModules(selectedRenderBackend)

    const {
      Player: PlayerClass,
      FirstPersonHand: FirstPersonHandClass,
      resolveCharacterSkinById,
    } = sessionModules

    if (sessionModules.kind === 'webgl2') {
      const {
        TextureManager: TextureManagerClass,
        WebGL2RenderBackend: WebGL2RenderBackendClass,
        ChunkArtifactRenderBridge: ChunkArtifactRenderBridgeClass,
        WebGL2TerrainResidentUploadExecutionBackend:
          WebGL2TerrainResidentUploadExecutionBackendClass,
        TerrainClusterArena: TerrainClusterArenaClass,
        mainThreadBlockStateBridge,
        layouts,
      } = sessionModules

      const gl = renderer.value.canvas.getContext('webgl2')
      if (!gl) {
        throw new Error('WebGL2 render session requested without a WebGL2 canvas context')
      }

      const webgl2RenderBackend = new WebGL2RenderBackendClass(gl)
      renderBackend = webgl2RenderBackend
      const clusterArena = new TerrainClusterArenaClass()
      const terrainExecutionBackend = new WebGL2TerrainResidentUploadExecutionBackendClass(
        gl,
        clusterArena,
      )
      artifactRenderBridge = new ChunkArtifactRenderBridgeClass(
        webgl2RenderBackend,
        clusterArena,
        terrainExecutionBackend,
        (handles: readonly ChunkArtifactPayloadArenaReleaseHandle[]) =>
          chunkManager.releasePayloadArenas(handles),
      )
      webgl2RenderBackend.registerLayout(layouts.TERRAIN_COMPACT_LAYOUT)
      webgl2RenderBackend.registerLayout(layouts.MODEL_STANDARD_LAYOUT)
      webgl2RenderBackend.registerLayout(layouts.MODEL_STANDARD_INSTANCED_LAYOUT)

      const nextCharacterRenderBridge =
        sessionModules.createCharacterRenderBridge(webgl2RenderBackend)
      characterRenderBridge = nextCharacterRenderBridge

      interactiveCanvas = canvas
      if (canvasInputEnabled.value) {
        attachInput(canvas)
      }

      const nextTextureManager = new TextureManagerClass(gl)
      textureManager = nextTextureManager
      debugStatus.value = 'Loading resources...'
      await nextTextureManager.loadTextures(resource)

      const resourceEndpoints = resolveResourceEndpoints(resource)
      const variantLutUrl = resourceEndpoints.variantLutUrl
      console.log('[useEngine] Loading Variant LUT from:', variantLutUrl)
      await nextTextureManager.loadVariantLUT(variantLutUrl)

      await mainThreadBlockStateBridge.init(resource, chunkManager.sabManager.sab)
      chunkManager.setLightingConfig(sessionLightingConfig)
    } else {
      renderBackend = null
      artifactRenderBridge = null
      characterRenderBridge = sessionModules.createCharacterRenderBridge(null)

      interactiveCanvas = canvas
      if (canvasInputEnabled.value) {
        attachInput(canvas)
      }
    }

    const nextCharacterRenderBridge = characterRenderBridge
    if (!nextCharacterRenderBridge) {
      throw new Error('Failed to initialize character render bridge')
    }

    characterRenderBridge = nextCharacterRenderBridge
    const fallbackPlayerSkin = resolveCharacterSkinById(GAME_CONFIG.WORLD.PLAYER.SKIN_ID)
    const playerSkin = setupOptions.playerSkin
      ? setupOptions.playerSkin
      : {
          skinId: fallbackPlayerSkin.id,
          skinUrl: fallbackPlayerSkin.url,
          modelType: fallbackPlayerSkin.modelType ?? ('normal' as const),
        }
    const nextPlayer = new PlayerClass({
      skinId: playerSkin.skinId,
      skinUrl: playerSkin.skinUrl,
      modelType: playerSkin.modelType,
      modelScale: characterModelScale,
      modelMountOffsetY: GAME_CONFIG.WORLD.PLAYER.MODEL_MOUNT_OFFSET_Y,
    })
    player = nextPlayer
    const nextFirstPersonHand = new FirstPersonHandClass({
      skinId: playerSkin.skinId,
      skinUrl: playerSkin.skinUrl,
      modelType: playerSkin.modelType,
      modelScale: characterModelScale,
      cameraLocalOffset: firstPersonHandOffset.value,
      cameraLocalRotation: firstPersonHandRotation.value,
    })
    firstPersonHand = nextFirstPersonHand
    nextPlayer.initializeFromAnchor({
      anchorPosition: motionAnchorPosition,
      anchorLookTarget: motionAnchorLookTarget,
    })
    nextFirstPersonHand.initializeFromCamera({
      cameraPosition: renderCameraEyePosition,
      cameraLookTarget: renderCameraEyeLookTarget,
    })

    await nextCharacterRenderBridge.upsertGroup(
      {
        groupId: getCharacterBodyGroupId(nextPlayer.getDefinition().modelType ?? 'normal'),
        objectId: getCharacterBodyGroupObjectId(nextPlayer.getDefinition().modelType ?? 'normal'),
        definition: nextPlayer.getDefinition(),
        mode: 'instanced',
        modelType: nextPlayer.getDefinition().modelType,
      },
      [nextPlayer.getRenderState()],
    )
    await nextCharacterRenderBridge.upsertGroup(
      {
        groupId: 'player-hand',
        objectId: nextFirstPersonHand.getDefinition().id,
        definition: nextFirstPersonHand.getDefinition(),
        mode: 'single',
        templateVariant: 'right-arm',
        modelType: nextFirstPersonHand.getDefinition().modelType,
      },
      [nextFirstPersonHand.getRenderState()],
    )

    if (selectedRenderBackend === 'webgpu') {
      debugStatus.value = 'Running WebGPU bootstrap shell...'
    }
  }

  function disposeRenderSession() {
    stop()
    cancelCameraAnimation()
    clearTakeoverSurfaces()
    takeoverUi3dSubmissionState.value = {
      enabled: enableTakeoverUi3dSubmit,
      activeCount: 0,
      surfaceKeys: [],
    }

    chunkManager.onWorkerInit = undefined
    chunkManager.onChunkLoaded = undefined
    chunkManager.onChunkUnloaded = undefined

    detachInput()
    disposeStats()
    disposeBlockInteraction()
    interactiveCanvas = null
    disposeRenderer()

    if (textureManager) {
      textureManager.dispose()
      textureManager = null
    }
    TextureLoader.getInstance().clear()

    artifactRenderBridge?.clear()
    artifactRenderBridge = null
    characterRenderBridge?.dispose()
    characterRenderBridge = null
    player?.dispose()
    player = null
    firstPersonHand?.dispose()
    firstPersonHand = null

    renderBackend = null
    disposeFrameRuntimeState()
  }

  // ── 调试函数：立即注册到 window，不依赖 setup ──
  const _dbgV3 = (a: ArrayLike<number>) =>
    `(${(a[0] ?? 0).toFixed(3)}, ${(a[1] ?? 0).toFixed(3)}, ${(a[2] ?? 0).toFixed(3)})`
  const _dbgDeg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(2)}°`
  ;(window as EngineDebugWindow).dumpRigDebug = () => {
    const playerRS = player?.getRenderState() ?? null
    const handRS = firstPersonHand?.getRenderState() ?? null
    const playerModelPos = playerRS?.modelPosition ?? null
    const data = {
      CAMERA_EYE_HEIGHT: GAME_CONFIG.WORLD.PLAYER.CAMERA_EYE_HEIGHT,
      MODEL_MOUNT_OFFSET_Y: GAME_CONFIG.WORLD.PLAYER.MODEL_MOUNT_OFFSET_Y,
      HAND_OFFSET: JSON.stringify(firstPersonHandOffset.value),
      HAND_ROTATION: JSON.stringify(firstPersonHandRotation.value),

      '── RIG CHAIN ──': '',
      perspectiveMode: perspectiveMode(),
      yaw: _dbgDeg(playerRigRenderState.yaw),
      pitch: _dbgDeg(playerRigRenderState.pitch),
      rawMotionAnchor: _dbgV3(motionAnchorPosition),
      rawMotionAnchorTarget: _dbgV3(motionAnchorLookTarget),
      renderMotionAnchor: _dbgV3(renderMotionAnchorPosition),
      renderMotionAnchorTarget: _dbgV3(renderMotionAnchorLookTarget),
      renderCameraEye: _dbgV3(renderCameraEyePosition),
      renderCameraEyeTarget: _dbgV3(renderCameraEyeLookTarget),
      renderCameraView: _dbgV3(renderCameraViewPosition),
      renderCameraViewTarget: _dbgV3(renderCameraViewLookTarget),
      cameraUp: _dbgV3(cameraUp),

      '── PLAYER BODY ──': '',
      'player.modelPos': playerModelPos ? _dbgV3(playerModelPos) : '(not init)',
      'player.yaw': playerRS ? _dbgDeg(playerRS.yawRadians) : '(not init)',
      'player.mainViewVisible': playerRS?.mainViewVisible ?? '(not init)',
      'player.transform[12..14]': playerRS
        ? _dbgV3([playerRS.transform[12], playerRS.transform[13], playerRS.transform[14]])
        : '(not init)',

      '── HAND ──': '',
      'hand.modelPos': handRS ? _dbgV3(handRS.modelPosition) : '(not init)',
      'hand.yaw': handRS ? _dbgDeg(handRS.yawRadians) : '(not init)',
      'hand.mainViewVisible': handRS?.mainViewVisible ?? '(not init)',
      'hand.transform[12..14]': handRS
        ? _dbgV3([handRS.transform[12], handRS.transform[13], handRS.transform[14]])
        : '(not init)',

      '── DELTAS ──': '',
      'eye-anchor(Y)': (renderCameraEyePosition[1] - renderMotionAnchorPosition[1]).toFixed(3),
      'view-eye': _dbgV3([
        renderCameraViewPosition[0] - renderCameraEyePosition[0],
        renderCameraViewPosition[1] - renderCameraEyePosition[1],
        renderCameraViewPosition[2] - renderCameraEyePosition[2],
      ]),
      'hand-eye': handRS
        ? _dbgV3([
            handRS.modelPosition[0] - renderCameraEyePosition[0],
            handRS.modelPosition[1] - renderCameraEyePosition[1],
            handRS.modelPosition[2] - renderCameraEyePosition[2],
          ])
        : '(not init)',
      'body-anchor': playerModelPos
        ? _dbgV3([
            playerModelPos[0] - renderMotionAnchorPosition[0],
            playerModelPos[1] - renderMotionAnchorPosition[1],
            playerModelPos[2] - renderMotionAnchorPosition[2],
          ])
        : '(not init)',
    }
    console.table(data)
    return data
  }
  // 4. 区块加载器
  const chunkLoader = useChunkLoader()
  const {
    chunkManager,
    loadedChunkCount,
    update: updateChunks,
    setBasePath,
    setRegionUrlResolver,
    init: initChunkManager,
    cacheMissCount,
    branchMissCount,
  } = chunkLoader
  const {
    selectedBlockState,
    targetedBlockState,
    targetedBlockPosition,
    lastActionType,
    lastActionSerial,
    initialize: initializeBlockInteraction,
    update: updateBlockInteraction,
    performAction: performBlockInteractionAction,
    dispose: disposeBlockInteraction,
  } = useBlockInteraction(chunkManager)
  const frameRuntimeState = useFrameRuntime({
    chunkManager,
    csmCalculator,
    enableRuntimeDebug,
    artifactRuntimeConfig,
    loadedChunkCount,
    updateChunks,
    fixedUpdateCamera,
    updateCameraAnimation,
    dayNightCycle,
    motionAnchorPosition,
    motionAnchorLookTarget,
    renderCameraViewPosition,
    renderCameraViewLookTarget,
    getSessionChunkLoadDistance: () => sessionChunkLoadDistance,
    getArtifactRenderBridge: () => artifactRenderBridge,
  })
  frameRuntime = frameRuntimeState
  const {
    runtimeTelemetry,
    setWorkerReady,
    bindChunkRuntimeCallbacks,
    advanceFixedSteps,
    processPendingArtifactUploads,
    shouldRefreshCsm,
    commitCsmSnapshot,
    shouldRefreshLighting,
    commitLightSyncSnapshot,
    getPendingArtifactUploadCount,
    disposeFrameRuntimeState,
    rebuildFrameRuntimeState,
  } = frameRuntimeState

  // 5. 帧循环逻辑 (The "Render Loop")
  const onFrame = (dt: number, _time: number) => {
    if (!renderer.value) return

    const frameStart = performance.now()
    beginFrame()

    // --- 渲染更新 (Variable Update) ---
    syncRenderCamera(advanceFixedSteps(dt))
    firstPersonHandAnimation.update(dt / 1000)
    player?.updateFromAnchor({
      dtSeconds: dt / 1000,
      anchorPosition: renderMotionAnchorPosition,
      anchorLookTarget: renderMotionAnchorLookTarget,
    })
    if (player) {
      const playerRenderState = player.getRenderState()
      playerRenderState.mainViewVisible = showAvatarInMainView && !isEyeView()
      playerRenderState.castShadow = true
      playerRenderState.receiveShadow = true
      characterRenderBridge?.syncGroup(
        getCharacterBodyGroupId(player.getDefinition().modelType ?? 'normal'),
        [playerRenderState],
      )
    }

    firstPersonHand?.setAnimationOffsetDelta(firstPersonHandAnimation.animationPose.offsetDelta)
    firstPersonHand?.setAnimationRotationDelta(firstPersonHandAnimation.animationPose.rotationDelta)
    firstPersonHand?.updateFromCamera({
      dtSeconds: dt / 1000,
      cameraPosition: renderCameraEyePosition,
      cameraLookTarget: renderCameraEyeLookTarget,
    })
    if (firstPersonHand) {
      const handRenderState = firstPersonHand.getRenderState()
      handRenderState.mainViewVisible = showAvatarInMainView && isFirstPersonView()
      handRenderState.castShadow = false
      handRenderState.receiveShadow = false
      characterRenderBridge?.syncGroup('player-hand', [handRenderState])
    }

    const selectionOutline = worldInteractionEnabled.value
      ? updateBlockInteraction(renderCameraEyePosition, renderCameraEyeLookTarget)
      : null

    // 纹理动画 (视觉效果)
    if (textureManager) {
      textureManager.update(dt)
    }

    // --- 渲染准备 (Render Prep) ---

    const r = renderer.value
    // 同步全局参数
    r.sunDirection = dayNightCycle.sunDirection
    r.sunColor = dayNightCycle.sunColor
    r.ambientSkyColor.set(dayNightCycle.ambientSkyColor)
    r.ambientGroundColor.set(dayNightCycle.ambientGroundColor)
    r.ambientIntensity = dayNightCycle.ambientIntensity
    r.iblIntensity = dayNightCycle.iblIntensity

    // 同步相机
    const aspect = r.canvas.width / r.canvas.height
    vec3.copy(r.camera.position, renderCameraViewPosition)
    vec3.copy(r.camera.target, renderCameraViewLookTarget)
    vec3.copy(r.camera.up, cameraUp)
    r.camera.update(aspect)

    if (r.kind === 'webgpu') {
      const renderStart = performance.now()

      r.render()

      const renderMs = performance.now() - renderStart

      endFrame(frameStart, dt)

      runtimeTelemetry.updateFrameSnapshot({
        dt,
        renderMotionAnchorPosition,
        renderCameraEyePosition,
        renderCameraViewPosition,
        dayNightTimeHours: dayNightCycle.clockTimeHours,
        renderer: r,
        pendingChunkUploads: 0,
        artifactVisibleBreakdown: '0/0/0',
        csmMs: 0,
        lightsMs: 0,
        meshUploadMs: 0,
        cullMs: 0,
        renderMs,
        player: null,
      })

      return
    }

    // 智能适配：基于当前加载距离计算雾效与 CSM 范围
    const loadRadius = sessionChunkLoadDistance * 16

    // CSM 计算（PC/移动端一致）
    const t0 = performance.now()
    const csmNow = performance.now()
    if (shouldRefreshCsm(csmNow, r.sunDirection)) {
      csmCalculator.setShadowMapResolution(GAME_CONFIG.RENDER.SHADOW.MAP_SIZE)
      csmCalculator.update(r.camera, r.sunDirection, aspect, loadRadius * 0.7) // 阴影覆盖范围略小于加载范围
      commitCsmSnapshot(csmNow, r.sunDirection)
    }
    const t1 = performance.now()

    const uploadWork = processPendingArtifactUploads()
    const t2 = performance.now()

    artifactRenderBridge?.cull(
      r.camera.viewProjectionMatrix,
      r.camera.positionArray,
      r.camera.getReverseZ(),
      loadRadius * loadRadius,
    )

    const lightCfg = {
      ...GAME_CONFIG.RENDER.LIGHTING,
      ENABLE_POINT_LIGHTS: sessionLightingConfig.enablePointLights,
      ENABLE_VERTEX_LIGHTING: sessionLightingConfig.enableVertexLighting,
      ENABLE_SMOOTH_LIGHTING:
        sessionLightingConfig.enableVertexLighting && sessionLightingConfig.enableSmoothLighting,
    }
    const lightingNow = performance.now()
    if (shouldRefreshLighting(lightingNow, uploadWork.processedCount)) {
      const visibleLightChunkKeys = artifactRenderBridge
        ? (() => {
            const expandedKeys = new Set<string>()
            for (const chunkKey of artifactRenderBridge.getVisibleChunkKeys()) {
              expandedKeys.add(chunkKey)
              const [chunkX, chunkZ] = chunkKey.split(',').map(Number)
              for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                  expandedKeys.add(`${chunkX + dx},${chunkZ + dz}`)
                }
              }
            }
            return Array.from(expandedKeys)
          })()
        : null

      const aggregatedLights =
        visibleLightChunkKeys && visibleLightChunkKeys.length > 0
          ? chunkManager.getAggregatedLightsForChunks(visibleLightChunkKeys)
          : chunkManager.getAggregatedLights()
      if (r.lights !== aggregatedLights) {
        r.lights = aggregatedLights
      }

      r.lightManager.update(
        r.lights,
        r.camera.positionArray,
        lightCfg.MAX_POINT_LIGHTS,
        lightCfg.POINT_LIGHT_NEAR_KEEP,
        lightCfg.POINT_LIGHT_FRUSTUM_DISTANCE ?? lightCfg.MAX_POINT_LIGHT_DISTANCE,
        r.camera.viewProjectionMatrix,
        r.camera.getReverseZ(),
      )
      commitLightSyncSnapshot(lightingNow)
    }

    const t3 = performance.now()

    const visibleTerrainObjects = artifactRenderBridge?.getRenderObjects() ?? []
    const visibleRenderObjects = [
      ...visibleTerrainObjects,
      ...(characterRenderBridge?.getRenderObjects() ?? []),
    ]
    const renderQueues = renderQueueBuilder.build(visibleRenderObjects)

    const artifactVisibleOpaqueCount = visibleTerrainObjects.filter(
      object => !object.transparent && object.domain !== 'decal',
    ).length
    const artifactVisibleDecalCount = visibleTerrainObjects.filter(
      object => object.domain === 'decal',
    ).length
    const artifactVisibleTranslucentCount = visibleTerrainObjects.filter(
      object => object.transparent,
    ).length
    const artifactVisibleBreakdown = `${artifactVisibleOpaqueCount}/${artifactVisibleDecalCount}/${artifactVisibleTranslucentCount}`

    // --- 绘制 (Draw) ---
    const t4 = performance.now()

    r.render({
      textureArray: textureManager ? textureManager.getTextureArray() : null,
      normalArray: textureManager ? textureManager.getNormalArray() : null,
      specularArray: textureManager ? textureManager.getSpecularArray() : null,
      variantLUT: textureManager ? textureManager.variantLUT : null,
      lightSpaceMatrices: csmCalculator.getLightSpaceMatrices(),
      cascadeSplits: csmCalculator.getCascadeSplits(),
      fogStart: GAME_CONFIG.RENDER.FOG.START,
      fogEnd: GAME_CONFIG.RENDER.FOG.END,
      fogColor: dayNightCycle.fogColor,
      terrainQueues: renderQueues,
      renderBackend,
      selectionOutline,
    })
    const t5 = performance.now()

    // 帧分解时间
    const csmMs = t1 - t0
    const meshUploadMs = t2 - t1
    const lightsMs = t3 - t2
    const cullMs = t4 - t3
    const renderMs = t5 - t4

    // --- 统计与结束 ---
    endFrame(frameStart, dt)

    // 更新区块加载速率，使用滑动窗口减少抖动
    const playerCalibration = player
      ? (characterRenderBridge?.getCalibrationDebugInfo(
          getCharacterBodyGroupId(player.getDefinition().modelType ?? 'normal'),
        ) ?? null)
      : null

    runtimeTelemetry.updateFrameSnapshot({
      dt,
      renderMotionAnchorPosition,
      renderCameraEyePosition,
      renderCameraViewPosition,
      dayNightTimeHours: dayNightCycle.clockTimeHours,
      renderer: r,
      pendingChunkUploads: getPendingArtifactUploadCount(),
      artifactVisibleBreakdown,
      csmMs,
      lightsMs,
      meshUploadMs,
      cullMs,
      renderMs,
      player:
        playerCalibration == null
          ? null
          : {
              skinId: playerCalibration.skinId,
              yawDegrees: playerCalibration.yawDegrees,
              localBoundsSize: playerCalibration.localBoundsSize,
              modelPosition: playerCalibration.modelPosition,
              partCount: playerCalibration.partCount,
            },
    })
  }

  const { start, stop } = useGameLoop(onFrame)
  const { setup, dispose, terminate, refreshEngineSession } = useSessionLifecycle({
    initialPose: options.initialPose,
    initialCanvasInputEnabled,
    initialWorldInteractionEnabled,
    getRuntimeConfigSnapshot: () => runtimeConfigSnapshot.value,
    subscribeRuntimeConfig: subscribeEngineRuntimeConfig,
    onRuntimeConfigSnapshot: nextConfig => {
      runtimeConfigSnapshot.value = nextConfig
    },
    getRuntimeLightingConfig: getEngineRuntimeLightingConfig,
    setSessionLightingConfig: config => {
      sessionLightingConfig = config
    },
    setSessionChunkLoadDistance: distance => {
      sessionChunkLoadDistance = distance
    },
    captureCameraPose,
    setPose,
    getCanvasInputEnabled: () => canvasInputEnabled.value,
    setCanvasInputEnabled: enabled => {
      canvasInputEnabled.value = enabled
    },
    getWorldInteractionEnabled: () => worldInteractionEnabled.value,
    setWorldInteractionEnabled: enabled => {
      worldInteractionEnabled.value = enabled
    },
    setDebugStatus: status => {
      debugStatus.value = status
    },
    initializeRenderSession: (canvas, resource, setupOptions) =>
      initializeRenderSession(canvas, resource, setupOptions),
    applyWorldSourceConfig,
    bindChunkRuntimeCallbacks,
    initializeChunkManager: resource =>
      initChunkManager(textureManager?.getTextureMap() ?? {}, resource),
    initializeBlockInteraction,
    applyRuntimeMesherOptions: () => {
      chunkManager.applyRuntimeMesherOptions()
    },
    remeshLoadedChunks: () => {
      chunkManager.remeshLoadedChunks()
    },
    beginChunkWarmup,
    requestChunkRefreshNow,
    startLoop: start,
    disposeRenderSession,
    clearChunkManager: () => {
      chunkManager.clear()
    },
    terminateChunkManager: () => {
      chunkManager.terminate()
    },
    setWorkerReady,
    getResourceSignature: getResourceEndpointSignature,
  })

  // 8. 重建场景
  function rebuildScene() {
    console.log('Rebuilding scene...')
    debugStatus.value = 'Rebuilding...'
    cancelCameraAnimation()
    clearTakeoverSurfaces()
    rebuildFrameRuntimeState()
  }

  // rebuildScene 时不再需要重置 preheatDone

  watch(
    firstPersonHandOffset,
    next => {
      firstPersonHand?.setCameraLocalOffset(next)
    },
    { deep: true },
  )

  watch(
    firstPersonHandRotation,
    next => {
      firstPersonHand?.setCameraLocalRotation(next)
    },
    { deep: true },
  )

  let hasObservedSelectedBlockState = false
  watch(selectedBlockState, (next, previous) => {
    if (!hasObservedSelectedBlockState) {
      hasObservedSelectedBlockState = true
      return
    }

    if (next === previous) {
      return
    }

    firstPersonHandAnimation.triggerEquip()
  })

  watch(lastActionSerial, () => {
    const action = lastActionType.value
    if (!action) {
      return
    }

    firstPersonHandAnimation.triggerAction(action)
  })

  watch(takeoverLiquidGlassEditorRevision, () => {
    refreshTakeoverUi3dStaging()
  })

  function resetFirstPersonHandPose() {
    firstPersonHandOffset.value = { ...GAME_CONFIG.WORLD.PLAYER.FIRST_PERSON_HAND_OFFSET }
    firstPersonHandRotation.value = { ...GAME_CONFIG.WORLD.PLAYER.FIRST_PERSON_HAND_ROTATION }
  }

  onUnmounted(() => {
    terminate()
  })

  return {
    // 引擎核心（调试/测试视图可用）
    renderer,
    // 状态
    debugStatus: readonly(debugStatus),
    performanceSnapshot,
    runtimeDebugSnapshot: runtimeTelemetry.runtimeDebugSnapshot,
    realFps,
    playerRigRenderState,
    renderMotionAnchorPosition,
    renderCameraEyePosition,
    renderCameraEyeLookTarget,
    renderCameraViewPosition,
    renderCameraViewLookTarget,
    motionAnchorPosition,
    loadedChunkCount,
    cacheMissCount,
    branchMissCount,
    workerStats: runtimeTelemetry.workerStats,
    storageStats: runtimeTelemetry.storageStats,
    selectedBlockState: readonly(selectedBlockState),
    targetedBlockState: readonly(targetedBlockState),
    targetedBlockPosition: readonly(targetedBlockPosition),
    firstPersonHandOffset,
    firstPersonHandRotation,
    captureCameraPose,
    currentCameraPresetKey: readonly(currentCameraPresetKey),
    runtimeConfigSnapshot: readonly(runtimeConfigSnapshot),
    takeoverSurfaceFrame: readonly(takeoverSurfaceFrame),
    takeoverSurfaceConsumerSnapshot: readonly(takeoverSurfaceConsumerSnapshot),
    takeoverSurfaceRenderAdapterSnapshot: readonly(takeoverSurfaceRenderAdapterSnapshot),
    takeoverSurfaceUi3dStagingSnapshot: readonly(takeoverSurfaceUi3dStagingSnapshot),
    takeoverUi3dSubmissionState: readonly(takeoverUi3dSubmissionState),
    dayNightMode,
    fixedTimeHours,
    realtimeOffsetHours,
    isCameraAnimationActive: readonly(isCameraAnimationActive),
    cameraAnimationProgress: readonly(cameraAnimationProgress),

    // 方法
    setup,
    dispose,
    rebuildScene,
    refreshEngineSession,
    applyCameraPose,
    applyCameraPerspective,
    animateCameraToPose,
    applyCameraPreset,
    animateCameraToPreset,
    cancelCameraAnimation,
    applyDayNightMode,
    applyFixedTimeHours,
    applyRealtimeOffsetHours,
    applyRuntimeConfig,
    performBlockInteractionAction,
    enableInteractiveControls,
    disableInteractiveControls,
    configurePlayerMotionBehavior,
    syncTakeoverSurfaces,
    clearTakeoverSurfaces,
    cyclePerspectiveMode,
    perspectiveMode,
    teleportMotionAnchor,
    resetFirstPersonHandPose,
  }
}
