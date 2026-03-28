<template>
  <button
    v-if="variant === 'icon'"
    class="traditional-style-toggle traditional-style-toggle--icon"
    type="button"
    :aria-label="buttonLabel"
    :title="buttonLabel"
    @click="openConfirm = true"
  >
    ?
  </button>

  <button
    v-else
    class="traditional-style-toggle traditional-style-toggle--menu"
    type="button"
    @click="openConfirm = true"
  >
    <span class="traditional-style-toggle__symbol">?</span>
    <span>{{ buttonLabel }}</span>
  </button>

  <Teleport to="body">
    <div v-if="openConfirm" class="traditional-style-dialog" @click.self="openConfirm = false">
      <div class="traditional-style-dialog__panel" role="dialog" aria-modal="true">
        <p class="traditional-style-dialog__eyebrow">Display Mode</p>
        <h3>{{ dialogTitle }}</h3>
        <p class="traditional-style-dialog__body">{{ dialogBody }}</p>

        <div class="traditional-style-dialog__actions">
          <button
            v-if="hasCopyableErrors"
            type="button"
            class="dialog-copy-link"
            @click="copyGlobalErrorReporterReport"
          >
            发生错误?移动端点我复制报错信息
          </button>
          <button
            type="button"
            class="dialog-action dialog-action--ghost"
            @click="openConfirm = false"
          >
            取消
          </button>
          <button type="button" class="dialog-action dialog-action--primary" @click="confirmToggle">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSceneController } from '@/composables/scene/useSceneController'
import { copyGlobalErrorReporterReport, useGlobalErrorReporterState } from '@/utils/errorReporter'

const _props = withDefaults(
  defineProps<{
    variant?: 'icon' | 'menu'
  }>(),
  {
    variant: 'icon',
  },
)

const { takeoverEnabled, setTakeoverEnabled } = useSceneController()
const openConfirm = ref(false)
const reporterState = useGlobalErrorReporterState()

const buttonLabel = computed(() => (takeoverEnabled.value ? '切换到传统样式' : '恢复 3D 样式'))
const dialogTitle = computed(() => (takeoverEnabled.value ? '切换到传统样式' : '恢复 3D 样式'))
const dialogBody = computed(() =>
  takeoverEnabled.value
    ? '是否切换到传统样式，不显示 3D 内容？'
    : '是否恢复 3D 内容并返回当前接管样式？',
)
const confirmLabel = computed(() => (takeoverEnabled.value ? '切换到传统样式' : '恢复 3D'))
const hasCopyableErrors = computed(() => reporterState.issues.length > 0)

function confirmToggle() {
  setTakeoverEnabled(!takeoverEnabled.value)
  openConfirm.value = false
}
</script>

<style scoped>
.traditional-style-toggle {
  border: 1px solid var(--theme-toggle-border);
  background: var(--theme-toggle-bg);
  color: var(--theme-text-strong);
  cursor: pointer;
}

.traditional-style-toggle--icon {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 16px;
  font-weight: 800;
}

.traditional-style-toggle--menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

.traditional-style-toggle__symbol {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent-soft) 36%, transparent);
}

.traditional-style-toggle:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--theme-accent-soft) 22%, var(--theme-toggle-bg));
}

.traditional-style-toggle--icon:hover {
  background: transparent;
}

.traditional-style-dialog {
  display: grid;
  position: fixed;
  z-index: 2400;
  inset: 0;
  place-items: center;
  padding: 24px;
  background: rgb(7 12 24 / 42%);
  backdrop-filter: blur(12px);
}

.traditional-style-dialog__panel {
  width: min(420px, calc(100vw - 32px));
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 84%, transparent);
  border-radius: 22px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg) 92%, transparent), transparent),
    color-mix(in srgb, var(--theme-card-bg) 90%, white 8%);
  box-shadow: var(--theme-shadow-hero);
  color: var(--theme-text-strong);
}

.traditional-style-dialog__eyebrow {
  margin: 0 0 8px;
  color: var(--theme-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.traditional-style-dialog__panel h3 {
  margin: 0;
  font-size: 24px;
}

.traditional-style-dialog__body {
  margin: 14px 0 0;
  color: var(--theme-text-muted);
  line-height: 1.6;
}

.traditional-style-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}

.dialog-copy-link {
  margin-right: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: rgb(37 99 235);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.dialog-action {
  min-width: 116px;
  height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.dialog-action--ghost {
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 78%, transparent);
  background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
  color: var(--theme-text-strong);
}

.dialog-action--primary {
  border: 1px solid color-mix(in srgb, var(--theme-accent) 34%, transparent);
  background: linear-gradient(135deg, rgb(59 130 246 / 88%), rgb(14 165 233 / 78%));
  color: white;
}

@media (width <= 720px) {
  .traditional-style-dialog__actions {
    flex-wrap: wrap;
  }

  .dialog-copy-link {
    width: 100%;
    text-align: left;
  }
}
</style>
