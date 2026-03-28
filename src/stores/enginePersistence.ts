import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { GAME_CONFIG } from '@/engine/config'
import type { EngineRuntimeMutableConfig } from '@/config/runtime'
import type { PlayerPerspectiveMode } from '@/engine/world/game/PlayerRig'
import { isLikelyMobileDevice } from '@/utils/platformCapabilities'

const STORAGE_KEY = 'world-engine-persistence'
const MOBILE_DEFAULT_LOAD_DISTANCE = 8

type PersistedHomeExplorePose = {
  position: [number, number, number]
  lookTarget: [number, number, number]
  perspectiveMode?: PlayerPerspectiveMode
}

type PersistedEngineState = {
  runtimeConfig: EngineRuntimeMutableConfig
  homeExplorePose: PersistedHomeExplorePose | null
}

function isPerspectiveMode(value: unknown): value is PlayerPerspectiveMode {
  return (
    value === 'first-person' ||
    value === 'spectator' ||
    value === 'third-person-back' ||
    value === 'third-person-front'
  )
}

function toFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeRuntimeConfig(config: Partial<EngineRuntimeMutableConfig> | null | undefined) {
  return {
    controls: {
      moveSpeed: Math.max(
        0,
        toFiniteNumber(config?.controls?.moveSpeed, GAME_CONFIG.CONTROLS.MOVE_SPEED),
      ),
      mouseSensitivity: Math.max(
        0,
        toFiniteNumber(config?.controls?.mouseSensitivity, GAME_CONFIG.CONTROLS.MOUSE_SENSITIVITY),
      ),
      touchSensitivity: Math.max(
        0,
        toFiniteNumber(config?.controls?.touchSensitivity, GAME_CONFIG.CONTROLS.TOUCH_SENSITIVITY),
      ),
      touchJoystickRadius: Math.max(
        1,
        toFiniteNumber(
          config?.controls?.touchJoystickRadius,
          GAME_CONFIG.CONTROLS.TOUCH_JOYSTICK_RADIUS,
        ),
      ),
    },
    chunk: {
      loadDistance: Math.max(
        2,
        Math.round(toFiniteNumber(config?.chunk?.loadDistance, GAME_CONFIG.CHUNK.LOAD_DISTANCE)),
      ),
    },
    lighting: {
      enablePointLights:
        config?.lighting?.enablePointLights ?? GAME_CONFIG.RENDER.LIGHTING.ENABLE_POINT_LIGHTS,
      enableVertexLighting:
        config?.lighting?.enableVertexLighting ??
        GAME_CONFIG.RENDER.LIGHTING.ENABLE_VERTEX_LIGHTING,
      enableSmoothLighting:
        (config?.lighting?.enableVertexLighting ??
          GAME_CONFIG.RENDER.LIGHTING.ENABLE_VERTEX_LIGHTING) &&
        (config?.lighting?.enableSmoothLighting ??
          GAME_CONFIG.RENDER.LIGHTING.ENABLE_SMOOTH_LIGHTING),
    },
  } satisfies EngineRuntimeMutableConfig
}

function getDefaultRuntimeConfig() {
  if (!isLikelyMobileDevice()) {
    return sanitizeRuntimeConfig(null)
  }

  return sanitizeRuntimeConfig({
    chunk: {
      loadDistance: MOBILE_DEFAULT_LOAD_DISTANCE,
    },
    lighting: {
      enablePointLights: false,
      enableVertexLighting: true,
      enableSmoothLighting: true,
    },
  })
}

function sanitizePoseVector(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null
  }

  const v0 = toFiniteNumber(value[0], Number.NaN)
  const v1 = toFiniteNumber(value[1], Number.NaN)
  const v2 = toFiniteNumber(value[2], Number.NaN)

  if (Number.isNaN(v0) || Number.isNaN(v1) || Number.isNaN(v2)) {
    return null
  }

  return [v0, v1, v2]
}

function sanitizeHomeExplorePose(value: unknown): PersistedHomeExplorePose | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const position = sanitizePoseVector(candidate.position)
  const lookTarget = sanitizePoseVector(candidate.lookTarget)

  if (!position || !lookTarget) {
    return null
  }

  const perspectiveMode = isPerspectiveMode(candidate.perspectiveMode)
    ? candidate.perspectiveMode
    : undefined

  return {
    position,
    lookTarget,
    perspectiveMode,
  }
}

function readPersistedState(): PersistedEngineState {
  const fallback: PersistedEngineState = {
    runtimeConfig: getDefaultRuntimeConfig(),
    homeExplorePose: null,
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw) as Partial<PersistedEngineState>
    return {
      runtimeConfig: sanitizeRuntimeConfig(parsed.runtimeConfig),
      homeExplorePose: sanitizeHomeExplorePose(parsed.homeExplorePose),
    }
  } catch (error) {
    console.warn('Engine persistence store: failed to read persisted state', error)
    return fallback
  }
}

export const useEnginePersistenceStore = defineStore('enginePersistence', () => {
  const persisted = readPersistedState()
  const runtimeConfig = ref<EngineRuntimeMutableConfig>(persisted.runtimeConfig)
  const homeExplorePose = ref<PersistedHomeExplorePose | null>(persisted.homeExplorePose)

  function persistState() {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          runtimeConfig: runtimeConfig.value,
          homeExplorePose: homeExplorePose.value,
        } satisfies PersistedEngineState),
      )
    } catch (error) {
      console.warn('Engine persistence store: failed to persist state', error)
    }
  }

  function setRuntimeConfig(config: EngineRuntimeMutableConfig) {
    runtimeConfig.value = sanitizeRuntimeConfig(config)
  }

  function setHomeExplorePose(pose: PersistedHomeExplorePose) {
    homeExplorePose.value = sanitizeHomeExplorePose(pose)
  }

  function clearHomeExplorePose() {
    homeExplorePose.value = null
  }

  if (typeof window !== 'undefined') {
    watch([runtimeConfig, homeExplorePose], persistState, { deep: true, immediate: true })
  }

  return {
    runtimeConfig: computed(() => runtimeConfig.value),
    homeExplorePose: computed(() => homeExplorePose.value),
    setRuntimeConfig,
    setHomeExplorePose,
    clearHomeExplorePose,
  }
})
