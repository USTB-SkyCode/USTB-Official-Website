import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { EngineCameraPose } from '@/hooks/useEngine'

const CAMERA_SETTLED_STABLE_DELAY_MS = 140

export function useHostCameraPreset(options: {
  hostReady: ComputedRef<boolean>
  sceneKey: ComputedRef<string | null>
  cameraPresetKey: ComputedRef<string | null>
  isCameraAnimationActive: Readonly<Ref<boolean>> | ComputedRef<boolean>
  resolvePersistedPose: () => EngineCameraPose | null
  applyCameraPreset: (presetKey: string) => void
  animateCameraToPreset: (presetKey: string) => void
  animateCameraToPose: (pose: EngineCameraPose) => void
  setCameraSettled: (settled: boolean) => void
  setCameraSettledStable: (stable: boolean) => void
  setTakeoverReadyAt: (timestamp: string) => void
}) {
  const cameraSettledAt = ref('')
  let cameraSettledStableTimer: ReturnType<typeof setTimeout> | null = null

  const cameraSettled = computed(
    () => options.hostReady.value && !options.isCameraAnimationActive.value,
  )

  function clearCameraSettledStableTimer() {
    if (cameraSettledStableTimer !== null) {
      clearTimeout(cameraSettledStableTimer)
      cameraSettledStableTimer = null
    }
  }

  function resetCameraSettledState() {
    clearCameraSettledStableTimer()
    cameraSettledAt.value = ''
    options.setCameraSettled(false)
    options.setCameraSettledStable(false)
    options.setTakeoverReadyAt('')
  }

  // --- Camera preset watcher ---
  watch(
    [options.hostReady, options.sceneKey, options.cameraPresetKey],
    ([ready, nextSceneKey, nextPresetKey], [wasReady, previousSceneKey, previousPresetKey]) => {
      if (!ready) return

      const persistedExplorePose = options.resolvePersistedPose()

      if (persistedExplorePose) {
        if (!wasReady) return
        if (nextSceneKey === previousSceneKey && nextPresetKey === previousPresetKey) return
        options.animateCameraToPose(persistedExplorePose)
        return
      }

      if (!nextSceneKey || !nextPresetKey) return

      if (!wasReady) {
        options.applyCameraPreset(nextPresetKey)
        return
      }

      if (nextSceneKey === previousSceneKey && nextPresetKey === previousPresetKey) return

      options.animateCameraToPreset(nextPresetKey)
    },
    { flush: 'post' },
  )

  // --- Camera settled stable ---
  watch(
    cameraSettled,
    settled => {
      clearCameraSettledStableTimer()
      options.setCameraSettled(settled)

      if (!settled) {
        cameraSettledAt.value = ''
        options.setCameraSettledStable(false)
        return
      }

      cameraSettledStableTimer = setTimeout(() => {
        cameraSettledAt.value = new Date().toISOString()
        options.setCameraSettledStable(true)
        options.setTakeoverReadyAt(cameraSettledAt.value)
        cameraSettledStableTimer = null
      }, CAMERA_SETTLED_STABLE_DELAY_MS)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    clearCameraSettledStableTimer()
  })

  return {
    cameraSettled,
    cameraSettledAt,
    resetCameraSettledState,
  }
}
