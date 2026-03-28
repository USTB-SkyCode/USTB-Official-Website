function readNavigatorMobileFlag() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgentData = (
    navigator as Navigator & {
      userAgentData?: { mobile?: boolean }
    }
  ).userAgentData
  if (typeof userAgentData?.mobile === 'boolean') {
    return userAgentData.mobile
  }

  const userAgent = navigator.userAgent || ''
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(userAgent)
}

export function isLikelyMobileDevice() {
  if (typeof window === 'undefined') {
    return false
  }

  if (readNavigatorMobileFlag()) {
    return true
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrowViewport = window.matchMedia?.('(max-width: 900px)').matches ?? false
  const touchCapable = navigator.maxTouchPoints > 0
  return coarsePointer && (narrowViewport || touchCapable)
}

export function supportsWebGL2() {
  if (typeof document === 'undefined') {
    return false
  }

  const canvas = document.createElement('canvas')
  try {
    return !!canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
    })
  } catch {
    return false
  }
}

export type EngineTakeoverSupport = {
  supported: boolean
  reason: string | null
}

export function getEngineTakeoverSupport(): EngineTakeoverSupport {
  if (!supportsWebGL2()) {
    return {
      supported: false,
      reason: 'WebGL2 unavailable',
    }
  }

  if (typeof window === 'undefined') {
    return {
      supported: false,
      reason: 'window unavailable',
    }
  }

  if (window.crossOriginIsolated !== true) {
    return {
      supported: false,
      reason: 'crossOriginIsolated unavailable',
    }
  }

  if (typeof Atomics === 'undefined') {
    return {
      supported: false,
      reason: 'Atomics unavailable',
    }
  }

  if (typeof SharedArrayBuffer === 'undefined') {
    return {
      supported: false,
      reason: 'SharedArrayBuffer unavailable',
    }
  }

  return {
    supported: true,
    reason: null,
  }
}
