import { nextTick } from 'vue'
import type { ThemeMode } from '@/stores/dark'
import { resolveThemeIsDark, useDarkStore } from '@/stores/dark'

type ViewTransition = {
  ready: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => ViewTransition
}

export const THEME_TRANSITION_DURATION = 400

function isEngineTakeoverThemeContext() {
  return Boolean(document.querySelector('.persistent-engine-host--active'))
}

function canUseAppearanceTransition() {
  return Boolean(
    'startViewTransition' in document &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches &&
      !isEngineTakeoverThemeContext(),
  )
}

export async function setThemeModeWithTransition(cx: number, cy: number, nextMode: ThemeMode) {
  const darkStore = useDarkStore()
  const currentIsDark = darkStore.isDarkMode
  const nextIsDark = resolveThemeIsDark(nextMode)

  if (currentIsDark === nextIsDark) {
    darkStore.setThemeMode(nextMode)
    return
  }

  if (!canUseAppearanceTransition()) {
    darkStore.setThemeMode(nextMode)
    return
  }

  const clipPath = [
    `circle(0px at ${cx}px ${cy}px)`,
    `circle(${Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy))}px at ${cx}px ${cy}px)`,
  ]

  const doc = document as DocumentWithViewTransition
  const transition = doc.startViewTransition?.(async () => {
    darkStore.setThemeMode(nextMode)
    await nextTick()
  })

  try {
    await transition?.ready
  } catch {
    return
  }

  const isDarkNow = darkStore.isDarkMode

  document.documentElement.animate(
    {
      clipPath: nextIsDark ? [...clipPath].reverse() : [...clipPath],
    },
    {
      duration: THEME_TRANSITION_DURATION,
      easing: 'ease-in',
      fill: 'both',
      pseudoElement: isDarkNow ? '::view-transition-old(root)' : '::view-transition-new(root)',
    },
  )
}
