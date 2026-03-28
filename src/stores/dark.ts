import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'auto' | 'dark'

const STORAGE_KEY = 'themeMode'
const LEGACY_STORAGE_KEY = 'darkMode'
const AUTO_LIGHT_START_HOUR = 10
const AUTO_LIGHT_END_HOUR = 17
const AUTO_THEME_SYNC_INTERVAL_MS = 60 * 1000

function applyTheme(isDark: boolean) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.dataset.theme = isDark ? 'dark' : 'light'
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'auto' || value === 'dark'
}

function readStoredThemeMode(): ThemeMode | null {
  if (typeof window === 'undefined') return null

  const savedThemeMode = window.localStorage.getItem(STORAGE_KEY)
  if (isThemeMode(savedThemeMode)) {
    return savedThemeMode
  }

  const savedDarkMode = window.localStorage.getItem(LEGACY_STORAGE_KEY)
  if (savedDarkMode === 'true') return 'dark'
  if (savedDarkMode === 'false') return 'light'
  return null
}

export function getCurrentBeijingHours(nowMs = Date.now()): number {
  const beijingNow = new Date(nowMs + 8 * 60 * 60 * 1000)
  return (
    beijingNow.getUTCHours() + beijingNow.getUTCMinutes() / 60 + beijingNow.getUTCSeconds() / 3600
  )
}

export function resolveAutoThemeIsDark(nowMs = Date.now()): boolean {
  const beijingHours = getCurrentBeijingHours(nowMs)
  return !(beijingHours >= AUTO_LIGHT_START_HOUR && beijingHours < AUTO_LIGHT_END_HOUR)
}

export function resolveThemeIsDark(mode: ThemeMode, nowMs = Date.now()): boolean {
  if (mode === 'dark') {
    return true
  }

  if (mode === 'light') {
    return false
  }

  return resolveAutoThemeIsDark(nowMs)
}

export function getNextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'light') return 'auto'
  if (mode === 'auto') return 'dark'
  return 'light'
}

export const useDarkStore = defineStore('dark', () => {
  const themeMode = ref<ThemeMode>('auto')
  const nowMs = ref(Date.now())
  const isDarkMode = computed(() => resolveThemeIsDark(themeMode.value, nowMs.value))

  let autoThemeSyncTimer: number | null = null

  function persistThemeMode() {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(STORAGE_KEY, themeMode.value)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  }

  function syncNow() {
    nowMs.value = Date.now()
  }

  function ensureAutoThemeSync() {
    if (typeof window === 'undefined' || autoThemeSyncTimer !== null) {
      return
    }

    autoThemeSyncTimer = window.setInterval(() => {
      syncNow()
    }, AUTO_THEME_SYNC_INTERVAL_MS)
  }

  if (typeof window !== 'undefined') {
    themeMode.value = readStoredThemeMode() ?? 'auto'
    syncNow()
    ensureAutoThemeSync()

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        syncNow()
      }
    })
  }

  watch(
    isDarkMode,
    nextValue => {
      applyTheme(nextValue)
    },
    { immediate: true },
  )

  watch(themeMode, () => {
    persistThemeMode()
  })

  function setThemeMode(nextMode: ThemeMode) {
    themeMode.value = nextMode
    syncNow()
  }

  function setDarkMode(nextValue: boolean) {
    setThemeMode(nextValue ? 'dark' : 'light')
  }

  function toggleDarkMode() {
    setDarkMode(!isDarkMode.value)
  }

  function cycleThemeMode() {
    setThemeMode(getNextThemeMode(themeMode.value))
  }

  return { themeMode, isDarkMode, setThemeMode, cycleThemeMode, setDarkMode, toggleDarkMode }
})
