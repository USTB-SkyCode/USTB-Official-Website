function readBoolEnv(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }

  return fallback
}

const defaultDevEnabled = import.meta.env.DEV

export function readBoolDebugFlag(value: string | null | undefined, fallback: boolean): boolean {
  return readBoolEnv(value ?? undefined, fallback)
}

export const DEBUG_FLAGS = {
  app: readBoolEnv(import.meta.env.VITE_DEBUG_APP, defaultDevEnabled),
  worker: readBoolEnv(import.meta.env.VITE_DEBUG_WORKER, defaultDevEnabled),
  rust: readBoolEnv(import.meta.env.VITE_DEBUG_RUST, defaultDevEnabled),
  chunk: readBoolEnv(import.meta.env.VITE_DEBUG_CHUNK, defaultDevEnabled),
  texture: readBoolEnv(import.meta.env.VITE_DEBUG_TEXTURE, defaultDevEnabled),
  renderer: readBoolEnv(import.meta.env.VITE_DEBUG_RENDERER, defaultDevEnabled),
  runtime: readBoolEnv(import.meta.env.VITE_DEBUG_RUNTIME, defaultDevEnabled),
  takeoverInspector: readBoolEnv(import.meta.env.VITE_DEBUG_TAKEOVER_INSPECTOR, false),
  takeoverUi3dSubmit: readBoolEnv(import.meta.env.VITE_DEBUG_TAKEOVER_UI3D_SUBMIT, false),
} as const

export function debugLog(enabled: boolean, ...args: unknown[]) {
  if (enabled) {
    console.log(...args)
  }
}

export function debugWarn(enabled: boolean, ...args: unknown[]) {
  if (enabled) {
    console.warn(...args)
  }
}
