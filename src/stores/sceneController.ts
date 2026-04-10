import { defineStore } from 'pinia'
import { createSceneExploreState } from '@/stores/scene/exploreState'
import { createSceneRuntimeState } from '@/stores/scene/runtimeState'

export const useSceneControllerStore = defineStore('sceneController', () => {
  const exploreState = createSceneExploreState()
  const runtimeState = createSceneRuntimeState()

  function setTakeoverEnabled(enabled: boolean) {
    runtimeState.takeoverEnabled.value = enabled
    if (enabled) {
      runtimeState.setTakeoverBlockedReason(null)
      return
    }

    runtimeState.setTakeoverBlockedReason(null)
    exploreState.resetHomeExploreUi(true)
    runtimeState.resetTakeoverRuntimeState()
  }

  function fallbackToDom(reason: string) {
    runtimeState.takeoverEnabled.value = false
    runtimeState.setTakeoverBlockedReason(reason)
    exploreState.resetHomeExploreUi(true)
    runtimeState.resetTakeoverRuntimeState()
  }

  return {
    homeActiveTab: exploreState.homeActiveTab,
    loginPlayerPosition: runtimeState.loginPlayerPosition,
    homeExploreInteractionActive: exploreState.homeExploreInteractionActive,
    homeExploreUiReveal: exploreState.homeExploreUiReveal,
    homeExploreEngineSettingsOpen: exploreState.homeExploreEngineSettingsOpen,
    engineTimeManualOverrideActive: runtimeState.engineTimeManualOverrideActive,
    engineFixedTimeHours: runtimeState.engineFixedTimeHours,
    engineRealtimeOffsetHours: runtimeState.engineRealtimeOffsetHours,
    takeoverEnabled: runtimeState.takeoverEnabled,
    takeoverBlockedReason: runtimeState.takeoverBlockedReason,
    hostRuntimeReady: runtimeState.hostRuntimeReady,
    cameraSettled: runtimeState.cameraSettled,
    cameraSettledStable: runtimeState.cameraSettledStable,
    takeoverReadyAt: runtimeState.takeoverReadyAt,
    homeExploreMobileBlockAction:
      exploreState.homeExploreMobileBlockAction as typeof exploreState.homeExploreMobileBlockAction,
    homeExploreMobileBlockActionSerial: exploreState.homeExploreMobileBlockActionSerial,
    takeoverReady: runtimeState.takeoverReady,
    setHomeActiveTab: exploreState.setHomeActiveTab,
    setLoginPlayerPosition: runtimeState.setLoginPlayerPosition,
    setHomeExploreInteractionActive: exploreState.setHomeExploreInteractionActive,
    setHomeExploreUiReveal: exploreState.setHomeExploreUiReveal,
    setHomeExploreEngineSettingsOpen: exploreState.setHomeExploreEngineSettingsOpen,
    requestHomeExploreMobileBlockAction: exploreState.requestHomeExploreMobileBlockAction,
    setEngineTimeManualOverrideActive: runtimeState.setEngineTimeManualOverrideActive,
    setEngineFixedTimeHours: runtimeState.setEngineFixedTimeHours,
    setEngineRealtimeOffsetHours: runtimeState.setEngineRealtimeOffsetHours,
    resetEngineTimeOverrides: runtimeState.resetEngineTimeOverrides,
    setTakeoverEnabled,
    fallbackToDom,
    setTakeoverBlockedReason: runtimeState.setTakeoverBlockedReason,
    setHostRuntimeReady: runtimeState.setHostRuntimeReady,
    setCameraSettled: runtimeState.setCameraSettled,
    setCameraSettledStable: runtimeState.setCameraSettledStable,
    setTakeoverReadyAt: runtimeState.setTakeoverReadyAt,
  }
})
