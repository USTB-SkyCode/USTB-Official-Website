import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import type { BlockInteractionUiAction } from '@/engine/world/game/BlockInteraction/BlockInteraction'

export function useHostExploreInteraction(options: {
  canvasRef: Ref<HTMLCanvasElement | null>
  hostReady: ComputedRef<boolean>
  shouldReservePersistentHost: ComputedRef<boolean>
  routeId: ComputedRef<string>
  homeActiveTab: ComputedRef<string>
  homeExploreInteractionActive: ComputedRef<boolean>
  homeExploreUiReveal: ComputedRef<boolean>
  homeExploreEngineSettingsOpen: ComputedRef<boolean>
  homeExploreMobileBlockAction: ComputedRef<BlockInteractionUiAction | null>
  homeExploreMobileBlockActionSerial: ComputedRef<number>
  setHomeExploreInteractionActive: (active: boolean) => void
  setHomeExploreUiReveal: (reveal: boolean) => void
  setHomeExploreEngineSettingsOpen: (open: boolean) => void
  enableInteractiveControls: (canvas: HTMLCanvasElement) => void
  disableInteractiveControls: () => void
  cyclePerspectiveMode: () => void
  performBlockInteractionAction: (action: BlockInteractionUiAction) => unknown | Promise<unknown>
}) {
  let pointerLockRequested = false

  const exploreTabActive = computed(
    () => options.routeId.value === 'home' && options.homeActiveTab.value === 'explore',
  )

  const exploreInteractionActive = computed(
    () => exploreTabActive.value && options.homeExploreInteractionActive.value,
  )

  const exploreSettingsVisible = computed(
    () => exploreTabActive.value && options.homeExploreEngineSettingsOpen.value,
  )

  const canEnterExploreInteraction = computed(
    () =>
      exploreTabActive.value &&
      options.shouldReservePersistentHost.value &&
      options.hostReady.value &&
      !!options.canvasRef.value,
  )

  const loginInteractionActive = computed(
    () =>
      options.routeId.value === 'login' &&
      options.shouldReservePersistentHost.value &&
      options.hostReady.value,
  )

  function requestPointerLock() {
    const canvas = options.canvasRef.value
    if (!canvas || typeof canvas.requestPointerLock !== 'function') {
      return
    }
    void canvas.requestPointerLock()
  }

  function releasePointerLock() {
    pointerLockRequested = false
    if (document.pointerLockElement === options.canvasRef.value) {
      document.exitPointerLock()
    }
  }

  function engage(opts: { requestPointerLock?: boolean } = {}) {
    const canvas = options.canvasRef.value
    if (!canEnterExploreInteraction.value || !canvas) {
      return
    }

    options.setHomeExploreInteractionActive(true)
    options.setHomeExploreUiReveal(false)
    options.enableInteractiveControls(canvas)
    pointerLockRequested = !!opts.requestPointerLock

    if (opts.requestPointerLock) {
      requestPointerLock()
    }
  }

  function finalizeDisengagement() {
    options.setHomeExploreInteractionActive(false)
    options.setHomeExploreUiReveal(true)
  }

  function disengage() {
    finalizeDisengagement()
    releasePointerLock()
  }

  function handlePointerLockChange() {
    if (!exploreTabActive.value || !exploreInteractionActive.value) {
      return
    }
    if (!pointerLockRequested) {
      return
    }
    if (document.pointerLockElement === options.canvasRef.value) {
      return
    }
    finalizeDisengagement()
    pointerLockRequested = false
  }

  function handleExplorePointerDown(event: PointerEvent) {
    if (!canEnterExploreInteraction.value || exploreInteractionActive.value) {
      return
    }
    const target = event.target
    if (target instanceof Element && target.closest('[data-explore-ui-control="true"]')) {
      return
    }
    engage({ requestPointerLock: event.pointerType !== 'touch' })
  }

  function handleLoginPointerDown(event: PointerEvent) {
    if (!loginInteractionActive.value) {
      return
    }
    const target = event.target
    if (target instanceof Element && target.closest('[data-login-ui-control="true"]')) {
      return
    }
    requestPointerLock()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!exploreTabActive.value) {
      return
    }

    if (event.code === 'Digit5') {
      event.preventDefault()
      if (event.repeat) return
      options.cyclePerspectiveMode()
      return
    }

    if (event.code === 'KeyX') {
      event.preventDefault()
      if (event.repeat) return
      if (exploreInteractionActive.value) {
        options.setHomeExploreEngineSettingsOpen(true)
        options.setHomeExploreUiReveal(true)
        disengage()
        return
      }
      const nextOpen = !options.homeExploreEngineSettingsOpen.value
      options.setHomeExploreEngineSettingsOpen(nextOpen)
      if (nextOpen) {
        options.setHomeExploreUiReveal(true)
      }
      return
    }

    if (event.key === 'Escape') {
      if (exploreInteractionActive.value) {
        event.preventDefault()
        disengage()
      }
      return
    }

    if (event.key === 'Alt') {
      if (exploreInteractionActive.value) options.setHomeExploreUiReveal(true)
      return
    }

    if (exploreInteractionActive.value || !canEnterExploreInteraction.value) {
      return
    }
    if (event.ctrlKey || event.metaKey) {
      return
    }
    engage()
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.key !== 'Alt') return
    if (exploreInteractionActive.value) options.setHomeExploreUiReveal(false)
  }

  // Interactive controls lifecycle
  watch(
    [options.hostReady, options.canvasRef, exploreInteractionActive, loginInteractionActive],
    ([ready, canvas, exploreActive, loginActive]) => {
      if (!ready || !canvas || (!exploreTabActive.value && !loginActive)) {
        options.disableInteractiveControls()
        releasePointerLock()
        return
      }
      if (exploreActive || loginActive) {
        options.enableInteractiveControls(canvas)
        return
      }
      options.disableInteractiveControls()
      releasePointerLock()
    },
    { immediate: true, flush: 'post' },
  )

  // Mobile block action
  watch(
    () => options.homeExploreMobileBlockActionSerial.value,
    serial => {
      if (serial <= 0 || !options.hostReady.value || !exploreInteractionActive.value) return
      const action = options.homeExploreMobileBlockAction.value
      if (!action) return
      void options.performBlockInteractionAction(action)
    },
  )

  // Cleanup on tab leave
  watch(
    exploreTabActive,
    active => {
      if (!active) {
        options.disableInteractiveControls()
        releasePointerLock()
      }
    },
    { immediate: true },
  )

  onMounted(() => {
    document.addEventListener('pointerdown', handleLoginPointerDown, true)
    document.addEventListener('pointerdown', handleExplorePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    document.addEventListener('pointerlockchange', handlePointerLockChange)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleLoginPointerDown, true)
    document.removeEventListener('pointerdown', handleExplorePointerDown, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    document.removeEventListener('keyup', handleKeyUp, true)
    document.removeEventListener('pointerlockchange', handlePointerLockChange)
  })

  onUnmounted(() => {
    options.disableInteractiveControls()
    releasePointerLock()
  })

  return {
    exploreTabActive,
    exploreInteractionActive,
    exploreSettingsVisible,
    loginInteractionActive,
    canEnterExploreInteraction,
    homeExploreUiReveal: options.homeExploreUiReveal,
    disengage,
    releasePointerLock,
  }
}
