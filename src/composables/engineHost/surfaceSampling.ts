import { computed, onUnmounted, watch, type ComputedRef } from 'vue'
import { collectTakeoverSurfaceSnapshots } from '@/engine/takeover/TakeoverSurfaceSampling'
import { useTakeoverSurfaceStore, type TakeoverSurfaceSnapshot } from '@/stores/takeoverSurfaces'

export function useHostSurfaceSampling(options: {
  shouldReservePersistentHost: ComputedRef<boolean>
  hostReady: ComputedRef<boolean>
  routeId: ComputedRef<string>
  sceneKey: ComputedRef<string | null>
  cameraPresetKey: ComputedRef<string | null>
  pageFrameMode: ComputedRef<string>
  syncTakeoverSurfaces: (payload: {
    routeId: string | null
    sceneKey: string | null
    capturedAt: string
    revision: number
    surfaces: TakeoverSurfaceSnapshot[]
  }) => void
  clearTakeoverSurfaces: () => void
}) {
  const store = useTakeoverSurfaceStore()
  const surfaceRevision = computed(() => store.revision)
  const consumableSurfaceRevision = computed(() => store.publishedRevision)

  let sampleFrameId: number | null = null
  let mutationObserver: MutationObserver | null = null

  function cancelPendingSample() {
    if (sampleFrameId !== null) {
      cancelAnimationFrame(sampleFrameId)
      sampleFrameId = null
    }
  }

  function sampleSurfaces() {
    cancelPendingSample()

    if (!options.shouldReservePersistentHost.value) {
      store.clearAllSnapshots()
      return
    }

    store.setSnapshots({
      routeId: options.routeId.value,
      sceneKey: options.sceneKey.value,
      capturedAt: new Date().toISOString(),
      surfaces: collectTakeoverSurfaceSnapshots(),
    })
  }

  function scheduleSample() {
    if (sampleFrameId !== null) {
      return
    }

    sampleFrameId = requestAnimationFrame(() => {
      sampleFrameId = null
      sampleSurfaces()
    })
  }

  // Observe DOM changes that may affect surface rects.
  // Scope to .app-router-layer to avoid reacting to engine-host canvas mutations.
  if (typeof document !== 'undefined') {
    const observerTarget = document.querySelector('.app-router-layer') ?? document.body
    mutationObserver = new MutationObserver(() => {
      scheduleSample()
    })
    mutationObserver.observe(observerTarget, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        'class',
        'style',
        'data-frame-mode',
        'data-engine-surface-key',
        'data-engine-surface-kind',
      ],
    })
  }

  window.addEventListener('resize', scheduleSample)
  window.addEventListener('scroll', scheduleSample, true)

  watch(
    [
      options.shouldReservePersistentHost,
      options.routeId,
      options.sceneKey,
      options.cameraPresetKey,
      options.pageFrameMode,
    ],
    () => {
      scheduleSample()
    },
    { immediate: true, flush: 'post' },
  )

  watch(
    [options.shouldReservePersistentHost, options.hostReady, surfaceRevision],
    ([shouldReserve, ready]) => {
      store.syncPublishedSnapshots(shouldReserve && ready)
    },
    { immediate: true },
  )

  watch(
    [options.hostReady, consumableSurfaceRevision],
    ([ready]) => {
      if (!ready) {
        options.clearTakeoverSurfaces()
        return
      }

      options.syncTakeoverSurfaces({
        routeId: store.publishedRouteId,
        sceneKey: store.publishedSceneKey,
        capturedAt: store.publishedCapturedAt,
        revision: store.publishedRevision,
        surfaces: store.publishedSurfaces,
      })
    },
    { immediate: true },
  )

  onUnmounted(() => {
    cancelPendingSample()
    mutationObserver?.disconnect()
    store.clearAllSnapshots()
    window.removeEventListener('resize', scheduleSample)
    window.removeEventListener('scroll', scheduleSample, true)
  })

  return {
    surfaceCount: computed(() => store.surfaces.length),
    consumableSurfaceCount: computed(() => store.publishedSurfaces.length),
  }
}
