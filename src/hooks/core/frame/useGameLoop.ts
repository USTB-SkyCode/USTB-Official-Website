import { ref, onUnmounted, readonly } from 'vue'

/**
 * @file useGameLoop.ts
 * @brief 游戏循环 Hook
 * @description 封装 requestAnimationFrame 循环，提供启动、停止和帧回调功能。
 */
export function useGameLoop(onFrame: (dt: number, time: number) => void) {
  const isRunning = ref(false)
  let animationId: number | null = null
  let lastFrameTime = 0

  /**
   * 循环体
   */
  const loop = (timestamp: number) => {
    if (!isRunning.value) return

    if (lastFrameTime === 0) {
      lastFrameTime = timestamp
    }

    const dt = timestamp - lastFrameTime
    lastFrameTime = timestamp

    onFrame(dt, timestamp)

    animationId = requestAnimationFrame(loop)
  }

  /**
   * 启动循环
   */
  function start() {
    if (isRunning.value) return
    isRunning.value = true
    lastFrameTime = performance.now()
    animationId = requestAnimationFrame(loop)
  }

  /**
   * 停止循环
   */
  function stop() {
    isRunning.value = false
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    lastFrameTime = 0
  }

  onUnmounted(() => {
    stop()
  })

  return {
    isRunning: readonly(isRunning),
    start,
    stop,
  }
}
