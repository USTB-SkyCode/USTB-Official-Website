import { onUnmounted, watch, type ComputedRef } from 'vue'

export function useHostLoginPositionSync(options: {
  routeId: ComputedRef<string>
  hostReady: ComputedRef<boolean>
  motionAnchorPosition: ArrayLike<number>
  setLoginPlayerPosition: (position: readonly [number, number, number] | null) => void
}) {
  let frameId: number | null = null

  function cancel() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  function syncFrame() {
    if (options.routeId.value !== 'login' || !options.hostReady.value) {
      options.setLoginPlayerPosition(null)
      cancel()
      return
    }

    options.setLoginPlayerPosition([
      options.motionAnchorPosition[0],
      options.motionAnchorPosition[1],
      options.motionAnchorPosition[2],
    ])

    frameId = requestAnimationFrame(syncFrame)
  }

  function start() {
    if (frameId !== null) return
    syncFrame()
  }

  watch(
    [options.routeId, options.hostReady],
    ([nextRouteId, ready]) => {
      if (nextRouteId !== 'login' || !ready) {
        cancel()
        options.setLoginPlayerPosition(null)
        return
      }
      start()
    },
    { immediate: true },
  )

  onUnmounted(() => {
    options.setLoginPlayerPosition(null)
    cancel()
  })
}
