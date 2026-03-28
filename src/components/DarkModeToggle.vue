<template>
  <div
    ref="toggleBtnRef"
    class="dark-mode-toggle"
    :style="{ '--knob-shift': `${knobShiftPx}px` }"
    :data-mode="visualThemeMode"
    role="slider"
    tabindex="0"
    aria-label="切换主题模式"
    aria-valuemin="0"
    aria-valuemax="2"
    :aria-valuenow="visualThemeIndex"
    :aria-valuetext="themeModeLabel"
    @keydown="handleKeyDown"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
  >
    <div class="toggle-track" aria-hidden="true">
      <span
        class="track-slot track-slot--light"
        :class="{ 'is-active': visualThemeMode === 'light' }"
      >
        <svg class="track-glyph" viewBox="0 0 24 24">
          <path
            d="M12 3.25V5.1M12 18.9v1.85M5.82 5.82l1.31 1.31M16.87 16.87l1.31 1.31M3.25 12H5.1M18.9 12h1.85M5.82 18.18l1.31-1.31M16.87 7.13l1.31-1.31"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7"
          />
          <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.7" />
          <circle cx="12" cy="12" r="2.45" fill="currentColor" opacity="0.96" />
        </svg>
      </span>
      <span
        class="track-slot track-slot--auto"
        :class="{ 'is-active': visualThemeMode === 'auto' }"
      >
        <svg class="track-glyph" viewBox="0 0 24 24">
          <path
            d="M8.1 18.25h8.1a3.9 3.9 0 1 0-.58-7.76A5.05 5.05 0 0 0 5.2 11.5a3.5 3.5 0 0 0 2.9 6.75Z"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7"
          />
        </svg>
      </span>
      <span
        class="track-slot track-slot--dark"
        :class="{ 'is-active': visualThemeMode === 'dark' }"
      >
        <svg class="track-glyph" viewBox="0 0 24 24">
          <path
            d="M14.62 3.55a8.67 8.67 0 1 0 5.83 14.99 7.55 7.55 0 0 1-5.83-14.99Z"
            fill="currentColor"
          />
          <path
            d="M17.55 5.25l.34 1.06a.7.7 0 0 0 .45.45l1.06.34-1.06.34a.7.7 0 0 0-.45.45l-.34 1.06-.34-1.06a.7.7 0 0 0-.45-.45L15.7 7.1l1.06-.34a.7.7 0 0 0 .45-.45ZM19.05 10.4l.23.72a.48.48 0 0 0 .3.3l.72.23-.72.23a.48.48 0 0 0-.3.3l-.23.72-.23-.72a.48.48 0 0 0-.3-.3l-.72-.23.72-.23a.48.48 0 0 0 .3-.3Z"
            fill="currentColor"
            opacity="0.92"
          />
        </svg>
      </span>
    </div>

    <div class="toggle-knob">
      <transition name="icon-fade" mode="out-in">
        <svg
          v-if="visualThemeMode === 'light'"
          key="light"
          class="toggle-glyph"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M12 3.25V5.1M12 18.9v1.85M5.82 5.82l1.31 1.31M16.87 16.87l1.31 1.31M3.25 12H5.1M18.9 12h1.85M5.82 18.18l1.31-1.31M16.87 7.13l1.31-1.31"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7"
          />
          <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.7" />
          <circle cx="12" cy="12" r="2.45" fill="currentColor" opacity="0.96" />
        </svg>
        <svg
          v-else-if="visualThemeMode === 'auto'"
          key="auto"
          class="toggle-glyph"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M8.1 18.25h8.1a3.9 3.9 0 1 0-.58-7.76A5.05 5.05 0 0 0 5.2 11.5a3.5 3.5 0 0 0 2.9 6.75Z"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7"
          />
        </svg>
        <svg v-else key="dark" class="toggle-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M14.62 3.55a8.67 8.67 0 1 0 5.83 14.99 7.55 7.55 0 0 1-5.83-14.99Z"
            fill="currentColor"
          />
          <path
            d="M17.55 5.25l.34 1.06a.7.7 0 0 0 .45.45l1.06.34-1.06.34a.7.7 0 0 0-.45.45l-.34 1.06-.34-1.06a.7.7 0 0 0-.45-.45L15.7 7.1l1.06-.34a.7.7 0 0 0 .45-.45ZM19.05 10.4l.23.72a.48.48 0 0 0 .3.3l.72.23-.72.23a.48.48 0 0 0-.3.3l-.23.72-.23-.72a.48.48 0 0 0-.3-.3l-.72-.23.72-.23a.48.48 0 0 0 .3-.3Z"
            fill="currentColor"
            opacity="0.92"
          />
        </svg>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getNextThemeMode, type ThemeMode, useDarkStore } from '@/stores/dark'
import { setThemeModeWithTransition } from '@/composables/darkMode'

const MODE_ORDER: ThemeMode[] = ['light', 'auto', 'dark']
const KNOB_STEP_PX = 32
const DRAG_THRESHOLD_PX = 4

const darkStore = useDarkStore()
const isDarkMode = computed(() => darkStore.isDarkMode)
const themeMode = computed(() => darkStore.themeMode)
const toggleBtnRef = ref<HTMLElement | null>(null)
const dragThemeMode = ref<ThemeMode | null>(null)

let activePointerId: number | null = null
let pointerStartX = 0
let pointerDragged = false

const visualThemeMode = computed(() => dragThemeMode.value ?? themeMode.value)
const visualThemeIndex = computed(() => MODE_ORDER.indexOf(visualThemeMode.value))
const knobShiftPx = computed(() => visualThemeIndex.value * KNOB_STEP_PX)
const themeModeLabel = computed(() => {
  if (visualThemeMode.value === 'light') {
    return '浅色模式，锁定正午'
  }

  if (visualThemeMode.value === 'auto') {
    return `自动模式，跟随北京时间，当前为${isDarkMode.value ? '深色' : '浅色'}`
  }

  return '深色模式，锁定夜晚'
})

function resolveThemeModeFromClientX(clientX: number): ThemeMode {
  const element = toggleBtnRef.value
  if (!element) {
    return themeMode.value
  }

  const rect = element.getBoundingClientRect()
  const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width
  const clampedRatio = Math.min(1, Math.max(0, ratio))
  const index = Math.min(MODE_ORDER.length - 1, Math.max(0, Math.round(clampedRatio * 2)))
  return MODE_ORDER[index]
}

async function applyThemeModeWithTransition(nextMode: ThemeMode) {
  const button = toggleBtnRef.value
  if (!button) {
    darkStore.setThemeMode(nextMode)
    return
  }

  const rect = button.getBoundingClientRect()
  const index = MODE_ORDER.indexOf(nextMode)
  const slotCenterX = rect.left + rect.width * ((index + 0.5) / MODE_ORDER.length)
  const slotCenterY = rect.top + rect.height / 2
  await setThemeModeWithTransition(slotCenterX, slotCenterY, nextMode)
}

async function cycleThemeMode() {
  await applyThemeModeWithTransition(getNextThemeMode(themeMode.value))
}

function handlePointerDown(event: PointerEvent) {
  const button = toggleBtnRef.value
  if (!button) {
    return
  }

  activePointerId = event.pointerId
  pointerStartX = event.clientX
  pointerDragged = false
  dragThemeMode.value = themeMode.value
  button.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerId !== activePointerId) {
    return
  }

  if (!pointerDragged && Math.abs(event.clientX - pointerStartX) >= DRAG_THRESHOLD_PX) {
    pointerDragged = true
  }

  if (!pointerDragged) {
    return
  }

  dragThemeMode.value = resolveThemeModeFromClientX(event.clientX)
}

function resetPointerSession() {
  activePointerId = null
  pointerStartX = 0
  pointerDragged = false
  dragThemeMode.value = null
}

async function handlePointerUp(event: PointerEvent) {
  if (event.pointerId !== activePointerId) {
    return
  }

  const nextMode = pointerDragged
    ? (dragThemeMode.value ?? themeMode.value)
    : getNextThemeMode(themeMode.value)

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  resetPointerSession()

  if (pointerDragged) {
    darkStore.setThemeMode(nextMode)
    return
  }

  await applyThemeModeWithTransition(nextMode)
}

function handlePointerCancel() {
  resetPointerSession()
}

async function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    await cycleThemeMode()
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault()
    const currentIndex = MODE_ORDER.indexOf(themeMode.value)
    darkStore.setThemeMode(MODE_ORDER[Math.max(0, currentIndex - 1)])
    return
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault()
    const currentIndex = MODE_ORDER.indexOf(themeMode.value)
    darkStore.setThemeMode(MODE_ORDER[Math.min(MODE_ORDER.length - 1, currentIndex + 1)])
  }
}
</script>

<style scoped>
.dark-mode-toggle {
  display: grid;
  position: relative;
  place-items: center;
  width: 100px;
  height: 37px;
  padding: 0;
  border: 1px solid var(--theme-toggle-border);
  border-radius: 999px;
  background-color: var(--theme-toggle-bg);
  color: var(--el-text-color-regular);
  cursor: pointer;
  overflow: hidden;
  user-select: none;
  touch-action: pan-y;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.dark-mode-toggle[data-mode='light'] {
  border-color: transparent;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, white 14%, var(--theme-toggle-active-bg)),
    var(--theme-toggle-active-bg)
  );
  color: rgb(255 255 255 / 0.96);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.24),
    0 6px 18px rgb(11 101 255 / 0.18);
}

.dark-mode-toggle[data-mode='auto'] {
  background: transparent;
  box-shadow: none;
}

.dark-mode-toggle[data-mode='dark'] {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.03)), rgb(8 14 24 / 0.52),
    var(--theme-toggle-bg);
  border-color: rgb(255 255 255 / 0.1);
  color: rgb(214 228 255 / 0.84);
}

.dark-mode-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--theme-accent) 42%, transparent);
  outline-offset: 2px;
}

.toggle-track {
  display: grid;
  position: absolute;
  inset: 4px;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.track-slot {
  display: grid;
  place-items: center;
  border-radius: 999px;
  opacity: 0.82;
  color: rgb(255 255 255 / 0.44);
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    box-shadow 180ms ease,
    color 180ms ease,
    background 180ms ease;
}

.track-slot.is-active {
  opacity: 1;
  transform: scaleY(1.02);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%);
}

.track-slot.is-active .track-glyph {
  opacity: 0;
}

.track-slot--light {
  background: transparent;
  color: rgb(255 255 255 / 0.62);
}

.track-slot--auto {
  background: transparent;
  color: color-mix(in srgb, var(--el-text-color-regular) 78%, transparent);
}

.track-slot--dark {
  background: transparent;
  color: rgb(251 191 36 / 0.72);
}

.track-slot--light.is-active {
  color: rgb(255 255 255 / 0.98);
}

.track-slot--auto.is-active {
  color: var(--theme-text-strong);
}

.track-slot--dark.is-active {
  color: rgb(252 211 77);
}

.track-glyph {
  width: 19px;
  height: 19px;
  opacity: 1;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.toggle-glyph {
  width: 19px;
  height: 19px;
}

.toggle-knob {
  display: grid;
  position: absolute;
  top: 50%;
  left: 0px;
  width: 36px;
  height: 36px;
  transform: translate(var(--knob-shift), -50%);
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  color: var(--theme-text-strong);
  place-items: center;
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

.dark-mode-toggle[data-mode='light'] .toggle-knob {
  background: transparent;
  color: rgb(255 255 255);
}

.dark-mode-toggle[data-mode='auto'] .toggle-knob {
  background: transparent;
  color: var(--theme-text-strong);
}

.dark-mode-toggle[data-mode='dark'] .toggle-knob {
  background: transparent;
  color: rgb(251 191 36);
}

.icon-fade-enter-active,
.icon-fade-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.icon-fade-enter-from,
.icon-fade-leave-to {
  transform: scale(0.7) rotate(-180deg);
  opacity: 0;
}

.icon-fade-enter-to,
.icon-fade-leave-from {
  transform: scale(1) rotate(0deg);
  opacity: 1;
}
</style>
