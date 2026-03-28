import { computed, onUnmounted, watch, type ComputedRef } from 'vue'
import { useEnginePersistenceStore } from '@/stores/enginePersistence'
import { resolveSceneCameraPreset } from '@/config/scene'

export function useHostExplorePosePersistence(options: {
  routeId: ComputedRef<string>
  hostReady: ComputedRef<boolean>
  homeActiveTab: ComputedRef<string>
  cameraPresetKey: ComputedRef<string | null>
  captureCameraPose: () => {
    position: [number, number, number]
    lookTarget: [number, number, number]
  }
}) {
  const enginePersistenceStore = useEnginePersistenceStore()
  let timer: ReturnType<typeof setInterval> | null = null

  const active = computed(
    () => options.routeId.value === 'home' && options.homeActiveTab.value === 'explore',
  )

  function clearTimer() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function resolvePersistedPose() {
    if (!active.value) return null
    const persisted = enginePersistenceStore.homeExplorePose
    if (!persisted) return null
    const defaultPose = resolveSceneCameraPreset(options.cameraPresetKey.value)
    return {
      position: [...persisted.position] as [number, number, number],
      lookTarget: [...persisted.lookTarget] as [number, number, number],
      perspectiveMode: defaultPose?.perspectiveMode ?? 'first-person',
    }
  }

  function persistSnapshot() {
    if (!options.hostReady.value || !active.value) return
    const pose = options.captureCameraPose()
    enginePersistenceStore.setHomeExplorePose({
      position: [...pose.position] as [number, number, number],
      lookTarget: [...pose.lookTarget] as [number, number, number],
    })
  }

  function start() {
    clearTimer()
    if (!options.hostReady.value || !active.value) return
    timer = setInterval(() => persistSnapshot(), 1000)
  }

  function stop(saveSnapshot: boolean) {
    if (saveSnapshot) persistSnapshot()
    clearTimer()
  }

  // Tab change
  watch(
    () => options.homeActiveTab.value,
    (nextTab, previousTab) => {
      if (options.routeId.value !== 'home') return
      if (previousTab === 'explore' && nextTab !== 'explore') {
        stop(true)
        return
      }
      if (nextTab === 'explore' && previousTab !== 'explore') {
        start()
      }
    },
    { flush: 'sync' },
  )

  // Route / host ready change
  watch(
    [options.hostReady, options.routeId],
    ([ready, nextRouteId], [previousReady, previousRouteId]) => {
      const leftHomeExplore =
        previousReady &&
        previousRouteId === 'home' &&
        nextRouteId !== 'home' &&
        options.homeActiveTab.value === 'explore'
      const hostStoppedWhileExploring =
        previousReady &&
        !ready &&
        previousRouteId === 'home' &&
        options.homeActiveTab.value === 'explore'

      if (leftHomeExplore || hostStoppedWhileExploring) {
        stop(true)
        return
      }

      if (ready && nextRouteId === 'home' && options.homeActiveTab.value === 'explore') {
        start()
        return
      }

      stop(false)
    },
    { immediate: true },
  )

  onUnmounted(() => clearTimer())

  return { resolvePersistedPose }
}
