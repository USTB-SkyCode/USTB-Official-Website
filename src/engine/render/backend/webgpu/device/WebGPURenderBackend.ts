import type {
  ExternalGeometryArtifact,
  FrameRenderContext,
  GeometryArtifact,
  IRenderBackend,
  ResidentGeometryBinding,
  RenderQueue,
} from '@render/backend/shared/contracts/IRenderBackend'
import type { GeometryHandle } from '@render/backend/shared/contracts/GeometryHandle'
import type { VertexLayoutDescriptor } from '@render/layout/VertexLayoutDescriptor'
import { getWebGPUDeferredDestroyQueue } from './WebGPUDeferredDestroyQueue'

type WebGPUGeometryResource = {
  id: number
  binding: ResidentGeometryBinding
  isDrawable: boolean
  ownedVertexBuffers: GPUBuffer[]
  ownedIndexBuffer: GPUBuffer | null
}

function cloneResidentGeometryBinding(binding: ResidentGeometryBinding): ResidentGeometryBinding {
  return {
    ...binding,
    vertexBuffers: binding.vertexBuffers.map(vertexBuffer => ({ ...vertexBuffer })),
  }
}

function isResidentGeometryBinding(value: unknown): value is ResidentGeometryBinding {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ResidentGeometryBinding>
  return (
    typeof candidate.layoutId === 'string' &&
    Array.isArray(candidate.vertexBuffers) &&
    typeof candidate.vertexCount === 'number'
  )
}

function createGpuBufferWithData(
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  bytes: Uint8Array,
): GPUBuffer {
  const buffer = device.createBuffer({
    size: Math.max(bytes.byteLength, 4),
    usage: usage | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  if (bytes.byteLength > 0) {
    device.queue.writeBuffer(buffer, 0, bytes)
  }

  return buffer
}

export class WebGPURenderBackend implements IRenderBackend {
  public readonly kind = 'webgpu' as const

  private readonly layouts = new Map<string, VertexLayoutDescriptor>()
  private readonly geometryResources = new Map<number, WebGPUGeometryResource>()
  private readonly destroyQueue: ReturnType<typeof getWebGPUDeferredDestroyQueue>
  private nextGeometryId = 1

  constructor(private readonly device: GPUDevice) {
    this.destroyQueue = getWebGPUDeferredDestroyQueue(device)
  }

  public registerLayout(layout: VertexLayoutDescriptor): void {
    this.layouts.set(layout.id, layout)
  }

  public createGeometry(artifact: GeometryArtifact): GeometryHandle {
    const id = this.nextGeometryId++
    const layout = this.requireRegisteredLayout(artifact.layoutId)
    const vertexBuffer = createGpuBufferWithData(
      this.device,
      GPUBufferUsage.VERTEX,
      artifact.vertexBytes,
    )
    const indexBuffer =
      artifact.indexBytes && artifact.indexBytes.byteLength > 0
        ? createGpuBufferWithData(this.device, GPUBufferUsage.INDEX, artifact.indexBytes)
        : null

    const binding: ResidentGeometryBinding = {
      layoutId: artifact.layoutId,
      topology: artifact.topology,
      vertexBuffers: [
        {
          slot: 0,
          buffer: vertexBuffer,
          offsetBytes: 0,
          stride: layout.stride,
          stepMode: layout.backendHints?.webgpu?.stepMode ?? 'vertex',
        },
      ],
      vertexCount: Math.floor(artifact.vertexBytes.byteLength / Math.max(layout.stride, 1)),
      instanceCount: 1,
      indexBuffer: indexBuffer ?? undefined,
      indexOffsetBytes: 0,
      indexCount: artifact.indexBytes ? Math.floor(artifact.indexBytes.byteLength / 4) : 0,
    }

    this.geometryResources.set(id, {
      id,
      binding,
      isDrawable: binding.vertexCount > 0,
      ownedVertexBuffers: [vertexBuffer],
      ownedIndexBuffer: indexBuffer,
    })

    return {
      id,
      kind: 'procedural',
      topology: artifact.topology,
      layoutId: artifact.layoutId,
      resident: null,
      artifactVersion: 1,
      residentVersion: binding.vertexCount > 0 ? 1 : 0,
      submeshes: [],
    }
  }

  public createExternalGeometry(artifact: ExternalGeometryArtifact): GeometryHandle {
    const id = this.nextGeometryId++
    this.requireRegisteredLayout(artifact.layoutId)

    const binding = isResidentGeometryBinding(artifact.resource)
      ? cloneResidentGeometryBinding(artifact.resource)
      : isResidentGeometryBinding((artifact.resource as { binding?: unknown })?.binding)
        ? cloneResidentGeometryBinding(
            (artifact.resource as { binding: ResidentGeometryBinding }).binding,
          )
        : null

    if (!binding) {
      throw new Error(
        `Unsupported WebGPU external geometry resource for layout '${artifact.layoutId}'`,
      )
    }

    this.geometryResources.set(id, {
      id,
      binding,
      isDrawable: binding.vertexCount > 0,
      ownedVertexBuffers: [],
      ownedIndexBuffer: null,
    })

    return {
      id,
      kind: artifact.kind ?? 'static-model',
      topology: artifact.topology,
      layoutId: artifact.layoutId,
      resident: null,
      artifactVersion: 0,
      residentVersion: binding.vertexCount > 0 ? 1 : 0,
      submeshes: [],
    }
  }

  public createResidentGeometry(binding: ResidentGeometryBinding): GeometryHandle {
    const id = this.nextGeometryId++
    this.requireRegisteredLayout(binding.layoutId)

    this.geometryResources.set(id, {
      id,
      binding: cloneResidentGeometryBinding(binding),
      isDrawable: binding.vertexCount > 0,
      ownedVertexBuffers: [],
      ownedIndexBuffer: null,
    })

    return {
      id,
      kind: 'section',
      topology: binding.topology,
      layoutId: binding.layoutId,
      resident: null,
      artifactVersion: 0,
      residentVersion: binding.vertexCount > 0 ? 1 : 0,
      submeshes: [],
    }
  }

  public updateGeometry(handle: GeometryHandle, artifact: GeometryArtifact): void {
    this.releaseGeometry(handle)
    const nextHandle = this.createGeometry(artifact)
    const resource = this.geometryResources.get(nextHandle.id)
    if (!resource) {
      throw new Error(`Failed to recreate WebGPU geometry ${handle.id}`)
    }

    this.geometryResources.set(handle.id, resource)
    this.geometryResources.delete(nextHandle.id)
    resource.id = handle.id

    handle.layoutId = artifact.layoutId
    handle.topology = artifact.topology
    handle.artifactVersion += 1
    handle.residentVersion = resource.isDrawable
      ? handle.residentVersion + 1
      : handle.residentVersion
  }

  public updateResidentGeometry(handle: GeometryHandle, binding: ResidentGeometryBinding): void {
    const resource = this.geometryResources.get(handle.id)
    if (!resource) {
      throw new Error(`Missing WebGPU geometry resource for resident geometry ${handle.id}`)
    }

    this.requireRegisteredLayout(binding.layoutId)
    this.releaseOwnedBuffers(resource)
    resource.binding = cloneResidentGeometryBinding(binding)
    resource.isDrawable = binding.vertexCount > 0
    resource.ownedVertexBuffers = []
    resource.ownedIndexBuffer = null

    handle.layoutId = binding.layoutId
    handle.topology = binding.topology
    handle.residentVersion += 1
  }

  public releaseGeometry(handle: GeometryHandle): void {
    const resource = this.geometryResources.get(handle.id)
    if (!resource) {
      return
    }

    this.releaseOwnedBuffers(resource)
    this.geometryResources.delete(handle.id)
  }

  public beginFrame(): void {}

  public executeQueue(_queue: RenderQueue, _frame: FrameRenderContext): void {}

  public endFrame(): void {}

  public getGeometryResource(id: number) {
    return this.geometryResources.get(id) ?? null
  }

  private requireRegisteredLayout(layoutId: string) {
    const layout = this.layouts.get(layoutId)
    if (!layout) {
      throw new Error(`Layout '${layoutId}' is not registered in WebGPURenderBackend`)
    }
    return layout
  }

  private releaseOwnedBuffers(resource: WebGPUGeometryResource) {
    for (const buffer of resource.ownedVertexBuffers) {
      this.destroyQueue.scheduleDestroy(buffer)
    }
    resource.ownedVertexBuffers = []
    this.destroyQueue.scheduleDestroy(resource.ownedIndexBuffer)
    resource.ownedIndexBuffer = null
  }
}
