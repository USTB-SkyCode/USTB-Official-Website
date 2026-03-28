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
        <p class="campus-explorer__copy">
          <span>桌面端可点击画面或按键进入操作；移动端可直接触摸左半屏移动、右半屏转向。</span>
          <span>按住 Alt 临时唤起界面，按 X 打开引擎设置，Esc 退出操作态。</span>
          <span>切换 128 材质包或修改需要重载的引擎设置时，左上角会显示当前重载状态。</span>
          <span v-if="takeoverStatusMessage">{{ takeoverStatusMessage }}</span>
        </p>

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

        <!-- <div class="campus-explorer__status">
          <span class="campus-explorer__badge">{{ isEngaged ? 'Interactive' : 'Browse' }}</span>
          <span class="campus-explorer__badge">共享 Persistent Engine</span>
        </div> -->

        <ul class="campus-explorer__tips">
          <li>桌面端：W A S D 移动</li>
          <li>桌面端：鼠标观察</li>
          <li>桌面端：Space / Shift 升降</li>
          <li>移动端：左半屏拖动移动</li>
          <li>移动端：右半屏拖动转向</li>
          <li>移动端：右半屏单点放置方块</li>
          <li>移动端：右半屏长按 0.3 秒破坏</li>
          <li>移动端：左上按钮可选取方块</li>
          <li>5 切换人称</li>
          <li>按住 Alt 临时唤起顶栏</li>
          <li>X 打开引擎设置</li>
          <li>Esc 退出操作态</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSceneController } from '@/composables/scene/useSceneController'

const {
  homeExploreInteractionActive,
  homeExploreEngineSettingsOpen,
  homeExploreUiReveal,
  takeoverEnabled,
  takeoverBlockedReason,
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
const takeoverStatusMessage = computed(() => {
  if (!takeoverEnabled.value) {
    return takeoverBlockedReason.value
      ? `当前设备已回退为 DOM 模式：${takeoverBlockedReason.value}`
      : '当前设备已回退为 DOM 模式。'
  }

  if (!hostRuntimeReady.value) {
    return '引擎仍在启动，完成后才可进入操作态。'
  }

  return ''
})
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
  pointer-events: auto;
}

.campus-explorer__eyebrow {
  margin: 0 0 6px;
  color: var(--theme-accent);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.campus-explorer__title {
  margin: 0;
  color: var(--theme-text-strong);
  font-size: clamp(1.8rem, 2.8vw, 2.4rem);
  line-height: 1.02;
}

.campus-explorer__copy {
  margin: 10px 0 0;
  color: color-mix(in srgb, var(--theme-text-strong) 72%, var(--theme-text-muted));
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
  color: var(--theme-text-strong);
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

.campus-explorer__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.campus-explorer__badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent-soft) 36%, transparent);
  color: var(--theme-text-strong);
  font-size: 0.82rem;
}

.campus-explorer__tips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin: 18px 0 0;
  padding-left: 18px;
  color: color-mix(in srgb, var(--theme-text-strong) 68%, var(--theme-text-muted));
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
    top: auto;
    right: 16px;
    bottom: 16px;
    left: 16px;
  }

  .campus-explorer__panel {
    width: auto;
    padding: 16px 18px;
    border-radius: 20px;
  }

  .campus-explorer__tips {
    grid-template-columns: minmax(0, 1fr);
  }

  .campus-explorer__escape-button {
    padding: 11px 15px;
  }
}
</style>
