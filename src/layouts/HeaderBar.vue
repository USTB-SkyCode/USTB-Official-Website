<template>
  <header
    ref="headerRef"
    class="header-bar"
    :class="{ 'header-bar--hidden': hideForExploreInteraction }"
    data-explore-ui-control="true"
    :data-engine-surface-active="headerFrameMode === 'engine' ? 'true' : null"
    :data-engine-surface-key="headerFrameMode === 'engine' ? 'home-header' : null"
    :data-engine-surface-kind="headerFrameMode === 'engine' ? 'headerbar' : null"
  >
    <div ref="leftGroupRef" class="left-group" @mouseleave="resetIndicatorToActive">
      <div class="logo">USTB</div>
      <div v-if="!showDropDown" ref="tabListRef" class="nav-tab-list">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.key"
          class="nav-btn"
          :class="{ active: isActive(tab.key), 'nav-btn--hidden': index >= visibleTabCount }"
          :data-tab="tab.key"
          :aria-pressed="isActive(tab.key)"
          :tabindex="index >= visibleTabCount ? -1 : 0"
          :aria-hidden="index >= visibleTabCount ? 'true' : undefined"
          @click="changeTab(tab.key)"
          @mouseenter="moveIndicatorTo($event.target)"
          @focus="moveIndicatorTo($event.target)"
        >
          {{ tab.label }}
        </button>
      </div>
      <div
        class="indicator-surface-probe"
        :data-engine-surface-key="
          !showDropDown && indicatorFrameMode === 'engine' ? 'home-header-indicator' : null
        "
        :data-engine-surface-kind="
          !showDropDown && indicatorFrameMode === 'engine' ? 'indicator' : null
        "
        aria-hidden="true"
      ></div>
    </div>
    <Indicator ref="indicatorComp" :container="leftGroupRef" />

    <div ref="rightGroupRef" class="right-group">
      <TraditionalStyleToggle v-if="!showDropDown && props.active !== 'explore'" />
      <DarkModeToggle v-if="!showDropDown" />
      <button v-if="!showDropDown" class="avatar-button" @click="router.push('/me')">
        <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" class="avatar" />
        <span v-else class="avatar-fallback">{{ avatarFallback }}</span>
      </button>
      <AvatarMenu
        v-if="showDropDown"
        :avatar-url="avatarUrl"
        :avatar-fallback="avatarFallback"
        :tabs="Array.from(tabs)"
        :active="props.active"
        @select="changeTab"
        @profile="() => router.push('/me')"
      />
    </div>
  </header>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, onBeforeUnmount, watch } from 'vue'
import { useSurfaceActivationSlot } from '@/composables/surfaceActivation'
import Indicator from '@/components/Indicator.vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import DarkModeToggle from '@/components/DarkModeToggle.vue'
import TraditionalStyleToggle from '@/components/TraditionalStyleToggle.vue'
import AvatarMenu from '@/layouts/AvatarMenu.vue'
import { useSceneController } from '@/composables/scene/useSceneController'
import { toSameOriginAssetUrl } from '@/utils/sameOriginAsset'

import type { TabKey } from '@/constants/tabs'

const props = defineProps<{
  tabs?: { key: TabKey; label: string }[]
  active: TabKey
}>()
const emit = defineEmits<{ (e: 'tab-change', payload: TabKey): void }>()

const headerFrameMode = useSurfaceActivationSlot('header-frame')
const indicatorFrameMode = useSurfaceActivationSlot('header-indicator')
const { homeExploreInteractionActive, homeExploreUiReveal } = useSceneController()

const showDropDown = ref(false)
const visibleTabCount = ref(0)
const headerRef = ref<HTMLElement | null>(null)
const rightGroupRef = ref<HTMLElement | null>(null)
const tabListRef = ref<HTMLElement | null>(null)
let mobileQuery: MediaQueryList | null = null
let headerResizeObserver: ResizeObserver | null = null
let rightGroupResizeObserver: ResizeObserver | null = null
let tabButtonWidths: number[] = []

function syncViewportMode() {
  const nextValue = mobileQuery?.matches ?? false
  showDropDown.value = nextValue
  if (nextValue) {
    indicatorComp.value?.clearVars?.()
  }
}

function onViewportChange(event: MediaQueryListEvent) {
  showDropDown.value = event.matches
  if (event.matches) {
    indicatorComp.value?.clearVars?.()
  }
}

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 768px)')
  syncViewportMode()
  mobileQuery.addEventListener('change', onViewportChange)
  window.addEventListener('resize', onResize)
  headerResizeObserver = new ResizeObserver(() => {
    void updateHeaderLayout()
  })
  rightGroupResizeObserver = new ResizeObserver(() => {
    void updateHeaderLayout()
  })
  if (headerRef.value) {
    headerResizeObserver.observe(headerRef.value)
  }
  if (rightGroupRef.value) {
    rightGroupResizeObserver.observe(rightGroupRef.value)
  }
  void updateHeaderLayout()
})

const tabs = computed(() => props.tabs ?? [])

const hideForExploreInteraction = computed(
  () =>
    props.active === 'explore' && homeExploreInteractionActive.value && !homeExploreUiReveal.value,
)

function changeTab(key: TabKey) {
  emit('tab-change', key)
}

function isActive(key: TabKey) {
  return props.active === key
}

const userStore = useUserStore()
const avatarUrl = computed(() => toSameOriginAssetUrl(userStore.user?.avatar_url))
const avatarFallback = computed(() => (userStore.isGuest ? '访客' : 'U'))
const router = useRouter()

const leftGroupRef = ref<HTMLElement | null>(null)
const indicatorComp = ref<InstanceType<typeof Indicator> | null>(null)

function measureActive() {
  if (showDropDown.value) {
    indicatorComp.value?.clearVars?.()
    return
  }

  indicatorComp.value?.syncActive?.()
}

function moveIndicatorTo(target: EventTarget | null) {
  indicatorComp.value?.moveTo?.(target)
}

function resetIndicatorToActive() {
  measureActive()
}

function onResize() {
  syncViewportMode()
  void updateHeaderLayout()
}

function cacheTabButtonWidths() {
  const tabListElement = tabListRef.value
  if (!tabListElement) {
    return
  }

  const buttons = Array.from(tabListElement.querySelectorAll<HTMLElement>('.nav-btn'))
  if (buttons.length === 0) {
    return
  }

  tabButtonWidths = buttons.map(button => button.getBoundingClientRect().width)
}

async function updateHeaderLayout() {
  await nextTick()

  if (showDropDown.value) {
    visibleTabCount.value = 0
    indicatorComp.value?.clearVars?.()
    return
  }

  cacheTabButtonWidths()

  const headerElement = headerRef.value
  const rightGroupElement = rightGroupRef.value
  const leftGroupElement = leftGroupRef.value
  const tabListElement = tabListRef.value

  if (
    !headerElement ||
    !rightGroupElement ||
    !leftGroupElement ||
    !tabListElement ||
    tabButtonWidths.length === 0
  ) {
    visibleTabCount.value = tabs.value.length
    measureActive()
    return
  }

  const currentTabListWidth = tabListElement.getBoundingClientRect().width
  const nonTabWidth = leftGroupElement.getBoundingClientRect().width - currentTabListWidth
  const availableWidth = Math.max(
    0,
    headerElement.clientWidth - rightGroupElement.getBoundingClientRect().width - nonTabWidth - 24,
  )

  let consumedWidth = 0
  let nextVisibleCount = 0
  for (const buttonWidth of tabButtonWidths) {
    if (consumedWidth + buttonWidth > availableWidth) {
      break
    }
    consumedWidth += buttonWidth
    nextVisibleCount += 1
  }

  visibleTabCount.value = nextVisibleCount
  await nextTick()

  const activeIndex = tabs.value.findIndex(tab => tab.key === props.active)
  if (activeIndex === -1 || activeIndex >= visibleTabCount.value) {
    indicatorComp.value?.clearVars?.()
    return
  }

  measureActive()
}

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', onViewportChange)
  window.removeEventListener('resize', onResize)
  headerResizeObserver?.disconnect()
  rightGroupResizeObserver?.disconnect()
})

watch(
  () => [showDropDown.value, props.active, tabs.value.length],
  () => {
    void updateHeaderLayout()
  },
)
</script>
<style scoped>
.header-bar {
  display: flex;
  position: fixed;
  z-index: 1200;
  top: 0;
  left: 0;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 64px;
  padding: 0 32px;
  transition:
    box-shadow 0.3s ease,
    border-color 0.5s ease,
    background 0.5s ease,
    color 0.5s ease;
  border-bottom: 1px solid var(--theme-header-border);
  background: var(--theme-header-bg);
  box-shadow: var(--theme-header-shadow);
  color: var(--el-text-color-primary);
  backdrop-filter: blur(18px) saturate(1.35);
}

.header-bar--hidden {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
}

.header-bar:hover {
  box-shadow:
    0 6px 24px rgb(0 0 0 / 12%),
    0 2px 6px rgb(0 0 0 / 15%);
}

.left-group {
  display: flex;
  position: relative;
  align-items: center;
  min-width: 0;
  gap: 16px;
}

.logo {
  margin-right: 24px;
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 2px;
}

.nav-btn {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: 8px 18px;
  transition:
    background 0.2s,
    color 0.5s ease;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 18px;
  cursor: pointer;
}

.nav-tab-list {
  display: flex;
  flex-wrap: nowrap;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.nav-btn--hidden {
  display: none;
}

.left-group::after {
  content: '';
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  width: var(--indicator-width, 0);
  height: 100%;
  transform: translateX(var(--indicator-left, 0));
  transition:
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 180ms ease,
    background 0.5s ease;
  border-radius: 8px;
  opacity: var(--indicator-opacity, 0);
  background: rgb(255 255 255 / 20%);
  pointer-events: none;
  will-change: transform, width, opacity;
}

.indicator-surface-probe {
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  width: var(--indicator-width, 0);
  height: 100%;
  transform: translateX(var(--indicator-left, 0));
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
}

.right-group {
  display: flex;
  position: relative;
  flex-shrink: 0;
  align-items: center;
  margin-left: auto;
  gap: 18px;
}

.avatar {
  width: 40px;
  height: 40px;
  transition: transform 180ms ease;
  border-radius: 0;
  box-shadow: 0 8px 18px rgb(15 23 42 / 14%);
  object-fit: cover;
}

.avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, rgb(160 198 255 / 64%), rgb(255 255 255 / 92%));
  color: rgb(17 24 39 / 92%);
  font-size: 12px;
  font-weight: 700;
}

.avatar-button {
  all: unset;
  display: flex;
  box-sizing: border-box;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  transition:
    transform 180ms ease,
    background 180ms ease;
  border-radius: 0;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 12%),
    color-mix(in srgb, var(--theme-card-bg) 82%, transparent)
  );
  cursor: pointer;
}

@media (width <= 900px) {
  .header-bar {
    padding: 0 20px;
  }

  .right-group {
    gap: 12px;
  }
}

.avatar-button:hover {
  transform: translateY(-1px);
}

.avatar-button:active {
  transform: scale(0.94);
}

.avatar-button:hover .avatar {
  transform: scale(0.96);
}

.header-bar[data-engine-surface-active='true'] {
  border-bottom-color: transparent;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.header-bar[data-engine-surface-active='true'] .left-group::after {
  opacity: 0 !important;
  background: transparent;
}
</style>
