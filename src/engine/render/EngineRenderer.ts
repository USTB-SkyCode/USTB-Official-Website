import type { EngineRuntimeLightingConfig } from '@/config/runtime'
import type {
  IRenderBackend,
  RenderQueue,
} from '@/engine/render/backend/shared/contracts/IRenderBackend'
import type { ScreenEffectRect } from '@/engine/render/queue/RenderObject'
import type { Camera } from '@/engine/render/scene/camera/Camera'

export type EngineRendererKind = 'webgl2' | 'webgpu'

export const ENGINE_DRAW_CALL_PASSES = [
  'shadow',
  'depth-prepass',
  'geometry',
  'ssao',
  'point-shadow',
  'lighting',
  'forward',
  'forward-composite',
  'postprocess',
  'ui',
  'unknown',
] as const

export type EngineDrawCallPassName = (typeof ENGINE_DRAW_CALL_PASSES)[number]

export type EngineDrawCallStatsSnapshot = {
  total: number
  drawArrays: number
  drawElements: number
  byPass: Record<EngineDrawCallPassName, number>
}

export function createEmptyEngineDrawCallStats(): EngineDrawCallStatsSnapshot {
  return {
    total: 0,
    drawArrays: 0,
    drawElements: 0,
    byPass: {
      shadow: 0,
      'depth-prepass': 0,
      geometry: 0,
      ssao: 0,
      'point-shadow': 0,
      lighting: 0,
      forward: 0,
      'forward-composite': 0,
      postprocess: 0,
      ui: 0,
      unknown: 0,
    },
  }
}

export type EngineSelectionOutline = {
  x: number
  y: number
  z: number
}

export type EngineUi3dComponentType = 'liquid-glass' | 'hologram' | 'text-label'

export type EngineUi3dComponent = {
  id: number
  componentType: EngineUi3dComponentType
  rect: ScreenEffectRect
  props: unknown
  enabled?: boolean
  sortKey?: number
}

export type EngineRendererFrameInput = {
  textureArray?: WebGLTexture | null
  normalArray?: WebGLTexture | null
  specularArray?: WebGLTexture | null
  variantLUT?: WebGLTexture | null
  lightSpaceMatrices?: Float32Array[] | null
  cascadeSplits?: Float32Array | null
  fogStart?: number
  fogEnd?: number
  fogColor?: Float32Array
  terrainQueues?: RenderQueue[] | null
  renderBackend?: IRenderBackend | null
  selectionOutline?: EngineSelectionOutline | null
}

export type EngineRendererLightManager = {
  numLights: number
  update: (...args: unknown[]) => void
}

export type EngineRenderer = {
  readonly kind: EngineRendererKind
  canvas: HTMLCanvasElement
  camera: Camera
  sunDirection: Float32Array
  sunColor: Float32Array
  lights: Float32Array
  ambientSkyColor: Float32Array
  ambientGroundColor: Float32Array
  ambientIntensity: number
  iblIntensity: number
  lightManager: EngineRendererLightManager
  setUi3dComponents(components: readonly EngineUi3dComponent[]): void
  setUi3dTransparentBackground(enabled: boolean): void
  resize(width: number, height: number): void
  render(frame?: EngineRendererFrameInput): void
  setLightingConfig(config: EngineRuntimeLightingConfig): void
  captureDebugSnapshots(): void
  getLastFrameDrawCallStats(): EngineDrawCallStatsSnapshot
  dispose(): void
}
