import { defineStore } from 'pinia'
import { ref } from 'vue'

export type TakeoverSurfaceSnapshot = {
  key: string
  kind: string
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  borderRadius: number
}

export type TakeoverSurfacePublicationPhase = 'idle' | 'sampled' | 'published'

function cloneSurfaceSnapshot(surface: TakeoverSurfaceSnapshot): TakeoverSurfaceSnapshot {
  return {
    key: surface.key,
    kind: surface.kind,
    rect: { ...surface.rect },
    borderRadius: surface.borderRadius,
  }
}

export const useTakeoverSurfaceStore = defineStore('takeoverSurfaces', () => {
  const routeId = ref<string | null>(null)
  const sceneKey = ref<string | null>(null)
  const capturedAt = ref('')
  const revision = ref(0)
  const surfaces = ref<TakeoverSurfaceSnapshot[]>([])
  const publicationPhase = ref<TakeoverSurfacePublicationPhase>('idle')
  const publishedRouteId = ref<string | null>(null)
  const publishedSceneKey = ref<string | null>(null)
  const publishedCapturedAt = ref('')
  const publishedRevision = ref(0)
  const publishedSurfaces = ref<TakeoverSurfaceSnapshot[]>([])

  function setSnapshots(next: {
    routeId: string | null
    sceneKey: string | null
    capturedAt: string
    surfaces: TakeoverSurfaceSnapshot[]
  }) {
    routeId.value = next.routeId
    sceneKey.value = next.sceneKey
    capturedAt.value = next.capturedAt
    surfaces.value = next.surfaces
    publicationPhase.value = 'sampled'
    revision.value += 1
  }

  function clearSnapshots() {
    routeId.value = null
    sceneKey.value = null
    capturedAt.value = ''
    surfaces.value = []
    publicationPhase.value = 'idle'
    revision.value += 1
  }

  function publishSnapshots() {
    publishedRouteId.value = routeId.value
    publishedSceneKey.value = sceneKey.value
    publishedCapturedAt.value = capturedAt.value
    publishedSurfaces.value = surfaces.value.map(cloneSurfaceSnapshot)
    publicationPhase.value = 'published'
    publishedRevision.value += 1
  }

  function clearPublishedSnapshots(nextPhase: TakeoverSurfacePublicationPhase = 'idle') {
    publishedRouteId.value = null
    publishedSceneKey.value = null
    publishedCapturedAt.value = ''
    publishedSurfaces.value = []
    publicationPhase.value = nextPhase
    publishedRevision.value += 1
  }

  function syncPublishedSnapshots(readyToPublish: boolean) {
    if (!readyToPublish) {
      clearPublishedSnapshots(surfaces.value.length > 0 ? 'sampled' : 'idle')
      return
    }

    publishSnapshots()
  }

  function clearAllSnapshots() {
    clearSnapshots()
    clearPublishedSnapshots('idle')
  }

  return {
    routeId,
    sceneKey,
    capturedAt,
    revision,
    surfaces,
    publicationPhase,
    publishedRouteId,
    publishedSceneKey,
    publishedCapturedAt,
    publishedRevision,
    publishedSurfaces,
    setSnapshots,
    clearSnapshots,
    publishSnapshots,
    clearPublishedSnapshots,
    syncPublishedSnapshots,
    clearAllSnapshots,
  }
})
