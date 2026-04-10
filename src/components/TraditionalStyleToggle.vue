<template>
  <button
    v-if="variant === 'icon'"
    class="traditional-style-toggle traditional-style-toggle--icon"
    type="button"
    :aria-label="buttonLabel"
    :title="buttonLabel"
    @click="openDialog"
  >
    ?
  </button>

  <button
    v-else
    class="traditional-style-toggle traditional-style-toggle--menu"
    type="button"
    @click="openDialog"
  >
    <span class="traditional-style-toggle__symbol">?</span>
    <span>{{ buttonLabel }}</span>
  </button>

  <Teleport to="body">
    <div v-if="openConfirm" class="traditional-style-dialog" @click.self="openConfirm = false">
      <div class="traditional-style-dialog__panel" role="dialog" aria-modal="true">
        <p class="traditional-style-dialog__eyebrow">Display Mode</p>
        <h2 class="traditional-style-dialog__title">{{ dialogTitle }}</h2>

        <div class="traditional-style-dialog__options">
          <label
            v-if="displayModePreference !== 'engine'"
            class="traditional-style-dialog__checkbox"
          >
            <input
              v-model="useGlobalChoice"
              type="checkbox"
              class="traditional-style-dialog__checkbox-input"
            />
            <span class="traditional-style-dialog__checkbox-label">全局使用</span>
          </label>
          <label class="traditional-style-dialog__checkbox">
            <input
              v-model="rememberChoice"
              type="checkbox"
              class="traditional-style-dialog__checkbox-input"
            />
            <span class="traditional-style-dialog__checkbox-label">记住选择</span>
          </label>
        </div>

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
            确认
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSceneController } from '@/composables/scene/useSceneController'
import { notify } from '@/utils/notify'
import { copyGlobalErrorReporterReport, useGlobalErrorReporterState } from '@/utils/errorReporter'

const _props = withDefaults(
  defineProps<{
    variant?: 'icon' | 'menu'
  }>(),
  {
    variant: 'icon',
  },
)

const {
  displayModePreference,
  takeoverEnabled,
  takeoverBlockedReason,
  setDisplayModePreference,
  setTakeoverEnabled,
} = useSceneController()
const openConfirm = ref(false)
const useGlobalChoice = ref(false)
const rememberChoice = ref(false)
const reporterState = useGlobalErrorReporterState()

const buttonLabel = computed(() =>
  displayModePreference.value === 'engine' ? '切换到传统样式' : '恢复 3D 样式',
)
const dialogTitle = computed(() =>
  displayModePreference.value === 'engine' ? '是否切换到传统 DOM 样式？' : '是否恢复 3D 样式？',
)
const hasCopyableErrors = computed(() => reporterState.issues.length > 0)

function openDialog() {
  useGlobalChoice.value = false
  rememberChoice.value = false
  openConfirm.value = true
}

function confirmToggle() {
  if (displayModePreference.value === 'engine') {
    setDisplayModePreference('dom', rememberChoice.value)
    openConfirm.value = false
    return
  }

  if (takeoverBlockedReason.value) {
    notify.warning(`当前无法恢复 3D：${takeoverBlockedReason.value}`)
    openConfirm.value = false
    return
  }

  if (!takeoverEnabled.value) {
    setTakeoverEnabled(true)
  }

  if (useGlobalChoice.value) {
    setDisplayModePreference('engine', rememberChoice.value)
  } else {
    setDisplayModePreference('dom', rememberChoice.value)
  }

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
  max-height: min(78vh, 620px);
  overflow: auto;
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

.traditional-style-dialog__title {
  margin: 0;
  font-size: 24px;
}

.traditional-style-dialog__options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0 0;
}

.traditional-style-dialog__checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  font-size: 0.95rem;
  color: var(--theme-text-strong);
}

.traditional-style-dialog__checkbox-input {
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

.traditional-style-dialog__checkbox-input:hover {
  border-color: var(--theme-accent);
}

.traditional-style-dialog__checkbox-input:checked {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}

.traditional-style-dialog__checkbox-input:checked::after {
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
  touch-action: manipulation;
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
  .traditional-style-dialog {
    align-items: end;
    padding: max(12px, env(safe-area-inset-top, 0px) + 8px) 12px
      max(12px, env(safe-area-inset-bottom, 0px) + 8px);
  }

  .traditional-style-dialog__panel {
    width: min(100%, 100vw - 24px);
    max-height: min(84dvh, 720px);
    padding: 20px 18px calc(18px + env(safe-area-inset-bottom, 0px));
    border-radius: 24px 24px 18px 18px;
  }

  .traditional-style-dialog__title {
    font-size: 1.18rem;
    line-height: 1.35;
  }

  .traditional-style-dialog__options {
    gap: 16px;
    margin-top: 16px;
  }

  .traditional-style-dialog__checkbox {
    font-size: 1rem;
    padding: 6px 0;
  }

  .traditional-style-dialog__checkbox-input {
    width: 24px;
    height: 24px;
    border-radius: 7px;
  }

  .traditional-style-dialog__checkbox-input:checked::after {
    border-width: 0 3px 3px 0;
    width: 6px;
    height: 12px;
  }

  .traditional-style-dialog__actions {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 10px;
  }

  .dialog-copy-link {
    width: 100%;
    margin-right: 0;
    padding: 6px 0 2px;
    text-align: left;
  }

  .dialog-action {
    width: 100%;
    min-width: 0;
    height: 48px;
    border-radius: 16px;
  }
}
</style>
