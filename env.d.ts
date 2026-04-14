/// <reference types="vite/client" />

declare module '@nick/lz4' {
	export function decompress(data: Uint8Array): Uint8Array
}

declare module '*.glsl' {
  const content: string
  export default content
}
declare module '*.vsh' {
  const content: string
  export default content
}
declare module '*.fsh' {
  const content: string
  export default content
}

declare module 'pako' {
  export function inflate(data: Uint8Array): Uint8Array
  export function deflate(data: Uint8Array): Uint8Array
}

type GPUBufferUsageFlags = number
type GPUTextureUsageFlags = number
type GPUShaderStageFlags = number
type GPUTextureFormat = string
type GPUIndexFormat = 'uint16' | 'uint32'
type GPULoadOp = 'clear' | 'load'
type GPUStoreOp = 'store' | 'discard'
type GPUPrimitiveTopology = 'triangle-list' | 'triangle-strip' | 'line-list' | 'line-strip'
type GPUFrontFace = 'ccw' | 'cw'
type GPUCullMode = 'none' | 'front' | 'back'
type GPUCompareFunction =
  | 'never'
  | 'less'
  | 'equal'
  | 'less-equal'
  | 'greater'
  | 'not-equal'
  | 'greater-equal'
  | 'always'
type GPUBlendFactor =
  | 'zero'
  | 'one'
  | 'src'
  | 'one-minus-src'
  | 'src-alpha'
  | 'one-minus-src-alpha'
  | 'dst'
  | 'one-minus-dst'
  | 'dst-alpha'
  | 'one-minus-dst-alpha'
type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max'

interface GPUBuffer {
  destroy(): void
}

interface GPUTextureView {}

interface GPUTexture {
  createView(descriptor?: unknown): GPUTextureView
  destroy(): void
}

interface GPUShaderModule {}

interface GPUBindGroupLayout {}

interface GPUPipelineLayout {}

interface GPUBindGroup {}

interface GPURenderPipeline {}

interface GPUCommandBuffer {}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource | SharedArrayBuffer): void
  submit(commandBuffers: GPUCommandBuffer[]): void
  onSubmittedWorkDone(): Promise<void>
}

interface GPUBufferDescriptor {
  size: number
  usage: GPUBufferUsageFlags
}

interface GPUShaderModuleDescriptor {
  label?: string
  code: string
}

interface GPUBindGroupLayoutDescriptor {
  entries: Array<{
    binding: number
    visibility: GPUShaderStageFlags
    buffer?: { type?: string }
  }>
}

interface GPUPipelineLayoutDescriptor {
  bindGroupLayouts: GPUBindGroupLayout[]
}

interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout
  entries: Array<{
    binding: number
    resource: { buffer: GPUBuffer }
  }>
}

interface GPUVertexAttribute {
  shaderLocation: number
  offset: number
  format: string
}

interface GPUVertexBufferLayout {
  arrayStride: number
  attributes: GPUVertexAttribute[]
}

interface GPUBlendComponent {
  srcFactor: GPUBlendFactor
  dstFactor: GPUBlendFactor
  operation: GPUBlendOperation
}

interface GPUBlendState {
  color: GPUBlendComponent
  alpha: GPUBlendComponent
}

interface GPUColorTargetState {
  format: GPUTextureFormat
  blend?: GPUBlendState
}

interface GPUDepthStencilState {
  format: GPUTextureFormat
  depthWriteEnabled: boolean
  depthCompare: GPUCompareFunction
}

interface GPURenderPipelineDescriptor {
  label?: string
  layout: GPUPipelineLayout
  vertex: {
    module: GPUShaderModule
    entryPoint: string
    buffers: GPUVertexBufferLayout[]
  }
  fragment?: {
    module: GPUShaderModule
    entryPoint: string
    targets: GPUColorTargetState[]
  }
  primitive?: {
    topology: GPUPrimitiveTopology
    frontFace?: GPUFrontFace
    cullMode?: GPUCullMode
  }
  depthStencil?: GPUDepthStencilState
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder
  copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number,
  ): void
  finish(): GPUCommandBuffer
}

interface GPUTextureDescriptor {
  size: {
    width: number
    height: number
    depthOrArrayLayers: number
  }
  format: GPUTextureFormat
  usage: GPUTextureUsageFlags
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView
  clearValue: {
    r: number
    g: number
    b: number
    a: number
  }
  loadOp: GPULoadOp
  storeOp: GPUStoreOp
}

interface GPURenderPassDepthStencilAttachment {
  view: GPUTextureView
  depthClearValue: number
  depthLoadOp: GPULoadOp
  depthStoreOp: GPUStoreOp
}

interface GPURenderPassDescriptor {
  colorAttachments: GPURenderPassColorAttachment[]
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment
}

interface GPURenderPassEncoder {
  setBindGroup(index: number, bindGroup: GPUBindGroup): void
  setPipeline(pipeline: GPURenderPipeline): void
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number): void
  setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat, offset?: number): void
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void
  end(): void
}

interface GPUCanvasConfiguration {
  device: GPUDevice
  format: GPUTextureFormat
  alphaMode?: 'opaque' | 'premultiplied'
  usage?: GPUTextureUsageFlags
}

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void
  getCurrentTexture(): GPUTexture
}

interface GPUDevice {
  readonly queue: GPUQueue
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline
  createCommandEncoder(descriptor?: { label?: string }): GPUCommandEncoder
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture
}

declare const GPUBufferUsage: {
  MAP_READ: number
  MAP_WRITE: number
  COPY_SRC: number
  COPY_DST: number
  INDEX: number
  VERTEX: number
  UNIFORM: number
  STORAGE: number
  INDIRECT: number
  QUERY_RESOLVE: number
}

declare const GPUTextureUsage: {
  COPY_SRC: number
  COPY_DST: number
  TEXTURE_BINDING: number
  STORAGE_BINDING: number
  RENDER_ATTACHMENT: number
}

declare const GPUShaderStage: {
  VERTEX: number
  FRAGMENT: number
  COMPUTE: number
}
