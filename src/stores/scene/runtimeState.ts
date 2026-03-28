import { computed, ref } from 'vue'

export function createSceneRuntimeState() {
  const loginPlayerPosition = ref<readonly [number, number, number] | null>(null)
  const engineTimeManualOverrideActive = ref(false)
  const engineFixedTimeHours = ref(20)
  const engineRealtimeOffsetHours = ref(0)
  const takeoverEnabled = ref(true)
  const takeoverBlockedReason = ref<string | null>(null)
  const hostRuntimeReady = ref(false)
  const cameraSettled = ref(false)
  const cameraSettledStable = ref(false)
  const takeoverReadyAt = ref('')

  const takeoverReady = computed(
    () =>
      hostRuntimeReady.value &&
      cameraSettled.value &&
      cameraSettledStable.value &&
      takeoverReadyAt.value.length > 0,
  )

  function resetTakeoverRuntimeState() {
    loginPlayerPosition.value = null
    hostRuntimeReady.value = false
    cameraSettled.value = false
    cameraSettledStable.value = false
    takeoverReadyAt.value = ''
  }

  function setEngineTimeManualOverrideActive(active: boolean) {
    engineTimeManualOverrideActive.value = active
  }

  function setEngineFixedTimeHours(hours: number) {
    engineFixedTimeHours.value = Math.min(24, Math.max(0, hours))
  }

  function setEngineRealtimeOffsetHours(hours: number) {
    engineRealtimeOffsetHours.value = hours
  }

  function resetEngineTimeOverrides() {
    engineTimeManualOverrideActive.value = false
    engineRealtimeOffsetHours.value = 0
  }

  function setTakeoverBlockedReason(reason: string | null) {
    takeoverBlockedReason.value = reason
  }

  function setHostRuntimeReady(ready: boolean) {
    hostRuntimeReady.value = ready
  }

  function setCameraSettled(settled: boolean) {
    cameraSettled.value = settled
  }

  function setCameraSettledStable(stable: boolean) {
    cameraSettledStable.value = stable
  }

  function setTakeoverReadyAt(timestamp: string) {
    takeoverReadyAt.value = timestamp
  }

  function setLoginPlayerPosition(position: readonly [number, number, number] | null) {
    loginPlayerPosition.value = position
  }

  return {
    loginPlayerPosition,
    engineTimeManualOverrideActive,
    engineFixedTimeHours,
    engineRealtimeOffsetHours,
    takeoverEnabled,
    takeoverBlockedReason,
    hostRuntimeReady,
    cameraSettled,
    cameraSettledStable,
    takeoverReadyAt,
    takeoverReady,
    resetTakeoverRuntimeState,
    setEngineTimeManualOverrideActive,
    setEngineFixedTimeHours,
    setEngineRealtimeOffsetHours,
    resetEngineTimeOverrides,
    setTakeoverBlockedReason,
    setHostRuntimeReady,
    setCameraSettled,
    setCameraSettledStable,
    setTakeoverReadyAt,
    setLoginPlayerPosition,
  }
}
