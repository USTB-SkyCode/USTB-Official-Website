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
import HeaderBar from '@/layouts/HeaderBar.vue'

const tabs = TAB_DEFS
const userStore = useUserStore()
const {
  pageFrameMode,
  surfaceActivationPlan,
  homeActiveTab,
  homeExploreInteractionActive,
  homeExploreUiReveal,
  setHomeActiveTab,
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

  saveProgress()
  activeTab.value = newTab as typeof activeTab.value
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
</style>
