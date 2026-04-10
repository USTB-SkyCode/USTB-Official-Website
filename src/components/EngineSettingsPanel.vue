<template>
  <section class="engine-settings-popover" data-explore-ui-control="true">
    <header class="engine-settings-popover__header">
      <div>
        <p class="engine-tools-kicker section-kicker">{{ kicker }}</p>
        <strong>{{ title }}</strong>
      </div>
      <button class="engine-settings-close" type="button" @click="$emit('close')">关闭</button>
    </header>

    <section class="engine-settings-group">
      <div class="engine-settings-group__title">Resource</div>

      <label class="engine-setting-row">
        <div class="engine-setting-row__label">
          <span>Resource Pack</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="资源包属于启动期配置。切换后会立即刷新当前引擎 session 生效，但不会导致整页刷新。"
          >
            ?
            <span class="engine-setting-tooltip">资源包</span>
          </span>
        </div>
        <div class="engine-setting-row__control engine-setting-row__control--stacked">
          <div class="engine-setting-select-shell">
            <select
              class="engine-setting-select"
              :value="resourceStore.activeKey"
              @change="onResourcePackChange"
            >
              <option
                v-for="resource in resourceStore.resources"
                :key="resource.key"
                :value="resource.key"
              >
                {{ resource.label }}
              </option>
            </select>
            <span class="engine-setting-select-shell__icon" aria-hidden="true"></span>
          </div>
          <span class="engine-setting-hint"
            >{{ activeResourceLabel }} ·
            {{ hostRuntimeReady ? 'host ready' : 'host booting' }}</span
          >
        </div>
      </label>
    </section>

    <section class="engine-settings-group">
      <div class="engine-settings-group__title">Controls</div>

      <label class="engine-setting-row">
        <div class="engine-setting-row__label">
          <span>Move Speed</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="控制每秒移动速度。立即生效，不需要重建区块或重启页面。"
          >
            ?
            <span class="engine-setting-tooltip">移动速度</span>
          </span>
        </div>
        <div class="engine-setting-row__control">
          <input
            class="engine-setting-slider"
            type="range"
            min="20"
            max="240"
            step="5"
            :value="runtimeConfig.controls.moveSpeed"
            @input="onMoveSpeedInput"
          />
          <span class="engine-setting-value">{{
            runtimeConfig.controls.moveSpeed.toFixed(0)
          }}</span>
        </div>
      </label>

      <label class="engine-setting-row">
        <div class="engine-setting-row__label">
          <span>Mouse Sensitivity</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="鼠标视角灵敏度。立即生效。"
          >
            ?
            <span class="engine-setting-tooltip">鼠标视角灵敏度</span>
          </span>
        </div>
        <div class="engine-setting-row__control">
          <input
            class="engine-setting-slider"
            type="range"
            min="0.02"
            max="0.4"
            step="0.01"
            :value="runtimeConfig.controls.mouseSensitivity"
            @input="onMouseSensitivityInput"
          />
          <span class="engine-setting-value">{{
            runtimeConfig.controls.mouseSensitivity.toFixed(2)
          }}</span>
        </div>
      </label>

      <label class="engine-setting-row">
        <div class="engine-setting-row__label">
          <span>Touch Sensitivity</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="触摸转向灵敏度。立即生效。"
          >
            ?
            <span class="engine-setting-tooltip">触摸转向灵敏度</span>
          </span>
        </div>
        <div class="engine-setting-row__control">
          <input
            class="engine-setting-slider"
            type="range"
            min="0.1"
            max="1.5"
            step="0.05"
            :value="runtimeConfig.controls.touchSensitivity"
            @input="onTouchSensitivityInput"
          />
          <span class="engine-setting-value">{{
            runtimeConfig.controls.touchSensitivity.toFixed(2)
          }}</span>
        </div>
      </label>

      <label class="engine-setting-row">
        <div class="engine-setting-row__label">
          <span>Joystick Radius</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="触摸摇杆半径。立即生效；更大表示更长的拖动行程。"
          >
            ?
            <span class="engine-setting-tooltip">触摸摇杆半径</span>
          </span>
        </div>
        <div class="engine-setting-row__control">
          <input
            class="engine-setting-slider"
            type="range"
            min="20"
            max="120"
            step="2"
            :value="runtimeConfig.controls.touchJoystickRadius"
            @input="onTouchJoystickRadiusInput"
          />
          <span class="engine-setting-value">{{
            runtimeConfig.controls.touchJoystickRadius.toFixed(0)
          }}</span>
        </div>
      </label>
    </section>

    <section class="engine-settings-group">
      <div class="engine-settings-group__title">Chunk</div>

      <label class="engine-setting-row">
        <div class="engine-setting-row__label">
          <span>Load Distance</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="调整区块加载视距。设置会静默保存，刷新当前引擎 session 后生效；不会立即打断当前 session，也不会导致整页重启。"
          >
            ?
            <span class="engine-setting-tooltip">调整区块加载半径</span>
          </span>
        </div>
        <div class="engine-setting-row__control">
          <input
            class="engine-setting-slider"
            type="range"
            min="2"
            max="32"
            step="1"
            :value="runtimeConfig.chunk.loadDistance"
            @input="onLoadDistanceInput"
          />
          <span class="engine-setting-value">{{
            runtimeConfig.chunk.loadDistance.toFixed(0)
          }}</span>
        </div>
      </label>
    </section>

    <section class="engine-settings-group">
      <div class="engine-settings-group__title">Lighting</div>

      <div class="engine-setting-row engine-setting-row--toggle">
        <div class="engine-setting-row__label">
          <span>Point Lights</span>
          <span class="engine-setting-tooltip-anchor" tabindex="0" title="点光源。立即热切生效。">
            ?
            <span class="engine-setting-tooltip">点光源开关 性能消耗高</span>
          </span>
        </div>
        <button
          class="engine-toggle"
          :class="{ 'is-active': runtimeConfig.lighting.enablePointLights }"
          type="button"
          :aria-pressed="runtimeConfig.lighting.enablePointLights ? 'true' : 'false'"
          @click="togglePointLights"
        >
          {{ runtimeConfig.lighting.enablePointLights ? 'On' : 'Off' }}
        </button>
      </div>

      <div class="engine-setting-row engine-setting-row--toggle">
        <div class="engine-setting-row__label">
          <span>Vertex Lighting</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="顶点光照。切换后会像资源包切换一样立即刷新当前引擎 session 生效，但不会导致整页刷新。"
          >
            ?
            <span class="engine-setting-tooltip">方块烘焙光照</span>
          </span>
        </div>
        <button
          class="engine-toggle"
          :class="{ 'is-active': runtimeConfig.lighting.enableVertexLighting }"
          type="button"
          :aria-pressed="runtimeConfig.lighting.enableVertexLighting ? 'true' : 'false'"
          @click="toggleVertexLighting"
        >
          {{ runtimeConfig.lighting.enableVertexLighting ? 'On' : 'Off' }}
        </button>
      </div>

      <div class="engine-setting-row engine-setting-row--toggle">
        <div class="engine-setting-row__label">
          <span>Smooth Lighting</span>
          <span
            class="engine-setting-tooltip-anchor"
            tabindex="0"
            title="平滑光照。依赖 Vertex Lighting，切换后会刷新当前引擎 session 生效，但不会导致整页刷新。"
          >
            ?
            <span class="engine-setting-tooltip">平滑光照。依赖 Vertex Lighting</span>
          </span>
        </div>
        <button
          class="engine-toggle"
          :class="{ 'is-active': runtimeConfig.lighting.enableSmoothLighting }"
          type="button"
          :disabled="!runtimeConfig.lighting.enableVertexLighting"
          :aria-pressed="runtimeConfig.lighting.enableSmoothLighting ? 'true' : 'false'"
          @click="toggleSmoothLighting"
        >
          {{ runtimeConfig.lighting.enableSmoothLighting ? 'On' : 'Off' }}
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  applyEngineRuntimeConfigPatch,
  getEngineRuntimeConfig,
  subscribeEngineRuntimeConfig,
  type EngineRuntimeConfigPatch,
} from '@/config/runtime'
import { classifyRuntimeConfigPatch } from '@/engine/runtime/EngineRuntimeConfigApplier'
import { applyEngineRuntimeConfigThroughHost } from '@/engine/runtime/EngineRuntimeConfigHostBridge'
import { useSceneController } from '@/composables/scene/useSceneController'
import { useResourceStore } from '@/stores/resource'

const props = withDefaults(
  defineProps<{
    title?: string
    kicker?: string
  }>(),
  {
    title: 'Engine Session Settings',
    kicker: 'Runtime + Refresh',
  },
)

defineEmits<{
  (e: 'close'): void
}>()

const { hostRuntimeReady } = useSceneController()
const resourceStore = useResourceStore()
const runtimeConfig = ref(getEngineRuntimeConfig())

const unsubscribeRuntimeConfig = subscribeEngineRuntimeConfig(nextConfig => {
  runtimeConfig.value = nextConfig
})

onBeforeUnmount(() => {
  unsubscribeRuntimeConfig()
})

const title = computed(() => props.title)
const kicker = computed(() => props.kicker)
const activeResourceLabel = computed(() => resourceStore.activeResource.label)

function applyRuntimeSettingsPatch(patch: EngineRuntimeConfigPatch) {
  const result = applyEngineRuntimeConfigThroughHost(patch)
  if (result) {
    return result
  }

  applyEngineRuntimeConfigPatch(patch)
  return classifyRuntimeConfigPatch(patch)
}

function onMoveSpeedInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  applyRuntimeSettingsPatch({
    controls: { moveSpeed: Number(target.value) },
  })
}

function onMouseSensitivityInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  applyRuntimeSettingsPatch({
    controls: { mouseSensitivity: Number(target.value) },
  })
}

function onTouchSensitivityInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  applyRuntimeSettingsPatch({
    controls: { touchSensitivity: Number(target.value) },
  })
}

function onTouchJoystickRadiusInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  applyRuntimeSettingsPatch({
    controls: { touchJoystickRadius: Number(target.value) },
  })
}

function onLoadDistanceInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  applyRuntimeSettingsPatch({
    chunk: { loadDistance: Number(target.value) },
  })
}

function onResourcePackChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) {
    return
  }

  resourceStore.setResource(target.value)
}

function togglePointLights() {
  applyRuntimeSettingsPatch({
    lighting: { enablePointLights: !runtimeConfig.value.lighting.enablePointLights },
  })
}

function toggleVertexLighting() {
  const enableVertexLighting = !runtimeConfig.value.lighting.enableVertexLighting
  applyRuntimeSettingsPatch({
    lighting: {
      enableVertexLighting,
      enableSmoothLighting: enableVertexLighting
        ? runtimeConfig.value.lighting.enableSmoothLighting
        : false,
    },
  })
}

function toggleSmoothLighting() {
  if (!runtimeConfig.value.lighting.enableVertexLighting) {
    return
  }

  applyRuntimeSettingsPatch({
    lighting: { enableSmoothLighting: !runtimeConfig.value.lighting.enableSmoothLighting },
  })
}
</script>

<style scoped>
.engine-settings-popover {
  --engine-bg-solid: var(--theme-surface-glass-strong);

  --engine-panel-surface: color-mix(in srgb, var(--engine-bg-solid) 84%, transparent);
  --engine-panel-surface-strong: color-mix(in srgb, var(--engine-bg-solid) 92%, transparent);
  --engine-panel-border: color-mix(in srgb, var(--theme-border-strong) 82%, transparent);
  --engine-control-surface: color-mix(in srgb, var(--engine-bg-solid) 68%, transparent);
  --engine-control-surface-strong: color-mix(in srgb, var(--engine-bg-solid) 82%, transparent);
  --engine-control-border: color-mix(in srgb, var(--theme-border-strong) 70%, transparent);
  --engine-focus-ring: color-mix(in srgb, var(--theme-accent) 32%, transparent);
  --engine-muted-text: var(--theme-text-muted);

  display: grid;
  gap: 16px;
  width: min(380px, 72vw);
  max-height: min(68vh, 640px);
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--engine-panel-border);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-surface-glass-strong) 74%, transparent),
      transparent
    ),
    var(--engine-panel-surface);
  box-shadow: var(--theme-shadow-hero);
  backdrop-filter: blur(18px) saturate(120%);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  color: var(--theme-text-strong);
  pointer-events: auto;
}

.engine-settings-popover__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.engine-settings-popover__header strong {
  color: var(--theme-text-strong);
  font-size: 15px;
}

.engine-settings-close {
  padding: 6px 10px;
  border: 1px solid var(--engine-panel-border);
  border-radius: 999px;
  background: var(--engine-control-surface);
  color: var(--theme-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.engine-settings-close:hover,
.engine-settings-close:focus-visible {
  color: var(--theme-text-strong);
  border-color: var(--engine-focus-ring);
  outline: none;
}

.engine-settings-group {
  display: grid;
  gap: 12px;
}

.engine-setting-note {
  margin: 0;
  color: var(--engine-muted-text);
  font-size: 12px;
  line-height: 1.5;
}

.engine-settings-group__title {
  color: var(--theme-text-strong);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.engine-setting-row {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 58%, transparent);
  border-radius: 14px;
  background: linear-gradient(
    180deg,
    var(--engine-control-surface-strong),
    var(--engine-control-surface)
  );
}

.engine-setting-row--toggle {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.engine-setting-row__label {
  display: inline-flex;
  position: relative;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--theme-text-strong);
  font-size: 13px;
  font-weight: 700;
}

.engine-setting-row__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.engine-setting-row__control--stacked {
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
}

.engine-setting-slider {
  width: 100%;
  accent-color: color-mix(in srgb, var(--theme-accent) 82%, #67e8f9);
}

.engine-setting-value {
  min-width: 50px;
  color: var(--engine-muted-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.engine-setting-select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  padding: 11px 40px 11px 12px;
  border: 1px solid var(--engine-control-border);
  border-radius: 12px;
  background: transparent;
  color: var(--theme-text-strong);
  font: inherit;
  font-size: 13px;
  line-height: 1.25;
  cursor: pointer;
}

.engine-setting-select-shell {
  position: relative;
  width: 100%;
}

.engine-setting-select-shell__icon {
  position: absolute;
  top: 50%;
  right: 12px;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--theme-text-muted);
  border-bottom: 2px solid var(--theme-text-muted);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}

.engine-setting-select:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 34%, var(--engine-control-border));
}

.engine-setting-select:focus-visible {
  outline: 1px solid var(--engine-focus-ring);
  outline-offset: 2px;
}

.engine-setting-select option {
  background: var(--theme-surface-glass-strong);
  color: var(--theme-text-strong);
}

.engine-setting-hint {
  color: var(--engine-muted-text);
  font-size: 12px;
  line-height: 1.4;
}

.engine-toggle {
  min-width: 70px;
  padding: 8px 12px;
  border: 1px solid var(--engine-control-border);
  border-radius: 999px;
  background: var(--engine-control-surface);
  color: var(--theme-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.engine-toggle.is-active {
  border-color: color-mix(in srgb, var(--theme-accent) 28%, transparent);
  background: color-mix(in srgb, var(--theme-accent-soft) 46%, var(--engine-control-surface));
  color: var(--theme-text-strong);
}

.engine-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.engine-setting-tooltip-anchor {
  display: inline-flex;
  position: relative;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent-soft) 34%, transparent);
  color: var(--theme-text-strong);
  font-size: 11px;
  font-weight: 800;
  cursor: help;
}

.engine-setting-tooltip-anchor:focus-visible {
  outline: 1px solid var(--engine-focus-ring);
  outline-offset: 2px;
}

.engine-setting-tooltip {
  position: absolute;
  z-index: 2;
  bottom: calc(100% + 10px);
  left: 50%;
  width: 220px;
  padding: 10px 12px;
  transform: translateX(-50%);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
  border: 1px solid var(--engine-panel-border);
  border-radius: 12px;
  background: var(--engine-panel-surface-strong);
  box-shadow: var(--theme-shadow-soft);
  color: var(--theme-text-strong);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  opacity: 0;
  pointer-events: none;
}

.engine-setting-tooltip-anchor:hover .engine-setting-tooltip,
.engine-setting-tooltip-anchor:focus-visible .engine-setting-tooltip {
  transform: translateX(-50%) translateY(-2px);
  opacity: 1;
}

.engine-tools-kicker {
  margin: 0;
}

@media (width <= 720px) {
  .engine-settings-popover {
    width: min(100vw - 24px, 420px);
    max-height: min(82dvh, 720px);
    padding: 14px;
    border-radius: 20px 20px 16px 16px;
  }

  .engine-settings-group {
    gap: 10px;
  }

  .engine-setting-row {
    padding: 11px;
    border-radius: 13px;
  }

  .engine-setting-row__label {
    font-size: 12px;
  }

  .engine-setting-row__control--stacked {
    gap: 8px;
  }

  .engine-setting-select {
    padding: 12px 42px 12px 12px;
    font-size: 14px;
  }

  .engine-setting-select-shell__icon {
    right: 14px;
  }

  .engine-setting-hint,
  .engine-setting-value {
    font-size: 11px;
  }

  .engine-toggle {
    min-width: 64px;
    padding: 9px 11px;
  }
}
</style>
