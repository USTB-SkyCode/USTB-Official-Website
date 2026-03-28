import { GAME_CONFIG } from '@/engine/config'
import type { ChunkArtifactRenderBridge } from '@/engine/render/terrain/runtime/ChunkArtifactRenderBridge'
import { CSMCalculator } from '@/engine/render/core/lighting/CSMCalculator'
import type { ChunkDirector } from '@/engine/world/chunk/system/ChunkDirector'
import { useRuntimeTelemetry } from './useRuntimeTelemetry'

type UseFrameRuntimeOptions = {
  chunkManager: ChunkDirector
  csmCalculator: CSMCalculator
  enableRuntimeDebug: boolean
  artifactRuntimeConfig: typeof GAME_CONFIG.RENDER.ARTIFACT_RUNTIME
  loadedChunkCount: { value: number }
  updateChunks: (chunkX: number, chunkZ: number, loadDistance: number) => Promise<unknown> | void
  fixedUpdateCamera: (dtSeconds: number) => void
  updateCameraAnimation: (dtMs: number) => void
  dayNightCycle: { update: (dtMs: number) => void }
  motionAnchorPosition: ArrayLike<number>
  motionAnchorLookTarget: ArrayLike<number>
  renderCameraViewPosition: ArrayLike<number>
  renderCameraViewLookTarget: ArrayLike<number>
  getSessionChunkLoadDistance: () => number
  getArtifactRenderBridge: () => ChunkArtifactRenderBridge | null
}

const CSM_REFRESH_INTERVAL_MS = 33
const CSM_POSITION_EPSILON_SQ = 1.0
const CSM_DIRECTION_DOT_THRESHOLD = 0.9995
const CSM_SUN_DIRECTION_DOT_THRESHOLD = 0.99995
const LIGHT_SYNC_INTERVAL_MS = 50
const LIGHT_SYNC_POSITION_EPSILON_SQ = 2.25
const LIGHT_SYNC_DIRECTION_DOT_THRESHOLD = 0.996
const CHUNK_WARMUP_MAX_MS = 4000
const CHUNK_WARMUP_INTERVAL_MS = 48
const CHUNK_WARMUP_TARGET_COUNT = 144
const FIXED_STEP_MS = 1000 / 60
const MAX_ACCUMULATOR_MS = 100

export function useFrameRuntime(options: UseFrameRuntimeOptions) {
  let isWorkerReady = false
  let lastChunkUpdate = 0
  let lastCsmSyncTime = -1
  const lastCsmPosition = new Float32Array(3)
  const lastCsmForward = new Float32Array([0, 0, -1])
  const lastCsmSunDirection = new Float32Array([0, -1, 0])
  let hasCsmSnapshot = false
  let lastLightSyncTime = -1
  const lastLightSyncPosition = new Float32Array(3)
  const lastLightSyncForward = new Float32Array([0, 0, -1])
  let hasLightSyncSnapshot = false
  const pendingArtifactUploads = new Map<
    string,
    {
      chunkX: number
      chunkZ: number
      artifact: Parameters<ChunkArtifactRenderBridge['upsertChunkArtifact']>[2]
      dirtySectionYs?: number[]
    }
  >()
  const pendingArtifactUploadOrder: string[] = []
  let accumulator = 0
  let chunkWarmupUntil = 0
  let lastChunkWarmupRequest = 0

  const runtimeTelemetry = useRuntimeTelemetry({
    chunkManager: options.chunkManager,
    csmCalculator: options.csmCalculator,
    enableRuntimeDebug: options.enableRuntimeDebug,
  })

  function setWorkerReady(ready: boolean) {
    isWorkerReady = ready
  }

  function beginChunkWarmup(durationMs = CHUNK_WARMUP_MAX_MS) {
    const now = performance.now()
    chunkWarmupUntil = Math.max(chunkWarmupUntil, now + durationMs)
    lastChunkWarmupRequest = 0
  }

  function requestChunkRefreshNow(
    position: ArrayLike<number> = options.motionAnchorPosition,
    lookTarget: ArrayLike<number> = options.motionAnchorLookTarget,
  ) {
    if (!isWorkerReady) {
      return
    }

    const cx = Math.floor((position[0] ?? 0) / GAME_CONFIG.CHUNK.SIZE)
    const cz = Math.floor((position[2] ?? 0) / GAME_CONFIG.CHUNK.SIZE)
    const dirX = (lookTarget[0] ?? 0) - (position[0] ?? 0)
    const dirZ = (lookTarget[2] ?? 0) - (position[2] ?? 0)
    const loadDistance = options.getSessionChunkLoadDistance()

    options.chunkManager.applyRuntimeLoadDistance(loadDistance)
    options.chunkManager.setCameraDirection(dirX, dirZ)
    void options.updateChunks(cx, cz, loadDistance)
  }

  function fixedUpdate(dtMs: number) {
    options.fixedUpdateCamera(dtMs / 1000)
    options.updateCameraAnimation(dtMs)
    options.dayNightCycle.update(dtMs)

    runtimeTelemetry.refreshFixedStats(performance.now())

    const now = performance.now()

    if (
      isWorkerReady &&
      now < chunkWarmupUntil &&
      options.loadedChunkCount.value < CHUNK_WARMUP_TARGET_COUNT &&
      now - lastChunkWarmupRequest >= CHUNK_WARMUP_INTERVAL_MS
    ) {
      requestChunkRefreshNow()
      lastChunkWarmupRequest = now
    }

    if (isWorkerReady && now - lastChunkUpdate > GAME_CONFIG.CHUNK.UPDATE_INTERVAL) {
      requestChunkRefreshNow()
      lastChunkUpdate = now
    }
  }

  function advanceFixedSteps(dtMs: number) {
    accumulator += dtMs
    if (accumulator > MAX_ACCUMULATOR_MS) {
      accumulator = MAX_ACCUMULATOR_MS
    }

    while (accumulator >= FIXED_STEP_MS) {
      fixedUpdate(FIXED_STEP_MS)
      accumulator -= FIXED_STEP_MS
    }

    return accumulator / FIXED_STEP_MS
  }

  function getChunkKey(chunkX: number, chunkZ: number) {
    return `${chunkX},${chunkZ}`
  }

  function enqueueArtifactUpload(
    chunkX: number,
    chunkZ: number,
    artifact: Parameters<ChunkArtifactRenderBridge['upsertChunkArtifact']>[2],
    dirtySectionYs?: number[],
  ) {
    const chunkKey = getChunkKey(chunkX, chunkZ)
    if (!pendingArtifactUploads.has(chunkKey)) {
      pendingArtifactUploadOrder.push(chunkKey)
    }
    pendingArtifactUploads.set(chunkKey, {
      chunkX,
      chunkZ,
      artifact,
      dirtySectionYs,
    })
  }

  function discardPendingArtifactUpload(chunkX: number, chunkZ: number) {
    pendingArtifactUploads.delete(getChunkKey(chunkX, chunkZ))
  }

  function bindChunkRuntimeCallbacks(onWorkerReady: () => void) {
    options.chunkManager.onWorkerInit = onWorkerReady

    options.chunkManager.onChunkLoaded = (chunkX, chunkZ, geometry, artifact, dirtySectionYs) => {
      runtimeTelemetry.recordChunkLoaded(dirtySectionYs)

      if (artifact && options.getArtifactRenderBridge()) {
        enqueueArtifactUpload(chunkX, chunkZ, artifact, dirtySectionYs)
      }

      if (!artifact) {
        console.warn(
          '[useEngine] Missing chunk artifact for terrain chunk',
          chunkX,
          chunkZ,
          geometry,
        )
      }
    }

    options.chunkManager.onChunkUnloaded = (x, z) => {
      discardPendingArtifactUpload(x, z)
      options.getArtifactRenderBridge()?.removeChunk(x, z)
    }
  }

  function collectPendingArtifactUploadBatch(batchSize: number) {
    if (pendingArtifactUploadOrder.length === 0 || batchSize <= 0) {
      return [] as Array<{
        chunkX: number
        chunkZ: number
        artifact: Parameters<ChunkArtifactRenderBridge['upsertChunkArtifact']>[2]
        dirtySectionYs?: number[]
      }>
    }

    const artifactRenderBridge = options.getArtifactRenderBridge()
    const visibleChunkKeys = artifactRenderBridge ? artifactRenderBridge.getVisibleChunkKeys() : []
    const visibleChunkKeySet = new Set(visibleChunkKeys)
    const cameraX = options.renderCameraViewPosition[0]
    const cameraZ = options.renderCameraViewPosition[2]
    const candidates: Array<{
      chunkKey: string
      pending: {
        chunkX: number
        chunkZ: number
        artifact: Parameters<ChunkArtifactRenderBridge['upsertChunkArtifact']>[2]
        dirtySectionYs?: number[]
      }
      order: number
      visiblePriority: number
      distanceSq: number
    }> = []

    for (let index = 0; index < pendingArtifactUploadOrder.length; index++) {
      const chunkKey = pendingArtifactUploadOrder[index]
      const pending = pendingArtifactUploads.get(chunkKey)
      if (!pending) {
        continue
      }

      const centerX = pending.chunkX * 16 + 8
      const centerZ = pending.chunkZ * 16 + 8
      const dx = centerX - cameraX
      const dz = centerZ - cameraZ
      candidates.push({
        chunkKey,
        pending,
        order: index,
        visiblePriority: visibleChunkKeySet.has(chunkKey) ? 0 : 1,
        distanceSq: dx * dx + dz * dz,
      })
    }

    candidates.sort((left, right) => {
      const visibleDelta = left.visiblePriority - right.visiblePriority
      if (visibleDelta !== 0) {
        return visibleDelta
      }

      const distanceDelta = left.distanceSq - right.distanceSq
      if (distanceDelta !== 0) {
        return distanceDelta
      }

      return left.order - right.order
    })

    const selectedKeys = new Set(
      candidates.slice(0, batchSize).map(candidate => candidate.chunkKey),
    )

    const batch: Array<{
      chunkX: number
      chunkZ: number
      artifact: Parameters<ChunkArtifactRenderBridge['upsertChunkArtifact']>[2]
      dirtySectionYs?: number[]
    }> = []
    const nextOrder: string[] = []

    for (const chunkKey of pendingArtifactUploadOrder) {
      const pending = pendingArtifactUploads.get(chunkKey)
      if (!pending) {
        continue
      }

      if (selectedKeys.has(chunkKey)) {
        pendingArtifactUploads.delete(chunkKey)
        batch.push(pending)
        selectedKeys.delete(chunkKey)
      } else {
        nextOrder.push(chunkKey)
      }
    }

    pendingArtifactUploadOrder.length = 0
    pendingArtifactUploadOrder.push(...nextOrder)

    return batch
  }

  function processPendingArtifactUploads() {
    const artifactRenderBridge = options.getArtifactRenderBridge()
    if (!artifactRenderBridge) {
      return { processedCount: 0, totalMs: 0 }
    }

    const backlog = pendingArtifactUploads.size
    const dynamicBudgetMs = Math.min(
      options.artifactRuntimeConfig.UPLOAD_BUDGET_MAX_MS,
      options.artifactRuntimeConfig.UPLOAD_BUDGET_BASE_MS +
        Math.floor(backlog / options.artifactRuntimeConfig.UPLOAD_BUDGET_BACKLOG_STEP) * 1.5,
    )
    const start = performance.now()
    let processedCount = 0
    let processedBatches = 0
    const adaptiveBatchSize = options.artifactRuntimeConfig.UPLOAD_BATCH_SIZE

    while (pendingArtifactUploadOrder.length > 0) {
      if (processedBatches >= options.artifactRuntimeConfig.UPLOAD_MAX_BATCHES_PER_FRAME) {
        break
      }

      if (processedCount > 0 && performance.now() - start >= dynamicBudgetMs) {
        break
      }

      const batch = collectPendingArtifactUploadBatch(adaptiveBatchSize)

      if (batch.length === 0) {
        break
      }

      artifactRenderBridge.upsertChunkArtifacts(batch)
      processedCount += batch.length
      processedBatches += 1
    }

    artifactRenderBridge.dispatchResidentFrameBudget({
      frameBudgetMs: Math.max(0, dynamicBudgetMs - (performance.now() - start)),
      hadIngressWork: processedCount > 0,
      pendingChunkUploads: pendingArtifactUploads.size,
      policy: {
        commitBaseRegionsPerFrame: options.artifactRuntimeConfig.COMMIT_BASE_REGIONS_PER_FRAME,
        commitMaxRegionsPerFrame: options.artifactRuntimeConfig.COMMIT_MAX_REGIONS_PER_FRAME,
        commitBacklogStep: options.artifactRuntimeConfig.COMMIT_BACKLOG_STEP,
        uploadExecBytesBase: options.artifactRuntimeConfig.UPLOAD_EXEC_BYTES_BASE,
        uploadExecBytesMax: options.artifactRuntimeConfig.UPLOAD_EXEC_BYTES_MAX,
        uploadExecBytesBacklogStep: options.artifactRuntimeConfig.UPLOAD_EXEC_BYTES_BACKLOG_STEP,
        uploadExecMaxRegionsPerFrame:
          options.artifactRuntimeConfig.UPLOAD_EXEC_MAX_REGIONS_PER_FRAME,
        rebuildMinTargetMs: options.artifactRuntimeConfig.REBUILD_MIN_TARGET_MS,
        rebuildTargetMs: options.artifactRuntimeConfig.REBUILD_TARGET_MS,
        rebuildMaxPassesPerFrame: options.artifactRuntimeConfig.REBUILD_MAX_PASSES_PER_FRAME,
        commitQueueSoftRegionLimit: options.artifactRuntimeConfig.COMMIT_QUEUE_SOFT_REGION_LIMIT,
        commitQueueHardRegionLimit: options.artifactRuntimeConfig.COMMIT_QUEUE_HARD_REGION_LIMIT,
      },
    })

    return {
      processedCount,
      totalMs: performance.now() - start,
    }
  }

  function shouldRefreshCsm(now: number, sunDirection: Float32Array) {
    if (!hasCsmSnapshot) {
      return true
    }

    if (now - lastCsmSyncTime >= CSM_REFRESH_INTERVAL_MS) {
      return true
    }

    const dx = options.renderCameraViewPosition[0] - lastCsmPosition[0]
    const dy = options.renderCameraViewPosition[1] - lastCsmPosition[1]
    const dz = options.renderCameraViewPosition[2] - lastCsmPosition[2]
    if (dx * dx + dy * dy + dz * dz >= CSM_POSITION_EPSILON_SQ) {
      return true
    }

    const fx = options.renderCameraViewLookTarget[0] - options.renderCameraViewPosition[0]
    const fy = options.renderCameraViewLookTarget[1] - options.renderCameraViewPosition[1]
    const fz = options.renderCameraViewLookTarget[2] - options.renderCameraViewPosition[2]
    const fLen = Math.hypot(fx, fy, fz)
    if (fLen > 1e-5) {
      const invLen = 1 / fLen
      const nx = fx * invLen
      const ny = fy * invLen
      const nz = fz * invLen
      const dot = nx * lastCsmForward[0] + ny * lastCsmForward[1] + nz * lastCsmForward[2]
      if (dot < CSM_DIRECTION_DOT_THRESHOLD) {
        return true
      }
    }

    const sunLen = Math.hypot(sunDirection[0], sunDirection[1], sunDirection[2])
    if (sunLen > 1e-5) {
      const invSunLen = 1 / sunLen
      const sx = sunDirection[0] * invSunLen
      const sy = sunDirection[1] * invSunLen
      const sz = sunDirection[2] * invSunLen
      const sunDot =
        sx * lastCsmSunDirection[0] + sy * lastCsmSunDirection[1] + sz * lastCsmSunDirection[2]
      if (sunDot < CSM_SUN_DIRECTION_DOT_THRESHOLD) {
        return true
      }
    }

    return false
  }

  function commitCsmSnapshot(now: number, sunDirection: Float32Array) {
    lastCsmSyncTime = now
    lastCsmPosition[0] = options.renderCameraViewPosition[0]
    lastCsmPosition[1] = options.renderCameraViewPosition[1]
    lastCsmPosition[2] = options.renderCameraViewPosition[2]

    const fx = options.renderCameraViewLookTarget[0] - options.renderCameraViewPosition[0]
    const fy = options.renderCameraViewLookTarget[1] - options.renderCameraViewPosition[1]
    const fz = options.renderCameraViewLookTarget[2] - options.renderCameraViewPosition[2]
    const fLen = Math.hypot(fx, fy, fz)
    if (fLen > 1e-5) {
      const invLen = 1 / fLen
      lastCsmForward[0] = fx * invLen
      lastCsmForward[1] = fy * invLen
      lastCsmForward[2] = fz * invLen
    }

    const sunLen = Math.hypot(sunDirection[0], sunDirection[1], sunDirection[2])
    if (sunLen > 1e-5) {
      const invSunLen = 1 / sunLen
      lastCsmSunDirection[0] = sunDirection[0] * invSunLen
      lastCsmSunDirection[1] = sunDirection[1] * invSunLen
      lastCsmSunDirection[2] = sunDirection[2] * invSunLen
    }

    hasCsmSnapshot = true
  }

  function shouldRefreshLighting(now: number, uploadsProcessed: number) {
    if (!hasLightSyncSnapshot) {
      return true
    }

    if (uploadsProcessed > 0) {
      return true
    }

    if (now - lastLightSyncTime >= LIGHT_SYNC_INTERVAL_MS) {
      return true
    }

    const dx = options.renderCameraViewPosition[0] - lastLightSyncPosition[0]
    const dy = options.renderCameraViewPosition[1] - lastLightSyncPosition[1]
    const dz = options.renderCameraViewPosition[2] - lastLightSyncPosition[2]
    if (dx * dx + dy * dy + dz * dz >= LIGHT_SYNC_POSITION_EPSILON_SQ) {
      return true
    }

    const fx = options.renderCameraViewLookTarget[0] - options.renderCameraViewPosition[0]
    const fy = options.renderCameraViewLookTarget[1] - options.renderCameraViewPosition[1]
    const fz = options.renderCameraViewLookTarget[2] - options.renderCameraViewPosition[2]
    const len = Math.hypot(fx, fy, fz)
    if (len <= 1e-5) {
      return false
    }

    const invLen = 1 / len
    const nx = fx * invLen
    const ny = fy * invLen
    const nz = fz * invLen
    const dot =
      nx * lastLightSyncForward[0] + ny * lastLightSyncForward[1] + nz * lastLightSyncForward[2]
    return dot < LIGHT_SYNC_DIRECTION_DOT_THRESHOLD
  }

  function commitLightSyncSnapshot(now: number) {
    lastLightSyncTime = now
    lastLightSyncPosition[0] = options.renderCameraViewPosition[0]
    lastLightSyncPosition[1] = options.renderCameraViewPosition[1]
    lastLightSyncPosition[2] = options.renderCameraViewPosition[2]

    const fx = options.renderCameraViewLookTarget[0] - options.renderCameraViewPosition[0]
    const fy = options.renderCameraViewLookTarget[1] - options.renderCameraViewPosition[1]
    const fz = options.renderCameraViewLookTarget[2] - options.renderCameraViewPosition[2]
    const len = Math.hypot(fx, fy, fz)
    if (len > 1e-5) {
      const invLen = 1 / len
      lastLightSyncForward[0] = fx * invLen
      lastLightSyncForward[1] = fy * invLen
      lastLightSyncForward[2] = fz * invLen
    }

    hasLightSyncSnapshot = true
  }

  function getPendingArtifactUploadCount() {
    return pendingArtifactUploads.size
  }

  function disposeFrameRuntimeState() {
    hasCsmSnapshot = false
    lastCsmSyncTime = -1
    hasLightSyncSnapshot = false
    lastLightSyncTime = -1
    pendingArtifactUploads.clear()
    pendingArtifactUploadOrder.length = 0
    runtimeTelemetry.reset()
    lastChunkUpdate = 0
  }

  function rebuildFrameRuntimeState() {
    hasCsmSnapshot = false
    lastCsmSyncTime = -1
    hasLightSyncSnapshot = false
    lastLightSyncTime = -1
    pendingArtifactUploads.clear()
    pendingArtifactUploadOrder.length = 0
    lastChunkUpdate = 0
  }

  return {
    runtimeTelemetry,
    setWorkerReady,
    bindChunkRuntimeCallbacks,
    beginChunkWarmup,
    requestChunkRefreshNow,
    advanceFixedSteps,
    processPendingArtifactUploads,
    shouldRefreshCsm,
    commitCsmSnapshot,
    shouldRefreshLighting,
    commitLightSyncSnapshot,
    getPendingArtifactUploadCount,
    disposeFrameRuntimeState,
    rebuildFrameRuntimeState,
  }
}
