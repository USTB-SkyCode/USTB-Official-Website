type WebGPUDeferredDestroyable = {
  destroy(): void
}

export class WebGPUDeferredDestroyQueue {
  private readonly scheduledResources = new WeakSet<object>()
  private pendingResources: WebGPUDeferredDestroyable[] = []
  private draining = false

  constructor(private readonly device: GPUDevice) {}

  public scheduleDestroy(resource: WebGPUDeferredDestroyable | null | undefined) {
    if (!resource) {
      return
    }

    const resourceKey = resource as unknown as object
    if (this.scheduledResources.has(resourceKey)) {
      return
    }

    this.scheduledResources.add(resourceKey)
    this.pendingResources.push(resource)
    this.drain()
  }

  private drain() {
    if (this.draining || this.pendingResources.length === 0) {
      return
    }

    this.draining = true
    const batch = this.pendingResources.splice(0)

    void this.device.queue
      .onSubmittedWorkDone()
      .catch(() => undefined)
      .then(() => {
        for (const resource of batch) {
          try {
            resource.destroy()
          } catch {
            // Ignore late destroy failures during device loss/teardown.
          }
        }
      })
      .finally(() => {
        this.draining = false
        if (this.pendingResources.length > 0) {
          this.drain()
        }
      })
  }
}

const destroyQueueByDevice = new WeakMap<GPUDevice, WebGPUDeferredDestroyQueue>()

export function getWebGPUDeferredDestroyQueue(device: GPUDevice) {
  let queue = destroyQueueByDevice.get(device)
  if (!queue) {
    queue = new WebGPUDeferredDestroyQueue(device)
    destroyQueueByDevice.set(device, queue)
  }

  return queue
}
