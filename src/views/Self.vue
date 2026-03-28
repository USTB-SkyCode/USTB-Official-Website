<template>
  <PageBackdropHost :frame-mode="pageFrameMode">
    <div class="page self-page app-page app-page--header" :data-frame-mode="pageFrameMode">
      <section class="profile-shell app-shell">
        <section
          class="profile-hero glass-card"
          data-engine-surface-key="self-profile-hero"
          data-engine-surface-kind="section"
        >
          <div class="profile-main">
            <button
              class="profile-avatar-button"
              :class="{
                'is-toggleable': canToggleAdminMask,
                'is-masked': isAdminMaskEnabled,
              }"
              :disabled="!canToggleAdminMask"
              type="button"
              @click="toggleAdminMask"
            >
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                alt="profile avatar"
                class="profile-avatar-image"
              />
              <span v-else class="profile-avatar-fallback">{{ avatarFallback }}</span>
            </button>

            <div class="profile-copy">
              <p class="eyebrow section-kicker">Account Center</p>
              <h1>{{ userStore.user?.username || '未登录用户' }}</h1>
              <p class="profile-email">{{ userStore.user?.email || '当前没有邮箱信息' }}</p>

              <div class="profile-badges">
                <span class="badge badge-accent">{{ permissionText }}</span>
                <span class="badge">{{ providerText }}</span>
              </div>
            </div>
          </div>

          <div class="profile-engine-tools" aria-label="Engine settings panel">
            <div ref="engineSettingsStackRef" class="engine-settings-stack">
              <button
                ref="engineSettingsButtonRef"
                class="engine-settings-button"
                type="button"
                :aria-expanded="engineSettingsOpen ? 'true' : 'false'"
                @click="toggleEngineSettingsPanel"
              >
                <span>Engine Settings</span>
                <small>{{ engineSettingsStatus }}</small>
              </button>

              <EngineSettingsPanel
                v-if="engineSettingsOpen"
                ref="engineSettingsPanelRef"
                @close="closeEngineSettingsPanel"
              />
            </div>

            <section class="engine-time-slider-panel">
              <div class="engine-slider-copy">
                <p class="engine-tools-kicker section-kicker">External Time</p>
                <div class="engine-slider-meta">
                  <strong>{{ effectiveTimeLabel }}</strong>
                  <button class="engine-time-reset" type="button" @click="resetEngineTimeOverrides">
                    重置
                  </button>
                </div>
              </div>
              <input
                class="engine-time-slider"
                type="range"
                min="0"
                max="24"
                step="0.25"
                :value="effectiveTimeHours"
                @input="onEngineTimeSliderInput"
              />
            </section>
          </div>

          <article
            class="profile-actions glass-actions"
            data-engine-surface-key="self-actions"
            data-engine-surface-kind="action-panel"
          >
            <p class="actions-kicker glass-actions-label">Quick Actions</p>
            <button
              class="profile-action-button action-home"
              type="button"
              @click="router.push('/home')"
            >
              回到主页
            </button>
            <button
              v-if="isAdmin"
              class="profile-action-button action-admin"
              type="button"
              @click="router.push('/admin')"
            >
              前往管理面板
            </button>
            <button class="profile-action-button action-logout" type="button" @click="logout">
              登出
            </button>
          </article>
        </section>

        <div class="profile-grid">
          <article
            class="profile-card card-highlight glass-card glass-card--accent"
            data-engine-surface-key="self-account-card"
            data-engine-surface-kind="card"
          >
            <p class="card-kicker section-kicker">账号信息</p>
            <dl class="detail-list">
              <div>
                <dt>用户 ID</dt>
                <dd>{{ userStore.user?.user_id || '未记录' }}</dd>
              </div>
              <div>
                <dt>登录方式</dt>
                <dd>{{ providerText }}</dd>
              </div>
              <div>
                <dt>登录时间</dt>
                <dd>{{ loginTimeText }}</dd>
              </div>
              <div>
                <dt>权限级别</dt>
                <dd>{{ permissionText }}</dd>
              </div>
            </dl>
          </article>

          <article
            class="profile-card glass-card"
            data-engine-surface-key="self-links-card"
            data-engine-surface-kind="card"
          >
            <p class="card-kicker section-kicker">友站连接</p>
            <div class="friend-links">
              <a
                class="friend-link"
                href="https://skin.ustb.world/"
                target="_blank"
                rel="noreferrer"
              >
                <span class="friend-link-title">VSkin 皮肤站</span>
                <span class="friend-link-url">skin.ustb.world</span>
              </a>
              <a
                class="friend-link"
                href="https://docs.ustb.world/"
                target="_blank"
                rel="noreferrer"
              >
                <span class="friend-link-title">文档库</span>
                <span class="friend-link-url">docs.ustb.world</span>
              </a>
            </div>
          </article>
        </div>
      </section>
    </div>
  </PageBackdropHost>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EngineSettingsPanel from '@/components/EngineSettingsPanel.vue'
import PageBackdropHost from '@/components/PageBackdropHost'
import { getEngineRuntimeConfig, subscribeEngineRuntimeConfig } from '@/config/runtime'
import { provideFrameMode } from '@/composables/frameMode'
import { useSceneController } from '@/composables/scene/useSceneController'
import { hasActiveEngineRuntimeConfigHost } from '@/engine/runtime/EngineRuntimeConfigHostBridge'
import { useDarkStore } from '@/stores/dark'
import { useUserStore } from '@/stores/user'
import { USER_PERMISSION } from '@/constants/userPermission'
import { notify } from '@/utils/notify'
import { toSameOriginAssetUrl } from '@/utils/sameOriginAsset'

const router = useRouter()
const {
  pageFrameMode,
  engineTimeManualOverrideActive,
  engineFixedTimeHours,
  hostRuntimeReady,
  setEngineTimeManualOverrideActive,
  setEngineFixedTimeHours,
  resetEngineTimeOverrides,
} = useSceneController()
const darkStore = useDarkStore()
const nowMs = ref(Date.now())
const runtimeConfig = ref(getEngineRuntimeConfig())
const engineSettingsOpen = ref(false)
const engineSettingsButtonRef = ref<HTMLButtonElement | null>(null)
const engineSettingsPanelRef = ref<HTMLElement | null>(null)
const engineSettingsStackRef = ref<HTMLElement | null>(null)
let nowTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeRuntimeConfig: (() => void) | null = null

provideFrameMode(pageFrameMode)

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const canToggleAdminMask = computed(() => userStore.canMaskAsUser)
const isAdminMaskEnabled = computed(() => userStore.adminMaskEnabled)

const permissionText = computed(() => {
  const permission = userStore.permission
  if (isAdminMaskEnabled.value && permission === USER_PERMISSION.USER) return '普通用户（前端伪装）'
  if (permission === USER_PERMISSION.SUPER_ADMIN) return '超级管理员'
  if (permission === USER_PERMISSION.ADMIN) return '管理员'
  if (permission === USER_PERMISSION.USER) return '普通用户'
  return '未知权限'
})

const providerText = computed(() => {
  if (userStore.isGuest) {
    return '访客登录'
  }

  return userStore.user?.provider || '未记录登录来源'
})
const avatarUrl = computed(() => toSameOriginAssetUrl(userStore.user?.avatar_url))

const avatarFallback = computed(() => {
  if (userStore.isGuest) {
    return '访客'
  }

  const name = userStore.user?.username?.trim()
  return name ? name.slice(0, 1).toUpperCase() : 'U'
})

const loginTimeText = computed(() => {
  const value = userStore.user?.login_time
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
})

function formatTimeLabel(hoursValue: number) {
  const normalized = ((hoursValue % 24) + 24) % 24
  const totalMinutes = Math.round(normalized * 60)
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`
}

function getBeijingHours() {
  const beijingNow = new Date(nowMs.value + 8 * 60 * 60 * 1000)
  return (
    beijingNow.getUTCHours() + beijingNow.getUTCMinutes() / 60 + beijingNow.getUTCSeconds() / 3600
  )
}

const effectiveTimeHours = computed(() => {
  if (engineTimeManualOverrideActive.value) {
    return engineFixedTimeHours.value
  }

  if (darkStore.themeMode === 'dark') {
    return 0
  }

  if (darkStore.themeMode === 'light') {
    return 12
  }

  return getBeijingHours()
})

const effectiveTimeLabel = computed(() => formatTimeLabel(effectiveTimeHours.value))

const engineSettingsStatus = computed(() => {
  if (!hostRuntimeReady.value) {
    return '引擎启动中'
  }

  return hasActiveEngineRuntimeConfigHost() ? '9 items' : '桥接不可用'
})

function toggleEngineSettingsPanel() {
  engineSettingsOpen.value = !engineSettingsOpen.value
}

function closeEngineSettingsPanel() {
  engineSettingsOpen.value = false
}

function handleEngineSettingsPointerDown(event: MouseEvent) {
  if (!engineSettingsOpen.value) {
    return
  }

  const target = event.target
  if (!(target instanceof Node)) {
    return
  }

  if (engineSettingsStackRef.value?.contains(target)) {
    return
  }

  closeEngineSettingsPanel()
}

function handleEngineSettingsKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !engineSettingsOpen.value) {
    return
  }

  closeEngineSettingsPanel()
  engineSettingsButtonRef.value?.focus()
}

function onEngineTimeSliderInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  const nextHours = Number(target.value)
  setEngineTimeManualOverrideActive(true)
  setEngineFixedTimeHours(nextHours)
}

onMounted(() => {
  unsubscribeRuntimeConfig = subscribeEngineRuntimeConfig(nextConfig => {
    runtimeConfig.value = nextConfig
  })

  nowTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)

  document.addEventListener('mousedown', handleEngineSettingsPointerDown, true)
  document.addEventListener('keydown', handleEngineSettingsKeyDown, true)
})

onBeforeUnmount(() => {
  unsubscribeRuntimeConfig?.()
  unsubscribeRuntimeConfig = null

  if (nowTimer !== null) {
    clearInterval(nowTimer)
    nowTimer = null
  }

  document.removeEventListener('mousedown', handleEngineSettingsPointerDown, true)
  document.removeEventListener('keydown', handleEngineSettingsKeyDown, true)
})

function toggleAdminMask() {
  if (!canToggleAdminMask.value) return
  userStore.toggleAdminMask()
}

async function logout() {
  try {
    await userStore.logout()
  } finally {
    localStorage.removeItem('loginPersistChoice')
    await router.replace('/')
    notify.success('已登出')
  }
}
</script>

<style scoped>
.page {
  --page-max-width: 1180px;
}

.profile-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.82fr) auto;
  gap: 20px;
  padding: 28px;
  overflow: visible;
}

.profile-main {
  display: flex;
  align-items: center;
  gap: 20px;
}

.profile-engine-tools {
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 4px 0;
}

.engine-settings-stack {
  display: grid;
  position: relative;
  z-index: 3;
}

.engine-settings-button,
.engine-time-slider-panel {
  display: grid;
  gap: 12px;
}

.engine-settings-popover {
  display: grid;
  position: absolute;
  z-index: 12;
  top: calc(100% + 10px);
  right: 0;
  width: min(380px, 72vw);
  max-height: min(68vh, 640px);
  overflow: auto;
  gap: 16px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 08%)),
    color-mix(in srgb, var(--theme-card-bg) 88%, transparent);
  box-shadow: 0 18px 46px rgb(15 23 42 / 18%);
  backdrop-filter: blur(18px);
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
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-card-bg) 60%, transparent);
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.engine-settings-close:hover,
.engine-settings-close:focus-visible {
  color: var(--theme-text-strong);
  border-color: color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border-strong));
  outline: none;
}

.engine-settings-group {
  display: grid;
  gap: 12px;
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
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 54%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-card-bg) 54%, transparent);
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
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.engine-setting-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-card-bg) 74%, transparent);
  color: var(--theme-text-strong);
  font: inherit;
  font-size: 13px;
}

.engine-setting-select:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--theme-accent) 36%, transparent);
  outline-offset: 2px;
}

.engine-setting-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.engine-toggle {
  min-width: 70px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-card-bg) 64%, transparent);
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.engine-toggle.is-active {
  border-color: color-mix(in srgb, var(--theme-accent) 28%, transparent);
  background: color-mix(in srgb, var(--theme-accent-soft) 42%, transparent);
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
  outline: 1px solid color-mix(in srgb, var(--theme-accent) 36%, transparent);
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
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-card-bg) 96%, transparent);
  box-shadow: 0 12px 32px rgb(15 23 42 / 16%);
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

.engine-settings-button {
  align-items: start;
  min-height: 58px;
  padding: 14px 16px;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease,
    color 180ms ease;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 70%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--theme-card-bg) 54%, transparent);
  color: var(--theme-text-strong);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.engine-settings-button:hover,
.engine-settings-button:focus-visible {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border-strong));
  background: color-mix(in srgb, var(--theme-accent-soft) 16%, var(--theme-card-bg));
  outline: none;
}

.engine-settings-button span {
  font-size: 14px;
  font-weight: 700;
}

.engine-settings-button small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.engine-tools-kicker {
  margin: 0;
}

.engine-slider-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.engine-slider-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.engine-slider-copy strong {
  color: var(--theme-text-strong);
  font-size: 14px;
  font-weight: 700;
}

.engine-time-reset {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.engine-time-reset:hover,
.engine-time-reset:focus-visible {
  color: var(--theme-text-strong);
  outline: none;
}

.engine-time-slider {
  width: 100%;
  accent-color: color-mix(in srgb, var(--theme-accent) 84%, #67e8f9);
}

.profile-avatar-button {
  display: inline-flex;
  position: relative;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
}

.profile-avatar-image,
.profile-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  border-radius: 999px;
}

.profile-avatar-image {
  object-fit: cover;
  box-shadow: 0 14px 34px rgb(15 23 42 / 18%);
}

.profile-avatar-fallback {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-accent-soft) 72%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 86%, transparent)
  );
  color: var(--theme-text-strong);
  font-size: 32px;
  font-weight: 800;
}

.profile-avatar-button.is-toggleable {
  cursor: pointer;
}

.profile-avatar-button.is-toggleable::after {
  content: '';
  position: absolute;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent);
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  inset: -8px;
}

.profile-avatar-button.is-toggleable:hover::after,
.profile-avatar-button.is-toggleable:focus-visible::after,
.profile-avatar-button.is-masked::after {
  opacity: 1;
}

.profile-avatar-button.is-toggleable:hover::after,
.profile-avatar-button.is-toggleable:focus-visible::after {
  transform: scale(1.02);
}

.profile-avatar-button.is-masked::after {
  border-color: color-mix(in srgb, #f59e0b 34%, transparent);
}

.profile-avatar-button:focus-visible {
  outline: none;
}

.profile-copy h1 {
  margin: 0 0 8px;
  color: var(--theme-text-strong);
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1;
}

.profile-email {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.profile-badges {
  display: flex;
  flex-wrap: wrap;
  margin-top: 14px;
  gap: 10px;
}

.badge {
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 84%, transparent);
  border-radius: 999px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-weight: 600;
}

.badge-accent {
  border-color: color-mix(in srgb, var(--theme-accent) 28%, transparent);
  background: color-mix(in srgb, var(--theme-accent-soft) 48%, transparent);
  color: var(--theme-text-strong);
}

.profile-action-button {
  --action-border: transparent;
  --action-bg: transparent;
  --action-bg-hover: transparent;
  --action-text: var(--theme-text-strong);
  --action-text-hover: var(--theme-text-strong);
  --action-shadow: none;

  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 42px;
  margin: 0;
  padding: 0 14px;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease;
  border: 1px solid var(--action-border);
  border-radius: 12px;
  background: var(--action-bg);
  box-shadow: var(--action-shadow);
  color: var(--action-text);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: left;
  cursor: pointer;
  appearance: none;
}

.profile-action-button:hover,
.profile-action-button:focus-visible {
  transform: translateY(-1px);
  border-color: var(--action-border);
  background: var(--action-bg-hover);
  color: var(--action-text-hover);
}

.profile-action-button:focus-visible {
  outline: none;
}

.action-home {
  --action-border: rgb(56 189 248 / 16%);
  --action-bg:
    linear-gradient(135deg, rgb(96 165 250 / 78%), rgb(56 189 248 / 72%)),
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 8%));
  --action-bg-hover: linear-gradient(135deg, rgb(59 130 246 / 88%), rgb(14 165 233 / 82%));
  --action-text: rgb(239 246 255);
  --action-text-hover: white;
  --action-shadow: 0 8px 18px rgb(37 99 235 / 14%);
}

.action-admin {
  --action-border: rgb(245 158 11 / 18%);
  --action-bg: rgb(245 158 11 / 92%);
  --action-bg-hover: rgb(217 119 6 / 96%);
  --action-text: rgb(255 251 235);
  --action-text-hover: rgb(255 255 255);
  --action-shadow: 0 8px 18px rgb(180 83 9 / 18%);
}

.action-logout {
  --action-border: rgb(239 68 68 / 18%);
  --action-bg: rgb(239 68 68 / 90%);
  --action-bg-hover: rgb(220 38 38 / 95%);
  --action-text: rgb(254 242 242);
  --action-text-hover: rgb(255 255 255);
  --action-shadow: 0 8px 18px rgb(185 28 28 / 18%);
}

:global(html.dark) .action-home {
  --action-border: rgb(96 165 250 / 28%);
  --action-bg:
    linear-gradient(135deg, rgb(59 130 246 / 78%), rgb(14 165 233 / 68%)),
    linear-gradient(180deg, rgb(255 255 255 / 12%), rgb(255 255 255 / 4%));
  --action-bg-hover: linear-gradient(135deg, rgb(59 130 246 / 92%), rgb(14 165 233 / 82%));
  --action-text: rgb(239 246 255);
  --action-text-hover: rgb(255 255 255 / 98%);
  --action-shadow: 0 10px 24px rgb(29 78 216 / 22%);
}

:global(html.dark) .action-admin {
  --action-border: rgb(251 191 36 / 24%);
  --action-bg: rgb(217 119 6 / 84%);
  --action-bg-hover: rgb(234 88 12 / 92%);
  --action-text: rgb(255 247 237);
  --action-text-hover: rgb(255 255 255);
  --action-shadow: 0 10px 24px rgb(120 53 15 / 18%);
}

:global(html.dark) .action-logout {
  --action-border: rgb(248 113 113 / 22%);
  --action-bg: rgb(220 38 38 / 82%);
  --action-bg-hover: rgb(185 28 28 / 92%);
  --action-text: rgb(254 242 242);
  --action-text-hover: rgb(255 255 255);
  --action-shadow: 0 10px 24px rgb(127 29 29 / 18%);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.profile-card {
  padding: 24px;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
  margin: 0;
}

.detail-list div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-list dt {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-list dd {
  margin: 0;
  color: var(--theme-text-strong);
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.friend-links {
  display: grid;
  gap: 12px;
}

.friend-link {
  display: grid;
  padding: 14px 16px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 78%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 8%)),
    color-mix(in srgb, var(--theme-card-bg) 66%, transparent);
  color: inherit;
  text-decoration: none;
  gap: 4px;
}

.friend-link:hover,
.friend-link:focus-visible {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border-strong));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 24%), rgb(255 255 255 / 10%)),
    color-mix(in srgb, var(--theme-accent-soft) 16%, var(--theme-card-bg));
  box-shadow: 0 10px 22px rgb(15 23 42 / 8%);
}

.friend-link:focus-visible {
  outline: none;
}

.friend-link-title {
  color: var(--theme-text-strong);
  font-size: 15px;
  font-weight: 700;
}

.friend-link-url {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

@media (width <= 900px) {
  .profile-hero,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .engine-settings-popover {
    position: static;
    width: 100%;
    max-height: none;
    margin-top: 10px;
  }

  .profile-engine-tools {
    padding-top: 0;
  }

  .profile-actions {
    min-width: 0;
  }
}

@media (width <= 640px) {
  .profile-main {
    flex-direction: column;
    align-items: flex-start;
  }

  .engine-setting-row__control,
  .engine-setting-row--toggle {
    grid-template-columns: 1fr;
  }

  .engine-toggle {
    width: 100%;
  }

  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
