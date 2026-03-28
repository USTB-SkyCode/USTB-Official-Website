import { ref } from 'vue'
import type { PlayerPerspectiveMode } from '@/engine/world/game/PlayerRig'

export type EngineCameraPose = {
  position: [number, number, number]
  lookTarget: [number, number, number]
  perspectiveMode?: PlayerPerspectiveMode
}

export type EngineCameraTransitionEasing = 'linear' | 'ease-in-out-sine' | 'ease-out-cubic'

export type EngineCameraTransitionOptions = {
  durationMs?: number
  easing?: EngineCameraTransitionEasing
}

type CameraAnimationState = {
  active: boolean
  elapsedMs: number
  durationMs: number
  easing: EngineCameraTransitionEasing
  startPose: EngineCameraPose
  targetPose: EngineCameraPose
}

type UseCameraControllerOptions = {
  defaultTransitionDurationMs: number
  readPose: () => EngineCameraPose
  setPose: (pose: EngineCameraPose) => void
  setPerspectiveMode: (mode: PlayerPerspectiveMode) => void
  resolveCameraPreset: (presetKey: string) => EngineCameraPose | null
  beginChunkWarmup: (durationMs?: number) => void
  requestChunkRefresh: (position: ArrayLike<number>, lookTarget: ArrayLike<number>) => void
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function applyCameraTransitionEasing(progress: number, easing: EngineCameraTransitionEasing) {
  const t = clamp01(progress)

  if (easing === 'ease-in-out-sine') {
    return -(Math.cos(Math.PI * t) - 1) * 0.5
  }

  if (easing === 'ease-out-cubic') {
    const inverse = 1 - t
    return 1 - inverse * inverse * inverse
  }

  return t
}

function writePose(target: EngineCameraPose, source: EngineCameraPose) {
  target.position[0] = source.position[0]
  target.position[1] = source.position[1]
  target.position[2] = source.position[2]
  target.lookTarget[0] = source.lookTarget[0]
  target.lookTarget[1] = source.lookTarget[1]
  target.lookTarget[2] = source.lookTarget[2]
  target.perspectiveMode = source.perspectiveMode
}

export function useCameraController(options: UseCameraControllerOptions) {
  const isCameraAnimationActive = ref(false)
  const cameraAnimationProgress = ref(1)
  const currentCameraPresetKey = ref<string | null>(null)

  const cameraAnimationState: CameraAnimationState = {
    active: false,
    elapsedMs: 0,
    durationMs: 0,
    easing: 'ease-in-out-sine',
    startPose: {
      position: [0, 0, 0],
      lookTarget: [0, 0, -1],
      perspectiveMode: undefined,
    },
    targetPose: {
      position: [0, 0, 0],
      lookTarget: [0, 0, -1],
      perspectiveMode: undefined,
    },
  }

  function captureCameraPose(): EngineCameraPose {
    return options.readPose()
  }

  function fixedUpdate(dtMs: number) {
    if (!cameraAnimationState.active) {
      return
    }

    cameraAnimationState.elapsedMs += dtMs
    const progress =
      cameraAnimationState.durationMs <= 0
        ? 1
        : clamp01(cameraAnimationState.elapsedMs / cameraAnimationState.durationMs)
    const easedProgress = applyCameraTransitionEasing(progress, cameraAnimationState.easing)

    options.setPose({
      position: [
        cameraAnimationState.startPose.position[0] +
          (cameraAnimationState.targetPose.position[0] -
            cameraAnimationState.startPose.position[0]) *
            easedProgress,
        cameraAnimationState.startPose.position[1] +
          (cameraAnimationState.targetPose.position[1] -
            cameraAnimationState.startPose.position[1]) *
            easedProgress,
        cameraAnimationState.startPose.position[2] +
          (cameraAnimationState.targetPose.position[2] -
            cameraAnimationState.startPose.position[2]) *
            easedProgress,
      ],
      lookTarget: [
        cameraAnimationState.startPose.lookTarget[0] +
          (cameraAnimationState.targetPose.lookTarget[0] -
            cameraAnimationState.startPose.lookTarget[0]) *
            easedProgress,
        cameraAnimationState.startPose.lookTarget[1] +
          (cameraAnimationState.targetPose.lookTarget[1] -
            cameraAnimationState.startPose.lookTarget[1]) *
            easedProgress,
        cameraAnimationState.startPose.lookTarget[2] +
          (cameraAnimationState.targetPose.lookTarget[2] -
            cameraAnimationState.startPose.lookTarget[2]) *
            easedProgress,
      ],
      perspectiveMode:
        cameraAnimationState.targetPose.perspectiveMode ??
        cameraAnimationState.startPose.perspectiveMode,
    })

    cameraAnimationProgress.value = progress

    if (progress >= 1) {
      options.setPose(cameraAnimationState.targetPose)
      cameraAnimationState.active = false
      isCameraAnimationActive.value = false
      cameraAnimationProgress.value = 1
    }
  }

  function applyCameraPose(pose: EngineCameraPose) {
    cameraAnimationState.active = false
    isCameraAnimationActive.value = false
    cameraAnimationProgress.value = 1
    options.setPose(pose)
    options.beginChunkWarmup(1800)
    options.requestChunkRefresh(pose.position, pose.lookTarget)
  }

  function applyCameraPerspective(mode: PlayerPerspectiveMode) {
    options.setPerspectiveMode(mode)
  }

  function resolveCameraPresetOrWarn(presetKey: string) {
    const presetPose = options.resolveCameraPreset(presetKey)
    if (!presetPose) {
      console.warn('[useEngine] Unknown camera preset request:', { presetKey })
      return null
    }

    return presetPose
  }

  function animateCameraToPose(
    pose: EngineCameraPose,
    transitionOptions: EngineCameraTransitionOptions = {},
  ) {
    const durationMs = Math.max(
      0,
      transitionOptions.durationMs ?? options.defaultTransitionDurationMs,
    )
    const easing = transitionOptions.easing ?? 'ease-in-out-sine'
    const currentPose = captureCameraPose()
    const targetPose: EngineCameraPose = {
      position: [...pose.position] as [number, number, number],
      lookTarget: [...pose.lookTarget] as [number, number, number],
      perspectiveMode: pose.perspectiveMode ?? currentPose.perspectiveMode,
    }

    options.beginChunkWarmup(1800)
    options.requestChunkRefresh(targetPose.position, targetPose.lookTarget)

    if (durationMs === 0) {
      applyCameraPose(targetPose)
      return
    }

    writePose(cameraAnimationState.startPose, currentPose)
    writePose(cameraAnimationState.targetPose, targetPose)
    cameraAnimationState.durationMs = durationMs
    cameraAnimationState.elapsedMs = 0
    cameraAnimationState.easing = easing
    cameraAnimationState.active = true
    isCameraAnimationActive.value = true
    cameraAnimationProgress.value = 0
  }

  function cancelCameraAnimation() {
    if (!cameraAnimationState.active) {
      return
    }

    cameraAnimationState.active = false
    isCameraAnimationActive.value = false
    cameraAnimationProgress.value = 1
  }

  function applyCameraPreset(presetKey: string) {
    const presetPose = resolveCameraPresetOrWarn(presetKey)
    if (!presetPose) {
      return false
    }

    currentCameraPresetKey.value = presetKey
    applyCameraPose(presetPose)
    return true
  }

  function animateCameraToPreset(
    presetKey: string,
    transitionOptions: EngineCameraTransitionOptions = {},
  ) {
    const presetPose = resolveCameraPresetOrWarn(presetKey)
    if (!presetPose) {
      return false
    }

    currentCameraPresetKey.value = presetKey
    animateCameraToPose(presetPose, transitionOptions)
    return true
  }

  return {
    currentCameraPresetKey,
    isCameraAnimationActive,
    cameraAnimationProgress,
    captureCameraPose,
    fixedUpdate,
    applyCameraPose,
    applyCameraPerspective,
    animateCameraToPose,
    cancelCameraAnimation,
    applyCameraPreset,
    animateCameraToPreset,
  }
}
