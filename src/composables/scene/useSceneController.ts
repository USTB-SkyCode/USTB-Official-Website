import { computed } from 'vue'
import {
  resolveRouteCameraPresetKey,
  resolveRouteSurfaceActivationPlan,
  resolveRouteVisualPageFrameMode,
} from '@/config/routeVisual'
import type { FrameMode } from '@/composables/frameMode'
import type { SurfaceActivationPlan } from '@/composables/surfaceActivation'
import { useRouteVisualPlan } from '@/composables/routeVisualPlan'
import { useEnginePersistenceStore } from '@/stores/enginePersistence'
import { useSceneControllerStore } from '@/stores/sceneController'

export function useSceneController() {
  const store = useSceneControllerStore()
  const enginePersistenceStore = useEnginePersistenceStore()
  const { routeProfile, routeId, sceneKey, visualMode, shouldReservePersistentHost } =
    useRouteVisualPlan()
  const displayModePreference = computed(() => enginePersistenceStore.displayModePreference)
  const canUseEngineFrame = computed(
    () =>
      store.takeoverEnabled &&
      (displayModePreference.value === 'engine' ||
        (routeId.value === 'home' && store.homeActiveTab === 'explore')) &&
      store.hostRuntimeReady &&
      visualMode.value === 'takeover-ready',
  )

  const shouldShowEngineCanvas = computed(() => {
    if (!store.takeoverEnabled || !shouldReservePersistentHost.value) {
      return false
    }

    if (displayModePreference.value === 'engine') {
      return true
    }

    return routeId.value === 'home' && store.homeActiveTab === 'explore'
  })

  const pageFrameMode = computed<FrameMode>(() =>
    resolveRouteVisualPageFrameMode(routeProfile.value, canUseEngineFrame.value),
  )

  const surfaceActivationPlan = computed<SurfaceActivationPlan>(() =>
    resolveRouteSurfaceActivationPlan(routeProfile.value, canUseEngineFrame.value),
  )

  const cameraPresetKey = computed<string | null>(() =>
    resolveRouteCameraPresetKey(routeId.value, store.homeActiveTab),
  )

  return {
    routeId,
    sceneKey,
    visualMode,
    shouldReservePersistentHost,
    pageFrameMode,
    surfaceActivationPlan,
    cameraPresetKey,
    displayModePreference,
    hasRememberedDisplayMode: computed(() => enginePersistenceStore.hasRememberedDisplayMode),
    shouldShowEngineCanvas,
    loginPlayerPosition: computed(() => store.loginPlayerPosition),
    homeActiveTab: computed(() => store.homeActiveTab),
    homeExploreInteractionActive: computed(() => store.homeExploreInteractionActive),
    homeExploreUiReveal: computed(() => store.homeExploreUiReveal),
    homeExploreEngineSettingsOpen: computed(() => store.homeExploreEngineSettingsOpen),
    engineTimeManualOverrideActive: computed(() => store.engineTimeManualOverrideActive),
    engineFixedTimeHours: computed(() => store.engineFixedTimeHours),
    engineRealtimeOffsetHours: computed(() => store.engineRealtimeOffsetHours),
    takeoverEnabled: computed(() => store.takeoverEnabled),
    takeoverBlockedReason: computed(() => store.takeoverBlockedReason),
    hostRuntimeReady: computed(() => store.hostRuntimeReady),
    cameraSettled: computed(() => store.cameraSettled),
    cameraSettledStable: computed(() => store.cameraSettledStable),
    takeoverReadyAt: computed(() => store.takeoverReadyAt),
    homeExploreMobileBlockAction: computed(() => store.homeExploreMobileBlockAction),
    homeExploreMobileBlockActionSerial: computed(() => store.homeExploreMobileBlockActionSerial),
    takeoverReady: computed(() => store.takeoverReady),
    setHomeActiveTab: store.setHomeActiveTab,
    setLoginPlayerPosition: store.setLoginPlayerPosition,
    setHomeExploreInteractionActive: store.setHomeExploreInteractionActive,
    setHomeExploreUiReveal: store.setHomeExploreUiReveal,
    setHomeExploreEngineSettingsOpen: store.setHomeExploreEngineSettingsOpen,
    requestHomeExploreMobileBlockAction: store.requestHomeExploreMobileBlockAction,
    setEngineTimeManualOverrideActive: store.setEngineTimeManualOverrideActive,
    setEngineFixedTimeHours: store.setEngineFixedTimeHours,
    setEngineRealtimeOffsetHours: store.setEngineRealtimeOffsetHours,
    resetEngineTimeOverrides: store.resetEngineTimeOverrides,
    setDisplayModePreference: enginePersistenceStore.setDisplayModePreference,
    setHasRememberedDisplayMode: enginePersistenceStore.setHasRememberedDisplayMode,
    setTakeoverEnabled: store.setTakeoverEnabled,
    fallbackToDom: store.fallbackToDom,
    setTakeoverBlockedReason: store.setTakeoverBlockedReason,
    setHostRuntimeReady: store.setHostRuntimeReady,
    setCameraSettled: store.setCameraSettled,
    setCameraSettledStable: store.setCameraSettledStable,
    setTakeoverReadyAt: store.setTakeoverReadyAt,
  }
}
