export type WebGPUPowerPreference = 'low-power' | 'high-performance'

export type WebGPUCanvasAlphaMode = 'opaque' | 'premultiplied'
export type WebGPUFeatureName = string
export type WebGPURequiredLimits = Record<string, number>
export type WebGPUTextureFormat = string
export type WebGPUTextureUsageFlags = number
export type WebGPUErrorInfo = { message: string }
export type WebGPUDeviceLostInfo = { reason: string; message?: string }

type WebGPUAdapterLike = {
  features: {
    has(feature: string): boolean
  }
  requestDevice(options?: {
    requiredFeatures?: string[]
    requiredLimits?: Record<string, number>
  }): Promise<WebGPUDeviceLike>
}

type WebGPUDeviceLike = {
  lost: Promise<WebGPUDeviceLostInfo>
  addEventListener(
    type: 'uncapturederror',
    listener: (event: { error: WebGPUErrorInfo }) => void,
  ): void
}

type WebGPUCanvasContextLike = {
  configure(options: {
    device: WebGPUDeviceLike
    format: WebGPUTextureFormat
    alphaMode: WebGPUCanvasAlphaMode
    usage: WebGPUTextureUsageFlags
  }): void
}

type WebGPUNavigatorLike = {
  getPreferredCanvasFormat(): WebGPUTextureFormat
  requestAdapter(options?: {
    powerPreference?: WebGPUPowerPreference
  }): Promise<WebGPUAdapterLike | null>
}

const WEBGPU_TEXTURE_USAGE = {
  COPY_SRC: 0x01,
  TEXTURE_BINDING: 0x04,
  RENDER_ATTACHMENT: 0x10,
} as const

export type WebGPUCanvasBootstrapOptions = {
  canvas: HTMLCanvasElement
  alphaMode?: WebGPUCanvasAlphaMode
  usage?: WebGPUTextureUsageFlags
}

export type WebGPUDeviceBootstrapOptions = {
  powerPreference?: WebGPUPowerPreference
  requiredFeatures?: readonly WebGPUFeatureName[]
  requiredLimits?: WebGPURequiredLimits
  canvas?: WebGPUCanvasBootstrapOptions
  onUncapturedError?: (error: WebGPUErrorInfo) => void
  onDeviceLost?: (info: WebGPUDeviceLostInfo) => void
}

export type WebGPUDeviceBootstrapResult = {
  adapter: WebGPUAdapterLike
  device: WebGPUDeviceLike
  canvasContext: WebGPUCanvasContextLike | null
  preferredCanvasFormat: WebGPUTextureFormat
}

function getNavigatorGpu() {
  const nextNavigator = typeof navigator !== 'undefined' ? navigator : null
  const navigatorWithGpu = nextNavigator as (Navigator & { gpu?: WebGPUNavigatorLike }) | null
  return navigatorWithGpu?.gpu ?? null
}

export function isWebGPUSupported() {
  return getNavigatorGpu() !== null
}

function resolveRequiredFeatures(
  adapter: WebGPUAdapterLike,
  requestedFeatures: readonly WebGPUFeatureName[] | undefined,
) {
  if (!requestedFeatures || requestedFeatures.length === 0) {
    return []
  }

  const supportedFeatures = adapter.features
  const missingFeatures = requestedFeatures.filter(feature => !supportedFeatures.has(feature))
  if (missingFeatures.length > 0) {
    throw new Error(`WebGPU adapter is missing required features: ${missingFeatures.join(', ')}`)
  }

  return [...requestedFeatures]
}

function resolveRequiredLimits(
  requestedLimits: WebGPURequiredLimits | undefined,
): WebGPURequiredLimits | undefined {
  if (!requestedLimits) {
    return undefined
  }

  const resolved: WebGPURequiredLimits = {}
  for (const key of Object.keys(requestedLimits)) {
    const value = requestedLimits[key]
    if (typeof value === 'number') {
      resolved[key] = value
    }
  }

  return resolved
}

function configureCanvasContext(
  device: WebGPUDeviceLike,
  preferredCanvasFormat: WebGPUTextureFormat,
  canvasOptions: WebGPUCanvasBootstrapOptions | undefined,
) {
  if (!canvasOptions) {
    return null
  }

  const context = canvasOptions.canvas.getContext('webgpu') as WebGPUCanvasContextLike | null
  if (!context) {
    throw new Error('Failed to acquire WebGPU canvas context')
  }

  context.configure({
    device,
    format: preferredCanvasFormat,
    alphaMode: canvasOptions.alphaMode ?? 'premultiplied',
    usage:
      canvasOptions.usage ??
      WEBGPU_TEXTURE_USAGE.RENDER_ATTACHMENT |
        WEBGPU_TEXTURE_USAGE.COPY_SRC |
        WEBGPU_TEXTURE_USAGE.TEXTURE_BINDING,
  })

  return context
}

export async function bootstrapWebGPUDevice(
  options: WebGPUDeviceBootstrapOptions = {},
): Promise<WebGPUDeviceBootstrapResult> {
  const gpu = getNavigatorGpu()
  if (!gpu) {
    throw new Error('WebGPU is not supported in the current browser runtime')
  }

  const adapter = await gpu.requestAdapter({
    powerPreference: options.powerPreference ?? 'high-performance',
  })
  if (!adapter) {
    throw new Error('Failed to acquire a WebGPU adapter')
  }

  const requiredFeatures = resolveRequiredFeatures(adapter, options.requiredFeatures)
  const requiredLimits = resolveRequiredLimits(options.requiredLimits)
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits,
  })

  if (options.onUncapturedError) {
    device.addEventListener('uncapturederror', event => {
      options.onUncapturedError?.(event.error)
    })
  }

  if (options.onDeviceLost) {
    void device.lost.then(info => {
      options.onDeviceLost?.(info)
    })
  }

  const preferredCanvasFormat = gpu.getPreferredCanvasFormat()
  const canvasContext = configureCanvasContext(device, preferredCanvasFormat, options.canvas)

  return {
    adapter,
    device,
    canvasContext,
    preferredCanvasFormat,
  }
}
