import { getEngineTakeoverSupport } from '@/utils/platformCapabilities'

type NavigatorConnectionLike = {
  effectiveType?: string
  saveData?: boolean
}

export type EngineTakeoverNetworkProfile = 'normal' | 'constrained'

export type EngineTakeoverPolicy = {
  supported: boolean
  reason: string | null
  networkProfile: EngineTakeoverNetworkProfile
  startupDelayMs: number
  retryLimit: number
  retryBackoffMs: number
  loadTimeoutMs: number
}

function readConnectionProfile(): EngineTakeoverNetworkProfile {
  if (typeof navigator === 'undefined') {
    return 'normal'
  }

  const connection =
    (
      navigator as Navigator & {
        connection?: NavigatorConnectionLike
        mozConnection?: NavigatorConnectionLike
        webkitConnection?: NavigatorConnectionLike
      }
    ).connection ??
    (navigator as Navigator & { mozConnection?: NavigatorConnectionLike }).mozConnection ??
    (navigator as Navigator & { webkitConnection?: NavigatorConnectionLike }).webkitConnection

  if (!connection) {
    return 'normal'
  }

  if (connection.saveData) {
    return 'constrained'
  }

  const effectiveType = connection.effectiveType?.toLowerCase() ?? ''
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
    return 'constrained'
  }

  return 'normal'
}

let cachedPolicy: EngineTakeoverPolicy | null = null

export function getEngineTakeoverPolicy(): EngineTakeoverPolicy {
  if (cachedPolicy) {
    return cachedPolicy
  }

  const support = getEngineTakeoverSupport()
  const networkProfile = readConnectionProfile()

  if (!support.supported) {
    cachedPolicy = {
      supported: false,
      reason: support.reason,
      networkProfile,
      startupDelayMs: 0,
      retryLimit: 0,
      retryBackoffMs: 0,
      loadTimeoutMs: 0,
    }
    return cachedPolicy
  }

  if (networkProfile === 'constrained') {
    cachedPolicy = {
      supported: true,
      reason: null,
      networkProfile,
      startupDelayMs: 240,
      retryLimit: 3,
      retryBackoffMs: 900,
      loadTimeoutMs: 10000,
    }
    return cachedPolicy
  }

  cachedPolicy = {
    supported: true,
    reason: null,
    networkProfile,
    startupDelayMs: 0,
    retryLimit: 2,
    retryBackoffMs: 350,
    loadTimeoutMs: 5000,
  }
  return cachedPolicy
}
