import { ref } from 'vue'
import type { Ui3dComponentInstance } from '@/engine/render/ui3d/Ui3dComponent'
import { useTakeoverSurfaceConsumer } from '@/engine/takeover/TakeoverSurfaceConsumer'
import { useTakeoverSurfaceRenderAdapter } from '@/engine/takeover/TakeoverSurfaceRenderAdapter'
import { useTakeoverSurfaceUi3dStaging } from '@/engine/takeover/TakeoverSurfaceUi3dStaging'
import { useTakeoverLiquidGlassEditor } from '@/hooks/core/takeover/useTakeoverLiquidGlassEditor'
import type { TakeoverSurfaceSnapshot } from '@/stores/takeoverSurfaces'

export type EngineTakeoverSurfaceFrame = {
  routeId: string | null
  sceneKey: string | null
  capturedAt: string
  revision: number
  surfaces: TakeoverSurfaceSnapshot[]
}

export type EngineTakeoverUi3dSubmissionState = {
  enabled: boolean
  activeCount: number
  surfaceKeys: readonly string[]
}

type UseTakeoverOptions = {
  enableTakeoverUi3dSubmit: boolean
  resolveRenderer: () => {
    setUi3dTransparentBackground: (enabled: boolean) => void
    setUi3dComponents: (components: readonly Ui3dComponentInstance[]) => void
  } | null
}

function cloneTakeoverSurfaceSnapshot(surface: TakeoverSurfaceSnapshot): TakeoverSurfaceSnapshot {
  return {
    key: surface.key,
    kind: surface.kind,
    rect: { ...surface.rect },
    borderRadius: surface.borderRadius,
  }
}

export function useTakeover(options: UseTakeoverOptions) {
  const takeoverSurfaceFrame = ref<EngineTakeoverSurfaceFrame>({
    routeId: null,
    sceneKey: null,
    capturedAt: '',
    revision: 0,
    surfaces: [],
  })
  const {
    state: takeoverSurfaceConsumerSnapshot,
    applySnapshot: applyTakeoverSurfaceConsumerSnapshot,
    clear: clearTakeoverSurfaceConsumer,
  } = useTakeoverSurfaceConsumer()
  const {
    state: takeoverSurfaceRenderAdapterSnapshot,
    applyConsumerState: applyTakeoverSurfaceRenderAdapterState,
    clear: clearTakeoverSurfaceRenderAdapter,
  } = useTakeoverSurfaceRenderAdapter()
  const {
    state: takeoverSurfaceUi3dStagingSnapshot,
    applyRenderAdapterState: applyTakeoverSurfaceUi3dStagingState,
    clear: clearTakeoverSurfaceUi3dStaging,
  } = useTakeoverSurfaceUi3dStaging()
  const { revision: takeoverLiquidGlassEditorRevision } = useTakeoverLiquidGlassEditor()
  const takeoverUi3dSubmissionState = ref<EngineTakeoverUi3dSubmissionState>({
    enabled: options.enableTakeoverUi3dSubmit,
    activeCount: 0,
    surfaceKeys: [],
  })

  function syncTakeoverUi3dSubmission() {
    const stagedComponents = takeoverSurfaceUi3dStagingSnapshot.value.components
    const stagedSurfaceKeys = takeoverSurfaceUi3dStagingSnapshot.value.surfaceKeys

    takeoverUi3dSubmissionState.value = {
      enabled: options.enableTakeoverUi3dSubmit,
      activeCount: options.enableTakeoverUi3dSubmit ? stagedComponents.length : 0,
      surfaceKeys: options.enableTakeoverUi3dSubmit ? [...stagedSurfaceKeys] : [],
    }

    const renderer = options.resolveRenderer()
    if (!renderer) {
      return
    }

    renderer.setUi3dTransparentBackground(false)
    renderer.setUi3dComponents(options.enableTakeoverUi3dSubmit ? stagedComponents : [])
  }

  function syncTakeoverSurfaces(frame: EngineTakeoverSurfaceFrame) {
    takeoverSurfaceFrame.value = {
      routeId: frame.routeId,
      sceneKey: frame.sceneKey,
      capturedAt: frame.capturedAt,
      revision: frame.revision,
      surfaces: frame.surfaces.map(cloneTakeoverSurfaceSnapshot),
    }

    const trackedKeys = Array.from(new Set(frame.surfaces.map(surface => surface.key)))
    applyTakeoverSurfaceConsumerSnapshot({
      revision: frame.revision,
      routeId: frame.routeId,
      sceneKey: frame.sceneKey,
      capturedAt: frame.capturedAt,
      trackedKeys,
      surfaces: frame.surfaces.map(cloneTakeoverSurfaceSnapshot),
    })
    applyTakeoverSurfaceRenderAdapterState(takeoverSurfaceConsumerSnapshot.value)
    applyTakeoverSurfaceUi3dStagingState(takeoverSurfaceRenderAdapterSnapshot.value)
    syncTakeoverUi3dSubmission()
  }

  function refreshTakeoverUi3dStaging() {
    if (takeoverSurfaceRenderAdapterSnapshot.value.activeCount <= 0) {
      return
    }

    applyTakeoverSurfaceUi3dStagingState(takeoverSurfaceRenderAdapterSnapshot.value)
    syncTakeoverUi3dSubmission()
  }

  function clearTakeoverSurfaces() {
    takeoverSurfaceFrame.value = {
      routeId: null,
      sceneKey: null,
      capturedAt: '',
      revision: takeoverSurfaceFrame.value.revision + 1,
      surfaces: [],
    }
    clearTakeoverSurfaceConsumer()
    clearTakeoverSurfaceRenderAdapter()
    clearTakeoverSurfaceUi3dStaging()
    syncTakeoverUi3dSubmission()
  }

  return {
    takeoverSurfaceFrame,
    takeoverSurfaceConsumerSnapshot,
    takeoverSurfaceRenderAdapterSnapshot,
    takeoverSurfaceUi3dStagingSnapshot,
    takeoverUi3dSubmissionState,
    takeoverLiquidGlassEditorRevision,
    syncTakeoverUi3dSubmission,
    syncTakeoverSurfaces,
    refreshTakeoverUi3dStaging,
    clearTakeoverSurfaces,
  }
}
