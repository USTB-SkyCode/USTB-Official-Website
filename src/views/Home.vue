<template>
  <div
    class="home-layout"
    :class="{ 'home-layout--explore-immersive': isExploreImmersive }"
    :data-frame-mode="pageFrameMode"
    :data-surface-frame-mode="contentSurfaceMode"
    :data-active-tab="activeTab"
    :data-explore-immersive="isExploreImmersive ? 'true' : 'false'"
  >
    <HeaderBar :tabs="navTabs" :active="activeTab" @tab-change="onTabChange" />
    <main ref="contentScrollRef" class="content-scroll">
      <section class="tab-stage">
        <div class="tab-stage__content">
          <component :is="activeTabComponent" />
        </div>
      </section>
    </main>

    <Teleport to="body">
      <div v-if="showExplorePrompt" class="explore-entry-dialog" @click.self="closeExplorePrompt">
        <div class="explore-entry-dialog__panel" role="dialog" aria-modal="true">
          <p class="explore-entry-dialog__eyebrow">Campus Explorer</p>
          <h2 class="explore-entry-dialog__title">是否启动校园游览（3D模式）？</h2>

          <div class="explore-entry-dialog__options">
            <label class="explore-entry-dialog__checkbox">
              <input
                v-model="useGlobalChoice"
                type="checkbox"
                class="explore-entry-dialog__checkbox-input"
              />
              <span class="explore-entry-dialog__checkbox-label">全局启用 3D 样式</span>
            </label>
            <label class="explore-entry-dialog__checkbox">
              <input
                v-model="rememberChoice"
                type="checkbox"
                class="explore-entry-dialog__checkbox-input"
              />
              <span class="explore-entry-dialog__checkbox-label">记住我的选择</span>
            </label>
          </div>

          <div class="explore-entry-dialog__actions">
            <button
              type="button"
              class="explore-entry-dialog__button explore-entry-dialog__button--ghost"
              @click="closeExplorePrompt"
            >
              暂不进入
            </button>
            <button
              type="button"
              class="explore-entry-dialog__button explore-entry-dialog__button--primary"
              @click="confirmExploreLaunch"
            >
              确认启动
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { Component } from 'vue'
import { provideFrameMode } from '@/composables/frameMode'
import {
  provideSurfaceActivationPlan,
  resolveContentSurfaceMode,
} from '@/composables/surfaceActivation'
import { tabs as TAB_DEFS, type TabKey } from '@/constants/tabs'
import { useSceneController } from '@/composables/scene/useSceneController'
import { useScrollStore } from '@/stores/scroll'
import { useUserStore } from '@/stores/user'
import { notify } from '@/utils/notify'
import HeaderBar from '@/layouts/HeaderBar.vue'

const tabs = TAB_DEFS
const userStore = useUserStore()
const {
  pageFrameMode,
  surfaceActivationPlan,
  homeActiveTab,
  homeExploreInteractionActive,
  homeExploreUiReveal,
  takeoverEnabled,
  takeoverBlockedReason,
  setHomeActiveTab,
  setTakeoverEnabled,
  setDisplayModePreference,
} = useSceneController()

provideFrameMode(pageFrameMode)
provideSurfaceActivationPlan(surfaceActivationPlan)

const contentSurfaceMode = computed(() => resolveContentSurfaceMode(surfaceActivationPlan.value))

const visibleTabs = computed(() =>
  tabs.filter(tab => !(userStore.isGuest && tab.key === 'servers')),
)

const navTabs = computed<{ key: TabKey; label: string }[]>(() =>
  visibleTabs.value.map(tab => ({
    key: tab.key,
    label: tab.label,
  })),
)

const activeTab = computed<TabKey>({
  get: () => homeActiveTab.value,
  set: value => setHomeActiveTab(value),
})

const activeTabComponent = computed(() => {
  const matchedTab = visibleTabs.value.find(t => t.key === activeTab.value) ?? visibleTabs.value[0]
  return matchedTab.component as Component
})

const isExploreImmersive = computed(
  () =>
    activeTab.value === 'explore' &&
    homeExploreInteractionActive.value &&
    !homeExploreUiReveal.value,
)

type ScrollStoreType = {
  positions?: Record<string, number>
  setScroll?: (k: string, t: number) => void
  getScroll?: (k: string) => number
}

const contentScrollRef = ref<HTMLElement | null>(null)
const scrollStore = useScrollStore()
const showExplorePrompt = ref(false)
const useGlobalChoice = ref(false)
const rememberChoice = ref(false)

function saveProgress() {
  const key = activeTab.value
  const top = contentScrollRef.value?.scrollTop ?? 0
  const ss = scrollStore as unknown as ScrollStoreType
  if (typeof ss.setScroll === 'function') {
    ss.setScroll(key, top)
  } else {
    ss.positions = { ...(ss.positions ?? {}), [key]: top }
  }
}

function onTabChange(newTab: typeof activeTab.value) {
  if (newTab === activeTab.value) return

  if (newTab === 'explore' && !takeoverEnabled.value) {
    if (takeoverBlockedReason.value) {
      notify.warning(`校园游览当前不可用：${takeoverBlockedReason.value}`)
      return
    }

    useGlobalChoice.value = false
    rememberChoice.value = false
    showExplorePrompt.value = true
    return
  }

  saveProgress()
  activeTab.value = newTab as typeof activeTab.value
}

function closeExplorePrompt() {
  showExplorePrompt.value = false
}

function confirmExploreLaunch() {
  setTakeoverEnabled(true)

  if (useGlobalChoice.value) {
    setDisplayModePreference('engine', rememberChoice.value)
  } else {
    setDisplayModePreference('dom', rememberChoice.value)
  }

  saveProgress()
  activeTab.value = 'explore'
  closeExplorePrompt()
}

function restoreProgress(key: TabKey) {
  nextTick(() => {
    const ss = scrollStore as unknown as ScrollStoreType
    const targetTop =
      typeof ss.getScroll === 'function' ? ss.getScroll(key) : ((ss.positions ?? {})[key] ?? 0)

    if (contentScrollRef.value && typeof targetTop === 'number') {
      contentScrollRef.value.scrollTop = targetTop
    }
  })
}

onMounted(() => {
  restoreProgress(activeTab.value)
})

onBeforeUnmount(() => {
  saveProgress()
})

watch(activeTab, newTab => {
  restoreProgress(newTab)
})

watch(
  () => userStore.isGuest,
  isGuest => {
    if (isGuest && activeTab.value === 'servers') {
      activeTab.value = 'schedule'
    }
  },
  { immediate: true },
)
</script>
<style scoped>
.home-layout {
  --header-height: 64px;

  position: relative;
  min-height: 100vh;
  isolation: isolate;
}

.content-scroll {
  position: relative;
  z-index: 400;
  height: 100vh;
  overflow: hidden auto;
  scrollbar-width: none;
  isolation: isolate;
}

.content-scroll::-webkit-scrollbar {
  display: none;
}

.tab-stage {
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

.tab-stage__content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  isolation: isolate;
}

.tab-stage__content > * {
  position: relative;
  z-index: 1;
}

.home-layout[data-frame-mode='engine'] .content-scroll,
.home-layout[data-frame-mode='engine'] .tab-stage,
.home-layout[data-frame-mode='engine'] .tab-stage__content {
  opacity: 1 !important;
  visibility: visible !important;
  mix-blend-mode: normal;
}

.home-layout--explore-immersive .content-scroll {
  overflow: hidden;
  pointer-events: none;
}

.home-layout--explore-immersive .tab-stage,
.home-layout--explore-immersive .tab-stage__content,
.home-layout--explore-immersive .tab-stage__content > * {
  pointer-events: none;
}

.explore-entry-dialog {
  position: fixed;
  z-index: 2600;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(7 12 24 / 44%);
  backdrop-filter: blur(12px);
}

.explore-entry-dialog__panel {
  width: min(460px, calc(100vw - 32px));
  max-height: min(78vh, 640px);
  overflow: auto;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 84%, transparent);
  border-radius: 24px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg) 92%, transparent), transparent),
    color-mix(in srgb, var(--theme-card-bg) 90%, white 8%);
  box-shadow: var(--theme-shadow-hero);
}

.explore-entry-dialog__eyebrow {
  margin: 0 0 8px;
  color: var(--theme-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.explore-entry-dialog__title {
  margin: 0;
  color: var(--theme-text-strong);
  font-size: 1.42rem;
}

.explore-entry-dialog__copy {
  margin: 14px 0 0;
  color: var(--theme-text-muted);
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.explore-entry-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}

.explore-entry-dialog__options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0 0;
}

.explore-entry-dialog__checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  font-size: 0.95rem;
  color: var(--theme-text-strong);
}

.explore-entry-dialog__checkbox-input {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 84%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-card-bg) 60%, transparent);
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.explore-entry-dialog__checkbox-input:hover {
  border-color: var(--theme-accent);
}

.explore-entry-dialog__checkbox-input:checked {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}

.explore-entry-dialog__checkbox-input:checked::after {
  content: '';
  position: absolute;
  top: 43%;
  left: 50%;
  width: 4px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: translate(-50%, -50%) rotate(45deg);
  border-radius: 1px;
}

.explore-entry-dialog__button {
  min-width: 132px;
  height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.explore-entry-dialog__button--ghost {
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 78%, transparent);
  background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
  color: var(--theme-text-strong);
}

.explore-entry-dialog__button--primary {
  border: none;
  background: color-mix(in srgb, var(--theme-accent) 88%, white 6%);
  color: white;
}

@media (width <= 720px) {
  .explore-entry-dialog {
    align-items: end;
    padding: max(12px, env(safe-area-inset-top, 0px) + 8px) 12px
      max(12px, env(safe-area-inset-bottom, 0px) + 8px);
  }

  .explore-entry-dialog__panel {
    width: min(100%, 100vw - 24px);
    max-height: min(82dvh, 720px);
    padding: 20px 18px calc(18px + env(safe-area-inset-bottom, 0px));
    border-radius: 24px 24px 18px 18px;
  }

  .explore-entry-dialog__title {
    font-size: 1.2rem;
    line-height: 1.35;
  }

  .explore-entry-dialog__options {
    gap: 16px;
    margin-top: 16px;
  }

  .explore-entry-dialog__checkbox {
    font-size: 1rem;
    padding: 6px 0;
  }

  .explore-entry-dialog__checkbox-input {
    width: 24px;
    height: 24px;
    border-radius: 7px;
  }

  .explore-entry-dialog__checkbox-input:checked::after {
    border-width: 0 3px 3px 0;
    width: 6px;
    height: 12px;
  }

  .explore-entry-dialog__actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .explore-entry-dialog__button {
    width: 100%;
    min-width: 0;
    height: 48px;
    border-radius: 16px;
  }
}
</style>
