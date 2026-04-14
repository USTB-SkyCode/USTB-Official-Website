import { ref, readonly } from 'vue'
import type { CSMCalculator } from '@/engine/render/core/lighting/CSMCalculator'
import type { EngineRenderer } from '@/engine/render/EngineRenderer'
import type { ChunkManager } from '@/engine/world/chunk'
import { GAME_CONFIG } from '@/engine/config'
import type { RuntimeDebugSnapshot } from '@/engine/debug/runtimeDebugFormatter'

type PlayerCalibrationSummary = {
  skinId: string
  yawDegrees: number
  localBoundsSize: readonly [number, number, number]
  modelPosition: readonly [number, number, number]
  partCount: number
}

type WorkerStatsSnapshot = ReturnType<ChunkManager['getWorkerStats']>
type StorageStatsSnapshot = ReturnType<ChunkManager['getStorageStats']>

const EMPTY_STORAGE_STATS: StorageStatsSnapshot = {
  distribution: { '16KB': 0, '32KB': 0, '64KB': 0, '>64KB': 0 },
  sab: { usedBytes: 0, capacityBytes: 0, usedSlots: 0, totalSlots: 0 },
  heap: { total: 0, used: 0, free: 0, frag: 0, maxContig: 0 },
}

type UpdateFrameSnapshotParams = {
  dt: number
  renderMotionAnchorPosition: ArrayLike<number>
  renderCameraEyePosition: ArrayLike<number>
  renderCameraViewPosition: ArrayLike<number>
  dayNightTimeHours: number
  renderer: EngineRenderer
  pendingChunkUploads: number
  artifactVisibleBreakdown: string
  csmMs: number
  lightsMs: number
  meshUploadMs: number
  cullMs: number
  renderMs: number
  player: PlayerCalibrationSummary | null
}

type UseRuntimeTelemetryOptions = {
  chunkManager: ChunkManager
  csmCalculator: CSMCalculator
  enableRuntimeDebug: boolean
}

function parseVisibleBreakdown(value: string) {
  const [opaque, decal, transparent] = value.split('/').map(part => Number(part) || 0)
  return { opaque, decal, transparent }
}

export function useRuntimeTelemetry(options: UseRuntimeTelemetryOptions) {
  const { chunkManager, csmCalculator, enableRuntimeDebug } = options

  const workerStatsRef = ref<WorkerStatsSnapshot>([])
  const storageStatsRef = ref<StorageStatsSnapshot>(EMPTY_STORAGE_STATS)
  const runtimeDebugSnapshotRef = ref<RuntimeDebugSnapshot | null>(null)

  let chunkDeltaAccum = 0
  let chunkTimeAccum = 0
  let chunkRate = 0
  let chunkLoadedCountAccum = 0
  let chunkUpdatedCountAccum = 0
  let chunkLoadedRate = 0
  let chunkUpdatedRate = 0
  let lastStatsUpdate = 0

  function refreshFixedStats(now: number) {
    if (now - lastStatsUpdate <= 1000) {
      return
    }

    workerStatsRef.value = chunkManager.getWorkerStats()
    storageStatsRef.value = chunkManager.getStorageStats()
    lastStatsUpdate = now
  }

  function recordChunkLoaded(dirtySectionYs?: number[]) {
    if (dirtySectionYs && dirtySectionYs.length > 0) {
      chunkUpdatedCountAccum += 1
      return
    }

    chunkLoadedCountAccum += 1
  }

  function updateFrameSnapshot(params: UpdateFrameSnapshotParams) {
    if (!enableRuntimeDebug) {
      runtimeDebugSnapshotRef.value = null
      return
    }

    const drawStats = params.renderer.getLastFrameDrawCallStats()

    chunkTimeAccum += params.dt
    if (chunkTimeAccum >= 1000) {
      chunkRate = chunkDeltaAccum / (chunkTimeAccum / 1000)
      chunkLoadedRate = chunkLoadedCountAccum / (chunkTimeAccum / 1000)
      chunkUpdatedRate = chunkUpdatedCountAccum / (chunkTimeAccum / 1000)
      chunkDeltaAccum = 0
      chunkLoadedCountAccum = 0
      chunkUpdatedCountAccum = 0
      chunkTimeAccum = 0
    }

    const artifactStats = chunkManager.getArtifactStats()
    const dirtyRemeshStats = chunkManager.getDirtyRemeshStats()
    let meshCompletedPerSec = 0
    let meshArenaDeliveredPerSec = 0
    let meshTransferableDeliveredPerSec = 0
    let arenaPoolActiveCount = 0
    let arenaPooledCount = 0
    let arenaPoolHitRateWeightedSum = 0
    let arenaPoolHitRateWeightDenom = 0
    let avgMeshTimeWeightedSum = 0
    let avgMeshWasmWeightedSum = 0
    let avgMeshNormalizeWeightedSum = 0
    let avgMeshBuildWeightedSum = 0
    for (const stats of workerStatsRef.value) {
      meshCompletedPerSec += stats.meshCompletedPerSec
      meshArenaDeliveredPerSec += stats.meshArenaDeliveredPerSec
      meshTransferableDeliveredPerSec += stats.meshTransferableDeliveredPerSec
      arenaPoolActiveCount += stats.arenaPoolActiveCount
      arenaPooledCount += stats.arenaPooledCount
      const workerArenaOps = stats.meshArenaDeliveredPerSec
      arenaPoolHitRateWeightedSum += stats.arenaPoolHitRate * workerArenaOps
      arenaPoolHitRateWeightDenom += workerArenaOps
      avgMeshTimeWeightedSum += stats.avgMeshTimeMs * stats.meshCompletedPerSec
      avgMeshWasmWeightedSum += stats.avgMeshWasmTimeMs * stats.meshCompletedPerSec
      avgMeshNormalizeWeightedSum += stats.avgMeshNormalizeTimeMs * stats.meshCompletedPerSec
      avgMeshBuildWeightedSum += stats.avgMeshBuildTimeMs * stats.meshCompletedPerSec
    }

    const visible = parseVisibleBreakdown(params.artifactVisibleBreakdown)
    const shadowMeta = csmCalculator.getDebugMeta()[0]

    runtimeDebugSnapshotRef.value = {
      scene: {
        renderMotionAnchorPosition: [
          Math.round(params.renderMotionAnchorPosition[0]),
          Math.round(params.renderMotionAnchorPosition[1]),
          Math.round(params.renderMotionAnchorPosition[2]),
        ],
        renderCameraEyePosition: [
          Math.round(params.renderCameraEyePosition[0]),
          Math.round(params.renderCameraEyePosition[1]),
          Math.round(params.renderCameraEyePosition[2]),
        ],
        renderCameraViewPosition: [
          Math.round(params.renderCameraViewPosition[0]),
          Math.round(params.renderCameraViewPosition[1]),
          Math.round(params.renderCameraViewPosition[2]),
        ],
        timeHours: params.dayNightTimeHours,
      },
      streaming: {
        chunkLoadedRate,
        chunkUpdatedRate,
        chunkGrowthRate: chunkRate,
        activeRequests: chunkManager.getActiveRequestCount(),
        queuedRequests: chunkManager.getQueuedRequestCount(),
        currentQueue: chunkManager.getCurrentQueueCount(),
        pendingChunkUploads: params.pendingChunkUploads,
        artifactChunkCount: artifactStats.chunkCount,
        artifactSectionCount: artifactStats.sectionCount,
        artifactItemCount: artifactStats.itemCount,
        dirtyChunkCount: dirtyRemeshStats.chunkCount,
        dirtySectionCount: dirtyRemeshStats.sectionCount,
      },
      worker: {
        meshCompletedPerSec,
        meshArenaDeliveredPerSec,
        meshTransferableDeliveredPerSec,
        arenaPoolActiveCount,
        arenaPooledCount,
        arenaPoolHitRate:
          arenaPoolHitRateWeightDenom > 0
            ? arenaPoolHitRateWeightedSum / arenaPoolHitRateWeightDenom
            : 0,
        avgMeshTimeMs: meshCompletedPerSec > 0 ? avgMeshTimeWeightedSum / meshCompletedPerSec : 0,
        avgMeshWasmTimeMs:
          meshCompletedPerSec > 0 ? avgMeshWasmWeightedSum / meshCompletedPerSec : 0,
        avgMeshNormalizeTimeMs:
          meshCompletedPerSec > 0 ? avgMeshNormalizeWeightedSum / meshCompletedPerSec : 0,
        avgMeshBuildTimeMs:
          meshCompletedPerSec > 0 ? avgMeshBuildWeightedSum / meshCompletedPerSec : 0,
      },
      render: {
        visibleOpaqueCount: visible.opaque,
        visibleDecalCount: visible.decal,
        visibleTransparentCount: visible.transparent,
        drawStats,
        totalLightCount: Math.floor(params.renderer.lights.length / 8),
        selectedLightCount: params.renderer.lightManager.numLights,
        csmMs: params.csmMs,
        lightsMs: params.lightsMs,
        meshUploadMs: params.meshUploadMs,
        cullMs: params.cullMs,
        renderMs: params.renderMs,
        shadow:
          shadowMeta == null
            ? null
            : {
                resolution: GAME_CONFIG.RENDER.SHADOW.MAP_SIZE,
                texelSize: shadowMeta.texelSize,
                near: shadowMeta.near,
                far: shadowMeta.far,
                range: shadowMeta.range,
              },
      },
      player:
        params.player == null
          ? null
          : {
              skinId: params.player.skinId,
              yawDegrees: params.player.yawDegrees,
              localBoundsSize: params.player.localBoundsSize,
              modelPosition: params.player.modelPosition,
              partCount: params.player.partCount,
            },
    }
  }

  function reset() {
    workerStatsRef.value = []
    storageStatsRef.value = EMPTY_STORAGE_STATS
    runtimeDebugSnapshotRef.value = null
    chunkDeltaAccum = 0
    chunkTimeAccum = 0
    chunkRate = 0
    chunkLoadedCountAccum = 0
    chunkUpdatedCountAccum = 0
    chunkLoadedRate = 0
    chunkUpdatedRate = 0
    lastStatsUpdate = 0
  }

  return {
    workerStats: readonly(workerStatsRef),
    storageStats: readonly(storageStatsRef),
    runtimeDebugSnapshot: readonly(runtimeDebugSnapshotRef),
    refreshFixedStats,
    recordChunkLoaded,
    updateFrameSnapshot,
    reset,
  }
}
