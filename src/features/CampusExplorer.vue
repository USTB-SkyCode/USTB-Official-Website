<template>
  <section class="campus-explorer" :data-engaged="isEngaged ? 'true' : 'false'">
    <Teleport to="body">
      <div v-if="showMobileEscapeButton" class="campus-explorer__mobile-actions">
        <button
          class="campus-explorer__escape-button"
          type="button"
          data-explore-ui-control="true"
          @click="revealHeaderBar"
        >
          脱离画面
        </button>
        <button
          class="campus-explorer__escape-button"
          type="button"
          data-explore-ui-control="true"
          @click="pickTargetBlock"
        >
          选取方块
        </button>
      </div>
    </Teleport>

    <div v-if="shouldShowHud" class="campus-explorer__hud">
      <div class="campus-explorer__panel" data-explore-ui-control="true">
        <p class="campus-explorer__eyebrow">Campus Explorer</p>
        <h2 class="campus-explorer__title">校园游览</h2>

        <div class="campus-explorer__actions">
          <button
            class="campus-explorer__button"
            type="button"
            data-explore-ui-control="true"
            :disabled="!canEnterInteraction"
            @click="enterInteraction"
          >
            {{ canEnterInteraction ? '进入画面' : '引擎不可用' }}
          </button>
          <button
            class="campus-explorer__button"
            type="button"
            data-explore-ui-control="true"
            @click="toggleEngineSettingsPanel"
          >
            {{ isEngineSettingsOpen ? '收起设置' : '引擎设置' }}
          </button>
        </div>

        <div class="campus-explorer__accordions">
          <div class="campus-accordion" :class="{ 'is-open': activeAccordion === 'desktop' }">
            <button
              class="campus-accordion__header"
              type="button"
              @click="toggleAccordion('desktop')"
            >
              <span>桌面端操作说明</span>
              <span class="campus-accordion__icon"></span>
            </button>
            <div v-show="activeAccordion === 'desktop'" class="campus-accordion__content">
              <ul class="campus-explorer__tips">
                <li>W A S D 移动</li>
                <li>鼠标转动视角</li>
                <li>Space / Shift 升降</li>
                <li>中键选择方块</li>
                <li>右键放置方块</li>
                <li>左键破坏方块</li>
                <li>5 切换人称</li>
                <li>Alt 唤起顶栏</li>
                <li>X 打开引擎设置</li>
                <li>Esc 退出操作态</li>
              </ul>
            </div>
          </div>

          <div class="campus-accordion" :class="{ 'is-open': activeAccordion === 'mobile' }">
            <button
              class="campus-accordion__header"
              type="button"
              @click="toggleAccordion('mobile')"
            >
              <span>移动端操作说明</span>
              <span class="campus-accordion__icon"></span>
            </button>
            <div v-show="activeAccordion === 'mobile'" class="campus-accordion__content">
              <ul class="campus-explorer__tips">
                <li>左半屏拖动 移动</li>
                <li>右半屏拖动 转向视角</li>
                <li>右半屏单点 放置方块</li>
                <li>右半屏长按0.3s 破坏</li>
                <li>左上按钮可选取方块</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSceneController } from '@/composables/scene/useSceneController'

const {
  homeExploreInteractionActive,
  homeExploreEngineSettingsOpen,
  homeExploreUiReveal,
  takeoverEnabled,
  hostRuntimeReady,
  requestHomeExploreMobileBlockAction,
  setHomeExploreEngineSettingsOpen,
  setHomeExploreInteractionActive,
  setHomeExploreUiReveal,
} = useSceneController()

const isEngaged = computed(() => homeExploreInteractionActive.value)
const isUiRevealVisible = computed(() => homeExploreUiReveal.value)
const isEngineSettingsOpen = computed(() => homeExploreEngineSettingsOpen.value)
const canEnterInteraction = computed(() => takeoverEnabled.value && hostRuntimeReady.value)

const activeAccordion = ref<'desktop' | 'mobile' | null>(null)
function toggleAccordion(panel: 'desktop' | 'mobile') {
  activeAccordion.value = activeAccordion.value === panel ? null : panel
}

const shouldShowHud = computed(
  () => !isEngaged.value || isUiRevealVisible.value || isEngineSettingsOpen.value,
)
const showMobileEscapeButton = computed(
  () => isEngaged.value && !isUiRevealVisible.value && !isEngineSettingsOpen.value,
)

function enterInteraction() {
  if (!canEnterInteraction.value) {
    return
  }

  setHomeExploreEngineSettingsOpen(false)
  setHomeExploreInteractionActive(true)
  setHomeExploreUiReveal(false)
}

function toggleEngineSettingsPanel() {
  const nextOpen = !homeExploreEngineSettingsOpen.value
  setHomeExploreEngineSettingsOpen(nextOpen)
  if (nextOpen) {
    setHomeExploreUiReveal(true)
  }
}

function revealHeaderBar() {
  setHomeExploreUiReveal(true)
}

function pickTargetBlock() {
  requestHomeExploreMobileBlockAction('pick')
}
</script>

<style scoped>
.campus-explorer {
  position: relative;
  min-height: 100vh;
  pointer-events: none;
}

.campus-explorer__hud {
  position: absolute;
  top: calc(var(--header-height, 64px) + 24px);
  left: 24px;
  z-index: 32;
  display: grid;
  gap: 14px;
  pointer-events: none;
}

.campus-explorer__mobile-actions {
  position: fixed;
  z-index: 1700;
  top: max(12px, env(safe-area-inset-top, 0px) + 12px);
  left: max(12px, env(safe-area-inset-left, 0px) + 12px);
  display: grid;
  gap: 10px;
}

.campus-explorer__escape-button {
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 78%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-card-bg) 84%, white 12%);
  color: var(--theme-text-strong);
  padding: 10px 14px;
  font: inherit;
  line-height: 1;
  box-shadow: var(--theme-shadow-card);
  pointer-events: auto;
  touch-action: manipulation;
  backdrop-filter: blur(14px);
}

.campus-explorer__escape-button:active {
  transform: scale(0.98);
}

.campus-explorer__panel {
  position: relative;
  z-index: 12;
  width: min(420px, calc(100vw - 48px));
  padding: 20px 22px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 78%, transparent);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 20%), rgb(255 255 255 / 6%)),
    color-mix(in srgb, var(--theme-card-bg) 80%, var(--theme-surface-glass-strong) 20%);
  box-shadow: var(--theme-shadow-hero);
  backdrop-filter: blur(18px) saturate(120%);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  color: rgb(255 255 255 / 96%);
  pointer-events: auto;
}

.campus-explorer__eyebrow {
  margin: 0 0 6px;
  color: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.campus-explorer__title {
  margin: 0;
  color: inherit;
  font-size: clamp(1.8rem, 2.8vw, 2.4rem);
  line-height: 1.02;
}

.campus-explorer__copy {
  margin: 10px 0 0;
  color: inherit;
  line-height: 1.6;
}

.campus-explorer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.campus-explorer__button {
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 76%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-card-bg) 84%, white 12%);
  color: inherit;
  padding: 10px 16px;
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}

.campus-explorer__button:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 26%, var(--theme-border-strong));
  background: color-mix(in srgb, var(--theme-accent-soft) 16%, var(--theme-card-bg));
}

.campus-explorer__button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.campus-explorer__accordions {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.campus-accordion {
  background: color-mix(in srgb, var(--theme-card-bg) 60%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 40%, transparent);
  border-radius: 12px;
  overflow: hidden;
  transition: background 200ms ease;
}

.campus-accordion.is-open {
  background: color-mix(in srgb, var(--theme-card-bg) 80%, transparent);
  border-color: color-mix(in srgb, var(--theme-border-strong) 80%, transparent);
}

.campus-accordion__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.campus-accordion__header:hover {
  background: color-mix(in srgb, var(--theme-accent-soft) 20%, transparent);
}

.campus-accordion__icon {
  width: 14px;
  height: 14px;
  position: relative;
  transition: transform 200ms ease;
}

.campus-accordion__icon::before,
.campus-accordion__icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 2px;
  background: currentColor;
  transform: translate(-50%, -50%);
  border-radius: 2px;
}

.campus-accordion__icon::after {
  width: 2px;
  height: 10px;
}

.campus-accordion.is-open .campus-accordion__icon {
  transform: rotate(180deg);
}

.campus-accordion.is-open .campus-accordion__icon::after {
  opacity: 0;
}

.campus-accordion__content {
  padding: 0 14px 14px;
}

.campus-explorer__tips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin: 0;
  padding-left: 18px;
  color: color-mix(in srgb, inherit 80%, transparent);
  font-size: 0.85rem;
}

:global(html:not(.dark)) .campus-explorer__panel {
  border-color: color-mix(in srgb, var(--theme-accent) 12%, var(--theme-border-strong));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 34%), rgb(255 255 255 / 10%)),
    color-mix(in srgb, var(--theme-card-bg) 74%, white 18%);
  box-shadow: 0 18px 44px rgb(27 46 94 / 10%);
}

@media (width > 900px) {
  .campus-explorer__mobile-actions {
    display: none;
  }
}

@media (width <= 720px) {
  .campus-explorer__hud {
    top: var(--header-height, 64px);
    right: 0;
    bottom: auto;
    left: 0;
    padding: 16px;
    align-items: flex-start;
  }

  .campus-explorer__panel {
    width: 100%;
    margin: 0;
    padding: 16px 18px;
    border-radius: 20px;
    box-sizing: border-box;
  }

  .campus-explorer__tips {
    grid-template-columns: minmax(0, 1fr);
  }

  .campus-explorer__escape-button {
    padding: 11px 15px;
  }
}
</style>
