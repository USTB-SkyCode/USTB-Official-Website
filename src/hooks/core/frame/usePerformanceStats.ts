import { ref, readonly } from 'vue'
import type { PerformanceSnapshot } from '@/engine/debug/runtimeDebugFormatter'

/**
 * @file usePerformanceStats.ts
 * @brief 性能统计 Hook
 * @description 负责计算 FPS，以及使用 WebGL 扩展统计 GPU 耗时。
 */
export function usePerformanceStats() {
  const realFps = ref(0)
  const performanceSnapshot = ref<PerformanceSnapshot>({
    avgCpuMs: 0,
    cpuFps: 0,
    avgGpuMs: null,
    gpuFps: null,
    hasGpuTiming: false,
  })

  const CPU_HISTORY_WINDOW = 60000
  const GPU_HISTORY_WINDOW = 60000
  const FPS_HISTORY_WINDOW = 1000

  type TimedSample = { time: number; value: number }
  type PendingQuery = { query: WebGLQuery; startTime: number }

  const cpuSamples: TimedSample[] = []
  const gpuSamples: TimedSample[] = []
  const frameTimeSamples: TimedSample[] = []
  const pendingGpuQueries: PendingQuery[] = []

  let lastCpuFrameMs = 0
  let lastGpuFrameMs = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let timerQueryExt: any | null = null
  let glContext: WebGL2RenderingContext | null = null
  let gpuQuery: WebGLQuery | null = null

  function initGpuTimer(gl: WebGL2RenderingContext) {
    glContext = gl
    timerQueryExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    pendingGpuQueries.length = 0
    gpuSamples.length = 0
  }

  function pushSample(samples: TimedSample[], windowMs: number, sample: TimedSample) {
    samples.push(sample)
    const threshold = sample.time - windowMs
    while (samples.length && samples[0].time < threshold) {
      samples.shift()
    }
  }

  function computeAverage(samples: TimedSample[]): number {
    if (!samples.length) return 0
    let sum = 0
    for (const s of samples) sum += s.value
    return sum / samples.length
  }

  function updatePerformanceSnapshot() {
    const avgCpuMs = computeAverage(cpuSamples)
    const cpuFps = avgCpuMs > 0 ? 1000 / avgCpuMs : 0
    const hasGpuTiming = timerQueryExt !== null && gpuSamples.length > 0
    const avgGpuMs = hasGpuTiming ? computeAverage(gpuSamples) : 0
    const gpuFps = avgGpuMs > 0 ? 1000 / avgGpuMs : 0

    performanceSnapshot.value = {
      avgCpuMs,
      cpuFps,
      avgGpuMs: hasGpuTiming ? avgGpuMs : null,
      gpuFps: hasGpuTiming ? gpuFps : null,
      hasGpuTiming,
    }
  }

  function beginFrame() {
    if (!glContext || !timerQueryExt) return

    const gl = glContext
    const disjoint = gl.getParameter(timerQueryExt.GPU_DISJOINT_EXT)

    while (pendingGpuQueries.length > 0) {
      const info = pendingGpuQueries[0]
      const query = info.query
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
      if (!available) break

      const elapsedNs = gl.getQueryParameter(query, gl.QUERY_RESULT) as number
      if (!disjoint && elapsedNs > 0) {
        lastGpuFrameMs = elapsedNs / 1e6
        pushSample(gpuSamples, GPU_HISTORY_WINDOW, {
          time: info.startTime,
          value: lastGpuFrameMs,
        })
        updatePerformanceSnapshot()
      }

      gl.deleteQuery(query)
      pendingGpuQueries.shift()
    }

    gpuQuery = gl.createQuery()
    if (gpuQuery) {
      gl.beginQuery(timerQueryExt.TIME_ELAPSED_EXT, gpuQuery)
    }
  }

  function endFrame(frameStart: number, dt: number) {
    if (dt > 0) {
      pushSample(frameTimeSamples, FPS_HISTORY_WINDOW, { time: frameStart, value: dt })
      const avgFrameTime = computeAverage(frameTimeSamples)
      realFps.value = avgFrameTime > 0 ? Math.round(1000 / avgFrameTime) : 0
    }

    if (glContext && timerQueryExt && gpuQuery) {
      glContext.endQuery(timerQueryExt.TIME_ELAPSED_EXT)
      pendingGpuQueries.push({ query: gpuQuery, startTime: frameStart })
    }

    lastCpuFrameMs = performance.now() - frameStart
    pushSample(cpuSamples, CPU_HISTORY_WINDOW, { time: frameStart, value: lastCpuFrameMs })
    updatePerformanceSnapshot()
  }

  function dispose() {
    if (glContext) {
      while (pendingGpuQueries.length > 0) {
        const info = pendingGpuQueries.shift()
        if (info) glContext.deleteQuery(info.query)
      }
    }
    glContext = null
    timerQueryExt = null
    gpuQuery = null
    frameTimeSamples.length = 0
    cpuSamples.length = 0
    gpuSamples.length = 0
    performanceSnapshot.value = {
      avgCpuMs: 0,
      cpuFps: 0,
      avgGpuMs: null,
      gpuFps: null,
      hasGpuTiming: false,
    }
  }

  return {
    realFps: readonly(realFps),
    performanceSnapshot: readonly(performanceSnapshot),
    initGpuTimer,
    beginFrame,
    endFrame,
    dispose,
  }
}
