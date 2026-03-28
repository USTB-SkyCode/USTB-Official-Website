import { computed, ref, watch } from 'vue'
import { DEBUG_FLAGS } from '@/config/debug'
import { resolveSceneCameraPreset } from '@/config/scene'
import { useHostBootLifecycle, type HostBootReason } from '@/composables/engineHost/bootLifecycle'
import { useHostCameraPreset } from '@/composables/engineHost/cameraPreset'
import { useHostDayNightSync } from '@/composables/engineHost/dayNightSync'
import { useHostEditorHighlight } from '@/composables/engineHost/editorHighlight'
import { useHostExploreInteraction } from '@/composables/engineHost/exploreInteraction'
import { useHostExplorePosePersistence } from '@/composables/engineHost/explorePosePersistence'
import { useHostLoginPositionSync } from '@/composables/engineHost/loginPositionSync'
import { useHostPlayerSkin } from '@/composables/engineHost/playerSkin'
import { useHostSurfaceSampling } from '@/composables/engineHost/surfaceSampling'
import { useSceneController } from '@/composables/scene/useSceneController'
import { useEngine } from '@/hooks/useEngine'
import { useResourceStore } from '@/stores/resource'

export type PersistentEngineHostStatus = 'idle' | 'booting' | 'ready' | 'error'

export function usePersistentEngineHostController() {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const resourceStore = useResourceStore()
  const {
    routeId,
    sceneKey,
    visualMode,
    shouldReservePersistentHost,
    pageFrameMode,
    cameraPresetKey,
    homeActiveTab,
    homeExploreInteractionActive,
    homeExploreUiReveal: sceneHomeExploreUiReveal,
    homeExploreEngineSettingsOpen,
    homeExploreMobileBlockAction,
    homeExploreMobileBlockActionSerial,
    engineTimeManualOverrideActive,
    engineFixedTimeHours,
    cameraSettledStable,
    takeoverReady,
    takeoverReadyAt,
    setHomeExploreEngineSettingsOpen,
    setHomeExploreInteractionActive,
    setHomeExploreUiReveal,
    fallbackToDom,
    setHostRuntimeReady,
    setCameraSettled,
    setCameraSettledStable,
    setTakeoverReadyAt,
    setLoginPlayerPosition,
  } = useSceneController()

  const {
    setup,
    dispose,
    refreshEngineSession,
    debugStatus,
    loadedChunkCount,
    captureCameraPose,
    applyCameraPreset,
    animateCameraToPose,
    applyDayNightMode,
    applyFixedTimeHours,
    applyRealtimeOffsetHours,
    applyRuntimeConfig,
    performBlockInteractionAction,
    animateCameraToPreset,
    isCameraAnimationActive,
    cyclePerspectiveMode,
    enableInteractiveControls,
    disableInteractiveControls,
    configurePlayerMotionBehavior,
    syncTakeoverSurfaces,
    clearTakeoverSurfaces,
    takeoverSurfaceRenderAdapterSnapshot,
    takeoverSurfaceUi3dStagingSnapshot,
    takeoverUi3dSubmissionState,
    motionAnchorPosition,
  } = useEngine({
    enableRuntimeDebug: false,
    enableWorldInteraction: false,
    enableCanvasInput: false,
    enableTakeoverUi3dSubmit: true,
    showAvatarInMainView: true,
    syncDayNightWithTheme: false,
  })

  const engineStatus = ref<PersistentEngineHostStatus>('idle')
  const hostBootReason = ref<HostBootReason>('boot-scene')
  const hostReady = computed(() => engineStatus.value === 'ready')

  const { currentPlayerSkinOverride } = useHostPlayerSkin({
    routeId,
    shouldReservePersistentHost,
    engineStatus,
    hostBootReason,
    setHostRuntimeReady,
    refreshEngineSession,
  })

  const { resolvePersistedPose } = useHostExplorePosePersistence({
    routeId,
    hostReady,
    homeActiveTab,
    cameraPresetKey,
    captureCameraPose,
  })

  useHostBootLifecycle({
    state: {
      engineStatus,
      hostBootReason,
    },
    scene: {
      canvasRef,
      shouldReservePersistentHost,
      sceneKey,
      cameraPresetKey,
      currentPlayerSkinOverride,
      resolvePersistedPose,
    },
    resource: {
      activeResource: computed(() => resourceStore.activeResource),
      activeResourceKey: computed(() => resourceStore.activeKey),
    },
    engine: {
      setup,
      dispose,
      refreshEngineSession,
      applyCameraPreset,
      configurePlayerMotionBehavior,
      applyRuntimeConfig,
      clearTakeoverSurfaces,
    },
    host: {
      fallbackToDom,
      setHostRuntimeReady,
    },
  })

  const { cameraSettled, cameraSettledAt } = useHostCameraPreset({
    hostReady,
    sceneKey,
    cameraPresetKey,
    isCameraAnimationActive,
    resolvePersistedPose,
    applyCameraPreset,
    animateCameraToPreset,
    animateCameraToPose,
    setCameraSettled,
    setCameraSettledStable,
    setTakeoverReadyAt,
  })

  const { surfaceCount, consumableSurfaceCount } = useHostSurfaceSampling({
    shouldReservePersistentHost,
    hostReady,
    routeId,
    sceneKey,
    cameraPresetKey,
    pageFrameMode,
    syncTakeoverSurfaces,
    clearTakeoverSurfaces,
  })

  const {
    exploreInteractionActive,
    exploreSettingsVisible,
    loginInteractionActive,
    homeExploreUiReveal: hostExploreUiReveal,
  } = useHostExploreInteraction({
    canvasRef,
    hostReady,
    shouldReservePersistentHost,
    routeId,
    homeActiveTab,
    homeExploreInteractionActive,
    homeExploreUiReveal: sceneHomeExploreUiReveal,
    homeExploreEngineSettingsOpen,
    homeExploreMobileBlockAction,
    homeExploreMobileBlockActionSerial,
    setHomeExploreInteractionActive,
    setHomeExploreUiReveal,
    setHomeExploreEngineSettingsOpen,
    enableInteractiveControls,
    disableInteractiveControls,
    cyclePerspectiveMode,
    performBlockInteractionAction,
  })

  useHostDayNightSync({
    engineTimeManualOverrideActive,
    engineFixedTimeHours,
    applyDayNightMode,
    applyFixedTimeHours,
    applyRealtimeOffsetHours,
  })

  useHostLoginPositionSync({
    routeId,
    hostReady,
    motionAnchorPosition,
    setLoginPlayerPosition,
  })

  useHostEditorHighlight({
    shouldReservePersistentHost,
    routeId,
    sceneKey,
  })

  const showInspector = computed(() => DEBUG_FLAGS.takeoverInspector)
  const resourceActiveKey = computed(() => resourceStore.activeKey)
  const activeResourceLabel = computed(() => resourceStore.activeResource.label)
  const hostCanvasVisible = computed(
    () =>
      shouldReservePersistentHost.value &&
      (engineStatus.value === 'ready' || engineStatus.value === 'booting'),
  )
  const showBootOverlay = computed(
    () => hostCanvasVisible.value && engineStatus.value === 'booting' && routeId.value !== 'login',
  )
  const bootOverlayKicker = computed(() => {
    switch (hostBootReason.value) {
      case 'switch-resource':
        return 'Resource Reload'
      case 'refresh-runtime-config':
        return 'Engine Refresh'
      case 'refresh-player-skin':
        return 'Avatar Refresh'
      default:
        return 'Scene Loading'
    }
  })
  const bootOverlayTitle = computed(() => {
    switch (hostBootReason.value) {
      case 'switch-resource':
        return `正在切换材质包: ${activeResourceLabel.value}`
      case 'refresh-runtime-config':
        return '正在应用引擎设置变更'
      case 'refresh-player-skin':
        return '正在刷新角色外观'
      default:
        return '正在启动场景引擎'
    }
  })
  const bootOverlayCopy = computed(() => {
    switch (hostBootReason.value) {
      case 'switch-resource':
        return '资源纹理、模型索引和地形渲染会话正在重建。移动端首次切换 128 材质包会明显更慢，这是预期中的重载阶段。'
      case 'refresh-runtime-config':
        return '当前这项设置需要刷新当前引擎 session 后生效。页面不会整页刷新，完成后会自动回到场景。'
      case 'refresh-player-skin':
        return '角色皮肤资源正在重新装入并重建渲染对象。'
      default:
        return '正在准备场景资源、相机和交互状态。'
    }
  })

  watch(
    [sceneKey, cameraPresetKey],
    ([nextSceneKey, nextPresetKey]) => {
      if (!nextSceneKey) {
        configurePlayerMotionBehavior(null)
        return
      }
      const resolvedPreset = resolveSceneCameraPreset(nextPresetKey)
      configurePlayerMotionBehavior(resolvedPreset?.motionBehavior ?? null)
    },
    { immediate: true },
  )

  return {
    canvasRef,
    routeId,
    sceneKey,
    visualMode,
    shouldReservePersistentHost,
    pageFrameMode,
    cameraPresetKey,
    takeoverReady,
    takeoverReadyAt,
    cameraSettled,
    cameraSettledStable,
    cameraSettledAt,
    hostReady,
    engineStatus,
    resourceActiveKey,
    setHomeExploreEngineSettingsOpen,
    exploreInteractionActive,
    loginInteractionActive,
    exploreSettingsVisible,
    homeExploreUiReveal: hostExploreUiReveal,
    showInspector,
    debugStatus,
    loadedChunkCount,
    surfaceCount,
    consumableSurfaceCount,
    takeoverSurfaceRenderAdapterSnapshot,
    takeoverSurfaceUi3dStagingSnapshot,
    takeoverUi3dSubmissionState,
    showBootOverlay,
    bootOverlayKicker,
    bootOverlayTitle,
    bootOverlayCopy,
    hostCanvasVisible,
  }
}
