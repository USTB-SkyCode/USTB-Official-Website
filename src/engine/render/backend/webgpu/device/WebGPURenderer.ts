import type { EngineRuntimeLightingConfig } from '@/config/runtime'
import { GAME_CONFIG } from '@/engine/config'
import type {
  IRenderBackend,
  RenderBucket,
  RenderQueue,
} from '@/engine/render/backend/shared/contracts/IRenderBackend'
import {
  createEmptyEngineDrawCallStats,
  type EngineDrawCallStatsSnapshot,
  type EngineRendererFrameInput,
  type EngineRendererLightManager,
  type EngineUi3dComponent,
} from '@/engine/render/EngineRenderer'
import { TERRAIN_COMPACT_LAYOUT_ID } from '@/engine/render/layout/BuiltinLayouts'
import type { RenderObject } from '@/engine/render/queue/RenderObject'
import { Camera } from '@/engine/render/scene/camera/Camera'
import { WebGPURenderBackend } from './WebGPURenderBackend'
import { getWebGPUDeferredDestroyQueue } from './WebGPUDeferredDestroyQueue'
import { bootstrapWebGPUDevice } from './WebGPUDeviceBootstrap'

const WEBGPU_CANVAS_USAGE = 0x10 | 0x01 | 0x04

type WebGPUDeviceState = Awaited<ReturnType<typeof bootstrapWebGPUDevice>>

const CAMERA_UNIFORM_FLOATS = 32
const OBJECT_UNIFORM_FLOATS = 20
const UNIFORM_BUFFER_SIZE = 256

const TERRAIN_SHADER = `
struct CameraUniforms {
  viewProjection: mat4x4<f32>,
  sunDirection: vec4<f32>,
  ambientSkyColor: vec4<f32>,
  ambientGroundColor: vec4<f32>,
  lighting: vec4<f32>,
};

struct ObjectUniforms {
  model: mat4x4<f32>,
  params: vec4<f32>,
};

struct VertexInput {
  @location(0) terrain0: vec4<u32>,
  @location(1) terrain1: vec4<u32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec4<f32>,
  @location(2) skyLight: f32,
  @location(3) blockLight: f32,
  @location(4) emission: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> objectUniforms: ObjectUniforms;

fn safeNormalize(value: vec3<f32>) -> vec3<f32> {
  let len2 = dot(value, value);
  if (len2 > 1e-8) {
    return value / sqrt(len2);
  }
  return vec3<f32>(0.0, 1.0, 0.0);
}

fn decodeSnorm8Component(raw: u32) -> f32 {
  let signedValue = select(i32(raw), i32(raw) - 256, raw >= 128u);
  return max(f32(signedValue) / 127.0, -1.0);
}

fn decodeNormal3x8(packed: u32) -> vec3<f32> {
  return vec3<f32>(
    decodeSnorm8Component(packed & 0xffu),
    decodeSnorm8Component((packed >> 8u) & 0xffu),
    decodeSnorm8Component((packed >> 16u) & 0xffu),
  );
}

fn decodeColorRgba(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 0xffu) / 255.0,
    f32((packed >> 8u) & 0xffu) / 255.0,
    f32((packed >> 16u) & 0xffu) / 255.0,
    f32((packed >> 24u) & 0xffu) / 255.0,
  );
}

fn decodePosition(terrain0: vec4<u32>) -> vec3<f32> {
  return vec3<f32>(
    f32(terrain0.x) * 0.03125 - 4.0,
    f32(terrain0.y) * 0.03125 - 128.0,
    f32(terrain0.z) * 0.03125 - 4.0,
  );
}

fn lerpVec3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
  return a + (b - a) * t;
}

fn applyLighting(
  albedo: vec3<f32>,
  normal: vec3<f32>,
  skyLight: f32,
  blockLight: f32,
  emission: f32,
) -> vec3<f32> {
  let lightDir = safeNormalize(-camera.sunDirection.xyz);
  let worldNormal = safeNormalize(normal);
  let diffuse = max(dot(worldNormal, lightDir), 0.0);
  let upFactor = clamp(worldNormal.y * 0.5 + 0.5, 0.0, 1.0);
  let skyFactor = clamp(skyLight, 0.0, 1.0);
  let ambientBase = lerpVec3(camera.ambientGroundColor.xyz, camera.ambientSkyColor.xyz, upFactor);
  let ambient = ambientBase * camera.lighting.x * (0.35 + skyFactor * 0.65);
  let direct = diffuse * (0.2 + skyFactor * 0.8);
  let blockBounce = vec3<f32>(blockLight * 0.35, blockLight * 0.35, blockLight * 0.35);
  let emissive = albedo * clamp(emission, 0.0, 1.0) * 1.5;
  return albedo * (ambient + vec3<f32>(direct, direct, direct) + blockBounce) + emissive;
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let position = decodePosition(input.terrain0);
  let normal = safeNormalize(decodeNormal3x8(input.terrain0.w));
  let worldPos = objectUniforms.model * vec4<f32>(position, 1.0);
  output.position = camera.viewProjection * worldPos;
  output.normal = safeNormalize((objectUniforms.model * vec4<f32>(normal, 0.0)).xyz);
  output.color = decodeColorRgba(input.terrain1.z);
  output.blockLight = f32((input.terrain1.y >> 16u) & 0xffu) / 255.0;
  output.skyLight = f32((input.terrain1.y >> 24u) & 0xffu) / 255.0;
  output.emission = f32((input.terrain1.w >> 8u) & 0xffu) / 255.0;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let alpha = clamp(input.color.a * objectUniforms.params.x, 0.0, 1.0);
  if (objectUniforms.params.y > 0.0 && alpha < objectUniforms.params.y) {
    discard;
  }

  let lit = applyLighting(
    input.color.rgb,
    input.normal,
    input.skyLight,
    input.blockLight,
    input.emission,
  );
  let preserveAlpha = objectUniforms.params.z > 0.5;
  let outputAlpha = select(1.0, alpha, preserveAlpha);
  return vec4<f32>(lit, outputAlpha);
}
`

function createTerrainPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  layout: GPUPipelineLayout,
  shader: GPUShaderModule,
  translucent: boolean,
) {
  return device.createRenderPipeline({
    label: translucent ? 'webgpu-terrain-translucent' : 'webgpu-terrain-opaque',
    layout,
    vertex: {
      module: shader,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 32,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'uint32x4' },
            { shaderLocation: 1, offset: 16, format: 'uint32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shader,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: translucent
            ? {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
              }
            : undefined,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'back',
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: !translucent,
      depthCompare: 'less',
    },
  })
}

export class WebGPURenderer {
  public readonly kind = 'webgpu' as const
  public canvas: HTMLCanvasElement
  public camera: Camera
  public sunDirection: Float32Array = new Float32Array(GAME_CONFIG.RENDER.LIGHTING.SUN_DIRECTION)
  public sunColor: Float32Array = new Float32Array(GAME_CONFIG.RENDER.LIGHTING.SUN_COLOR)
  public lights: Float32Array = new Float32Array(0)
  public ambientSkyColor: Float32Array = new Float32Array([0.2, 0.3, 0.5])
  public ambientGroundColor: Float32Array = new Float32Array([0.08, 0.07, 0.06])
  public ambientIntensity = 0.6
  public iblIntensity = 0.3
  public lightManager: EngineRendererLightManager = {
    numLights: 0,
    update: () => {
      this.lightManager.numLights = 0
    },
  }

  private readonly deviceState: WebGPUDeviceState
  private readonly destroyQueue: ReturnType<typeof getWebGPUDeferredDestroyQueue>
  private readonly cameraBuffer: GPUBuffer
  private readonly objectBuffer: GPUBuffer
  private readonly cameraData = new Float32Array(CAMERA_UNIFORM_FLOATS)
  private readonly objectData = new Float32Array(OBJECT_UNIFORM_FLOATS)
  private readonly cameraBindGroup: GPUBindGroup
  private readonly objectBindGroup: GPUBindGroup
  private readonly terrainOpaquePipeline: GPURenderPipeline
  private readonly terrainTranslucentPipeline: GPURenderPipeline
  private depthTexture: GPUTexture | null = null
  private depthTextureWidth = 0
  private depthTextureHeight = 0
  private lastFrameDrawCallStats: EngineDrawCallStatsSnapshot = createEmptyEngineDrawCallStats()

  private constructor(canvas: HTMLCanvasElement, deviceState: WebGPUDeviceState) {
    this.canvas = canvas
    this.deviceState = deviceState
    this.destroyQueue = getWebGPUDeferredDestroyQueue(deviceState.device as unknown as GPUDevice)
    this.camera = new Camera(
      GAME_CONFIG.RENDER.FOV,
      canvas.width / Math.max(1, canvas.height),
      GAME_CONFIG.RENDER.NEAR_PLANE,
      GAME_CONFIG.RENDER.FAR_PLANE,
      GAME_CONFIG.RENDER.REVERSE_Z,
    )
    this.camera.update()

    const device = this.getDevice()
    const shader = device.createShaderModule({
      label: 'world-webgpu-terrain-shader',
      code: TERRAIN_SHADER,
    })
    this.cameraBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.objectBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const cameraBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })
    const objectBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [cameraBindGroupLayout, objectBindGroupLayout],
    })

    this.cameraBindGroup = device.createBindGroup({
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    })
    this.objectBindGroup = device.createBindGroup({
      layout: objectBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.objectBuffer } }],
    })
    this.terrainOpaquePipeline = createTerrainPipeline(
      device,
      this.getPreferredCanvasFormat(),
      pipelineLayout,
      shader,
      false,
    )
    this.terrainTranslucentPipeline = createTerrainPipeline(
      device,
      this.getPreferredCanvasFormat(),
      pipelineLayout,
      shader,
      true,
    )
    this.reconfigureCanvasContext()
    this.ensureDepthTexture()
  }

  public static async create(canvas: HTMLCanvasElement) {
    const deviceState = await bootstrapWebGPUDevice({
      canvas: {
        canvas,
        alphaMode: 'premultiplied',
      },
      onUncapturedError: error => {
        console.error('[WebGPURenderer] Uncaptured GPU error', error)
      },
      onDeviceLost: info => {
        console.error('[WebGPURenderer] Device lost', info)
      },
    })

    return new WebGPURenderer(canvas, deviceState)
  }

  public setUi3dComponents(_components: readonly EngineUi3dComponent[]) {}

  public setUi3dTransparentBackground(_enabled: boolean) {}

  public getDevice(): GPUDevice {
    return this.deviceState.device as unknown as GPUDevice
  }

  public resize(width: number, height: number) {
    this.canvas.width = width
    this.canvas.height = height
    this.reconfigureCanvasContext()
    this.ensureDepthTexture(true)
  }

  public render(frame: EngineRendererFrameInput = {}) {
    const {
      fogColor = new Float32Array(GAME_CONFIG.RENDER.FOG.COLOR),
      terrainQueues = null,
      renderBackend = null,
    } = frame

    this.lightManager.numLights = 0

    const device = this.getDevice()
    const canvasContext = this.getCanvasContext()
    if (!canvasContext) {
      this.lastFrameDrawCallStats = createEmptyEngineDrawCallStats()
      return
    }

    this.ensureDepthTexture()
    this.updateCameraBuffer()

    const encoder = device.createCommandEncoder({ label: 'world-webgpu-frame' })
    const colorView = canvasContext.getCurrentTexture().createView()
    const depthView = this.depthTexture?.createView()
    if (!depthView) {
      this.lastFrameDrawCallStats = createEmptyEngineDrawCallStats()
      return
    }

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          clearValue: {
            r: fogColor[0] ?? 0.0,
            g: fogColor[1] ?? 0.0,
            b: fogColor[2] ?? 0.0,
            a: 1.0,
          },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })

    const stats = createEmptyEngineDrawCallStats()
    if (terrainQueues && renderBackend instanceof WebGPURenderBackend) {
      pass.setBindGroup(0, this.cameraBindGroup)

      for (const queue of terrainQueues) {
        if (queue.stage !== 'geometry' && queue.stage !== 'forward') {
          continue
        }

        for (const bucket of queue.buckets) {
          if (!this.shouldRenderBucket(bucket)) {
            continue
          }

          const pipeline =
            bucket.key.blendMode === 'translucent'
              ? this.terrainTranslucentPipeline
              : this.terrainOpaquePipeline
          pass.setPipeline(pipeline)

          for (const object of bucket.objects) {
            if (!this.drawObject(pass, renderBackend, bucket, object)) {
              continue
            }

            stats.total += 1
            if (queue.stage in stats.byPass) {
              stats.byPass[queue.stage] += 1
            } else {
              stats.byPass.unknown += 1
            }

            const submesh = object.geometry.submeshes[0]
            if (submesh?.indexCount && submesh.indexCount > 0) {
              stats.drawElements += 1
            } else {
              stats.drawArrays += 1
            }
          }
        }
      }
    }

    pass.end()
    device.queue.submit([encoder.finish()])
    this.lastFrameDrawCallStats = stats
  }

  public setLightingConfig(_config: EngineRuntimeLightingConfig) {}

  public captureDebugSnapshots() {}

  public getLastFrameDrawCallStats(): EngineDrawCallStatsSnapshot {
    return this.lastFrameDrawCallStats
  }

  public dispose() {
    this.destroyQueue.scheduleDestroy(this.depthTexture)
    this.depthTexture = null
    this.depthTextureWidth = 0
    this.depthTextureHeight = 0
    this.destroyQueue.scheduleDestroy(this.cameraBuffer)
    this.destroyQueue.scheduleDestroy(this.objectBuffer)
  }

  private reconfigureCanvasContext() {
    this.getCanvasContext()?.configure({
      device: this.getDevice(),
      format: this.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
      usage: WEBGPU_CANVAS_USAGE,
    })
  }

  private getCanvasContext(): GPUCanvasContext | null {
    return (this.deviceState.canvasContext as unknown as GPUCanvasContext | null) ?? null
  }

  private getPreferredCanvasFormat(): GPUTextureFormat {
    return this.deviceState.preferredCanvasFormat as GPUTextureFormat
  }

  private ensureDepthTexture(forceRecreate: boolean = false) {
    const width = Math.max(1, this.canvas.width)
    const height = Math.max(1, this.canvas.height)
    if (
      !forceRecreate &&
      this.depthTexture &&
      this.depthTextureWidth === width &&
      this.depthTextureHeight === height
    ) {
      return
    }

    this.destroyQueue.scheduleDestroy(this.depthTexture)
    this.depthTexture = this.getDevice().createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.depthTextureWidth = width
    this.depthTextureHeight = height
  }

  private updateCameraBuffer() {
    this.cameraData.fill(0)
    this.cameraData.set(this.camera.viewProjectionMatrix, 0)
    this.cameraData.set(this.sunDirection, 16)
    this.cameraData[19] = 0
    this.cameraData.set(this.ambientSkyColor, 20)
    this.cameraData[23] = 1
    this.cameraData.set(this.ambientGroundColor, 24)
    this.cameraData[27] = 1
    this.cameraData[28] = this.ambientIntensity
    this.cameraData[29] = this.iblIntensity
    this.getDevice().queue.writeBuffer(this.cameraBuffer, 0, this.cameraData)
  }

  private shouldRenderBucket(bucket: RenderBucket) {
    return (
      bucket.key.layoutId === TERRAIN_COMPACT_LAYOUT_ID &&
      (bucket.key.domain === 'terrain' || bucket.key.domain === 'decal')
    )
  }

  private drawObject(
    pass: GPURenderPassEncoder,
    renderBackend: WebGPURenderBackend,
    bucket: RenderBucket,
    object: RenderObject,
  ) {
    const resource = renderBackend.getGeometryResource(object.geometry.id)
    if (!resource || !resource.isDrawable) {
      return false
    }

    const vertexBinding = resource.binding.vertexBuffers[0]
    if (!vertexBinding) {
      return false
    }

    const vertexBuffer = vertexBinding.buffer as GPUBuffer
    const indexBuffer = resource.binding.indexBuffer as GPUBuffer | undefined
    const submesh = object.geometry.submeshes[0]
    const instanceCount = resource.binding.instanceCount ?? 1
    const vertexCount = submesh?.vertexCount ?? resource.binding.vertexCount
    const indexCount = submesh?.indexCount ?? resource.binding.indexCount ?? 0

    pass.setVertexBuffer(vertexBinding.slot, vertexBuffer, vertexBinding.offsetBytes)
    this.updateObjectBuffer(object, bucket)
    pass.setBindGroup(1, this.objectBindGroup)

    if (indexBuffer && indexCount > 0) {
      pass.setIndexBuffer(indexBuffer, 'uint32', resource.binding.indexOffsetBytes ?? 0)
      pass.drawIndexed(
        indexCount,
        instanceCount,
        submesh?.firstIndex ?? 0,
        submesh?.baseVertex ?? 0,
        0,
      )
      return true
    }

    if (vertexCount <= 0) {
      return false
    }

    pass.draw(vertexCount, instanceCount, submesh?.firstVertex ?? 0, 0)
    return true
  }

  private updateObjectBuffer(object: RenderObject, bucket: RenderBucket) {
    this.objectData.fill(0)
    this.objectData.set(object.transform, 0)

    const color = object.material.constants?.color
    const alphaScale = color instanceof Float32Array && color.length >= 4 ? color[3] : 1
    const alphaCutoff = bucket.key.blendMode === 'masked' ? 0.5 : 0
    const preserveAlpha = bucket.key.blendMode === 'translucent' ? 1 : 0

    this.objectData[16] = alphaScale
    this.objectData[17] = alphaCutoff
    this.objectData[18] = preserveAlpha
    this.getDevice().queue.writeBuffer(this.objectBuffer, 0, this.objectData)
  }
}
