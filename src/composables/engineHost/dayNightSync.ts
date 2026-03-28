import { watch, type ComputedRef } from 'vue'
import { useDarkStore } from '@/stores/dark'
import type { DayNightCycleMode } from '@/engine/world/game/DayNightCycle'

export function useHostDayNightSync(options: {
  engineTimeManualOverrideActive: ComputedRef<boolean>
  engineFixedTimeHours: ComputedRef<number>
  applyDayNightMode: (mode: DayNightCycleMode) => void
  applyFixedTimeHours: (hours: number) => void
  applyRealtimeOffsetHours: (hours: number) => void
}) {
  const darkStore = useDarkStore()

  watch(
    [
      () => darkStore.themeMode,
      options.engineTimeManualOverrideActive,
      options.engineFixedTimeHours,
    ],
    ([themeMode, manualOverrideActive, fixedHours]) => {
      if (manualOverrideActive) {
        options.applyFixedTimeHours(fixedHours)
        options.applyDayNightMode('fixed-time')
        return
      }

      if (themeMode === 'dark') {
        options.applyDayNightMode('fixed-midnight')
        return
      }

      if (themeMode === 'light') {
        options.applyFixedTimeHours(12)
        options.applyDayNightMode('fixed-time')
        return
      }

      options.applyRealtimeOffsetHours(0)
      options.applyDayNightMode('realtime-beijing')
    },
    { immediate: true },
  )
}
