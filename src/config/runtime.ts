import { GAME_CONFIG } from '@/engine/config'

export type EngineRuntimeControlsConfig = {
  moveSpeed: number
  mouseSensitivity: number
  touchSensitivity: number
  touchJoystickRadius: number
}

export type EngineRuntimeChunkConfig = {
  loadDistance: number
}

export type EngineRuntimeLightingConfig = {
  enablePointLights: boolean
  enableVertexLighting: boolean
  enableSmoothLighting: boolean
}

export type EngineRuntimeMutableConfig = {
  controls: EngineRuntimeControlsConfig
  chunk: EngineRuntimeChunkConfig
  lighting: EngineRuntimeLightingConfig
}

export type EngineRuntimeConfigPatch = {
  controls?: Partial<EngineRuntimeControlsConfig>
  chunk?: Partial<EngineRuntimeChunkConfig>
  lighting?: Partial<EngineRuntimeLightingConfig>
}

type EngineRuntimeConfigListener = (
  nextConfig: EngineRuntimeMutableConfig,
  previousConfig: EngineRuntimeMutableConfig,
) => void

function cloneRuntimeConfig(config: EngineRuntimeMutableConfig): EngineRuntimeMutableConfig {
  return {
    controls: { ...config.controls },
    chunk: { ...config.chunk },
    lighting: { ...config.lighting },
  }
}

function sanitizeRuntimeConfig(config: EngineRuntimeMutableConfig): EngineRuntimeMutableConfig {
  return {
    controls: {
      moveSpeed: Math.max(0, config.controls.moveSpeed),
      mouseSensitivity: Math.max(0, config.controls.mouseSensitivity),
      touchSensitivity: Math.max(0, config.controls.touchSensitivity),
      touchJoystickRadius: Math.max(1, config.controls.touchJoystickRadius),
    },
    chunk: {
      loadDistance: Math.max(2, Math.round(config.chunk.loadDistance)),
    },
    lighting: {
      enablePointLights: config.lighting.enablePointLights,
      enableVertexLighting: config.lighting.enableVertexLighting,
      enableSmoothLighting:
        config.lighting.enableVertexLighting && config.lighting.enableSmoothLighting,
    },
  }
}

const runtimeConfigState: EngineRuntimeMutableConfig = sanitizeRuntimeConfig({
  controls: {
    moveSpeed: GAME_CONFIG.CONTROLS.MOVE_SPEED,
    mouseSensitivity: GAME_CONFIG.CONTROLS.MOUSE_SENSITIVITY,
    touchSensitivity: GAME_CONFIG.CONTROLS.TOUCH_SENSITIVITY,
    touchJoystickRadius: GAME_CONFIG.CONTROLS.TOUCH_JOYSTICK_RADIUS,
  },
  chunk: {
    loadDistance: GAME_CONFIG.CHUNK.LOAD_DISTANCE,
  },
  lighting: {
    enablePointLights: GAME_CONFIG.RENDER.LIGHTING.ENABLE_POINT_LIGHTS,
    enableVertexLighting: GAME_CONFIG.RENDER.LIGHTING.ENABLE_VERTEX_LIGHTING,
    enableSmoothLighting: GAME_CONFIG.RENDER.LIGHTING.ENABLE_SMOOTH_LIGHTING,
  },
})

const runtimeConfigListeners = new Set<EngineRuntimeConfigListener>()

export function getEngineRuntimeConfig(): EngineRuntimeMutableConfig {
  return cloneRuntimeConfig(runtimeConfigState)
}

export function getEngineRuntimeControlsConfig(): EngineRuntimeControlsConfig {
  return { ...runtimeConfigState.controls }
}

export function getEngineRuntimeChunkConfig(): EngineRuntimeChunkConfig {
  return { ...runtimeConfigState.chunk }
}

export function getEngineRuntimeLightingConfig(): EngineRuntimeLightingConfig {
  return { ...runtimeConfigState.lighting }
}

export function subscribeEngineRuntimeConfig(listener: EngineRuntimeConfigListener) {
  runtimeConfigListeners.add(listener)
  return () => {
    runtimeConfigListeners.delete(listener)
  }
}

export function applyEngineRuntimeConfigPatch(
  patch: EngineRuntimeConfigPatch,
): EngineRuntimeMutableConfig {
  const previousConfig = getEngineRuntimeConfig()
  const nextConfig = sanitizeRuntimeConfig({
    controls: {
      ...runtimeConfigState.controls,
      ...patch.controls,
    },
    chunk: {
      ...runtimeConfigState.chunk,
      ...patch.chunk,
    },
    lighting: {
      ...runtimeConfigState.lighting,
      ...patch.lighting,
    },
  })

  runtimeConfigState.controls = nextConfig.controls
  runtimeConfigState.chunk = nextConfig.chunk
  runtimeConfigState.lighting = nextConfig.lighting

  const emittedConfig = getEngineRuntimeConfig()
  for (const listener of runtimeConfigListeners) {
    listener(emittedConfig, previousConfig)
  }

  return emittedConfig
}
