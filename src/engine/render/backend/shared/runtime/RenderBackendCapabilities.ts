import { isWebGPUSupported } from '../../webgpu/device/WebGPUDeviceBootstrap'

export type RenderBackendKind = 'webgl2' | 'webgpu'
export type RenderBackendImplementationStage = 'implemented' | 'minimal' | 'bootstrap-only'

export type RenderBackendCapability = {
  kind: RenderBackendKind
  browserSupported: boolean
  runtimeReady: boolean
  implementationStage: RenderBackendImplementationStage
  reason: string | null
}

export type RenderBackendCapabilitySnapshot = {
  webgl2: RenderBackendCapability
  webgpu: RenderBackendCapability
}

function detectWebGL2Support() {
  if (typeof document === 'undefined') {
    return false
  }

  const canvas = document.createElement('canvas')
  try {
    return !!canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
    })
  } catch {
    return false
  }
}

export function getWebGL2RenderBackendCapability(): RenderBackendCapability {
  const browserSupported = detectWebGL2Support()
  return {
    kind: 'webgl2',
    browserSupported,
    runtimeReady: browserSupported,
    implementationStage: 'implemented',
    reason: browserSupported ? null : 'WebGL2 unavailable',
  }
}

export function getWebGPUBackendCapability(): RenderBackendCapability {
  const browserSupported = isWebGPUSupported()
  return {
    kind: 'webgpu',
    browserSupported,
    runtimeReady: browserSupported,
    implementationStage: 'bootstrap-only',
    reason: browserSupported
      ? 'Browser-native WebGPU backend is intentionally parked as a bootstrap shell while terrain, entity, and material delivery are re-layered away from the old WebGL2-shaped compatibility runtime'
      : 'navigator.gpu unavailable',
  }
}

export function getRenderBackendCapabilitySnapshot(): RenderBackendCapabilitySnapshot {
  return {
    webgl2: getWebGL2RenderBackendCapability(),
    webgpu: getWebGPUBackendCapability(),
  }
}
