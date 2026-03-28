import { onBeforeUnmount, onMounted, watch, type ComputedRef } from 'vue'
import { resolveTakeoverSurfaceLayer } from '@/constants/takeoverSurface'
import { useTakeoverLiquidGlassEditor } from '@/hooks/core/takeover/useTakeoverLiquidGlassEditor'

const SELECTED_SURFACE_ATTR = 'data-liquid-glass-editor-selected'

function parseRadius(value: string) {
  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function useHostEditorHighlight(options: {
  shouldReservePersistentHost: ComputedRef<boolean>
  routeId: ComputedRef<string>
  sceneKey: ComputedRef<string | null>
}) {
  const { lockSelection, selection } = useTakeoverLiquidGlassEditor()

  function handlePointerDown(event: MouseEvent) {
    if (!event.ctrlKey || event.button !== 0 || !options.shouldReservePersistentHost.value) {
      return
    }

    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.takeover-liquid-glass-editor')) return

    const surfaceElement = target.closest<HTMLElement>('[data-engine-surface-key]')
    if (!surfaceElement) return

    const surfaceKey = surfaceElement.dataset.engineSurfaceKey
    if (!surfaceKey) return

    event.preventDefault()
    event.stopPropagation()

    const style = window.getComputedStyle(surfaceElement)
    lockSelection({
      routeId: options.routeId.value,
      sceneKey: options.sceneKey.value,
      surfaceKey,
      kind: surfaceElement.dataset.engineSurfaceKind ?? 'section',
      layer: resolveTakeoverSurfaceLayer(surfaceElement.dataset.engineSurfaceKind ?? 'section'),
      borderRadius: Math.max(
        parseRadius(style.borderTopLeftRadius),
        parseRadius(style.borderTopRightRadius),
        parseRadius(style.borderBottomRightRadius),
        parseRadius(style.borderBottomLeftRadius),
      ),
    })
  }

  function updateHighlight(nextKey: string | null, previousKey: string | null) {
    if (previousKey) {
      const previous = document.querySelector<HTMLElement>(
        `[data-engine-surface-key="${CSS.escape(previousKey)}"]`,
      )
      previous?.removeAttribute(SELECTED_SURFACE_ATTR)
    }

    if (nextKey) {
      const next = document.querySelector<HTMLElement>(
        `[data-engine-surface-key="${CSS.escape(nextKey)}"]`,
      )
      next?.setAttribute(SELECTED_SURFACE_ATTR, 'true')
    }
  }

  watch(
    () => selection.value?.surfaceKey ?? null,
    (nextKey, previousKey) => {
      updateHighlight(nextKey, previousKey ?? null)
    },
    { immediate: true },
  )

  onMounted(() => {
    document.addEventListener('mousedown', handlePointerDown, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handlePointerDown, true)
  })
}
