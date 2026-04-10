import { readonly, ref, watch } from 'vue'
import { useDarkStore } from '@/stores/dark'
import { DayNightCycle, type DayNightCycleMode } from '@/engine/world/game/DayNightCycle'

const THEME_SYNC_MODES = new Set<DayNightCycleMode>([
  'realtime-beijing',
  'fixed-midnight',
  'fixed-time',
])

export function useEngineDayNightController(options: {
  dayNightCycle: DayNightCycle
  syncWithTheme?: boolean
  initialFixedTimeHours?: number
  initialRealtimeOffsetHours?: number
}) {
  const darkStore = useDarkStore()
  const dayNightMode = ref<DayNightCycleMode>('realtime-beijing')
  const fixedTimeHours = ref(options.initialFixedTimeHours ?? 20)
  const realtimeOffsetHours = ref(options.initialRealtimeOffsetHours ?? 0)

  function applyDayNightMode(mode: DayNightCycleMode) {
    dayNightMode.value = mode
    options.dayNightCycle.setMode(mode)

    if (mode === 'fixed-time') {
      options.dayNightCycle.setFixedTimeHours(fixedTimeHours.value)
      return
    }

    if (mode === 'realtime-beijing') {
      options.dayNightCycle.setRealtimeOffsetHours(realtimeOffsetHours.value)
    }
  }

  function applyFixedTimeHours(hours: number) {
    fixedTimeHours.value = Math.min(24, Math.max(0, hours))
    options.dayNightCycle.setFixedTimeHours(fixedTimeHours.value)
  }

  function applyRealtimeOffsetHours(hours: number) {
    realtimeOffsetHours.value = hours
    options.dayNightCycle.setRealtimeOffsetHours(hours)
  }

  watch(
    () => darkStore.themeMode,
    themeMode => {
      if (!options.syncWithTheme) {
        return
      }

      if (!THEME_SYNC_MODES.has(dayNightMode.value)) {
        return
      }

      if (themeMode === 'dark') {
        dayNightMode.value = 'fixed-midnight'
        options.dayNightCycle.setMode('fixed-midnight')
        return
      }

      if (themeMode === 'light') {
        dayNightMode.value = 'fixed-time'
        options.dayNightCycle.setFixedTimeHours(12)
        options.dayNightCycle.setMode('fixed-time')
        return
      }

      dayNightMode.value = 'realtime-beijing'
      options.dayNightCycle.setRealtimeOffsetHours(realtimeOffsetHours.value)
      options.dayNightCycle.setMode('realtime-beijing')
    },
    { immediate: true },
  )

  return {
    dayNightMode: readonly(dayNightMode),
    fixedTimeHours: readonly(fixedTimeHours),
    realtimeOffsetHours: readonly(realtimeOffsetHours),
    applyDayNightMode,
    applyFixedTimeHours,
    applyRealtimeOffsetHours,
  }
}
