<template>
  <PageBackdropHost :frame-mode="pageFrameMode">
    <div class="login-page" :data-frame-mode="pageFrameMode">
      <div v-if="showLoginPortal && pageFrameMode !== 'engine'" class="waves" aria-hidden="true">
        <div class="wave w1"></div>
        <div class="wave w2"></div>
        <div class="wave w3"></div>
      </div>

      <section
        v-if="showLoginLoading"
        class="login-loading-panel"
        aria-live="polite"
        data-login-ui-control="true"
      >
        <p class="login-loading-kicker">{{ loadingKicker }}</p>
        <strong>{{ loadingTitle }}</strong>
        <span>{{ loadingCopy }}</span>
      </section>

      <div v-else-if="showLoginPortal" class="login-panel" data-login-ui-control="true">
        <p class="login-kicker">Auth Portal</p>
        <h1>欢迎来到体素工作坊官网</h1>
        <p class="login-copy">选择登陆方式</p>

        <div class="login-btns" role="navigation" aria-label="第三方登录">
          <button class="oauth-link" @click="onAuthClick('/auth/github')">GitHub 登录</button>
          <!-- <button class="oauth-link" @click="onAuthClick('/auth/mua')">MUA 登录</button> -->
          <button class="oauth-link" @click="onAuthClick('/auth/ustb')">USTB 登录</button>
          <button class="oauth-link oauth-link--guest" @click="enterGuest">访客进入</button>
        </div>
      </div>

      <div
        v-if="showConfirm"
        class="confirm-backdrop"
        role="dialog"
        aria-modal="true"
        data-login-ui-control="true"
      >
        <div class="confirm-box">
          <p class="confirm-kicker">Login Preference</p>
          <strong class="confirm-title">是否记住登录方式</strong>
          <p class="confirm-copy">下次进入登录页时，可直接沿用本次选择的登录入口。</p>
          <div class="confirm-actions">
            <button class="confirm-button confirm-button--secondary" @click="confirm(false)">
              仅本次
            </button>
            <button class="confirm-button confirm-button--primary" @click="confirm(true)">
              记住并继续
            </button>
          </div>
        </div>
      </div>
    </div>
  </PageBackdropHost>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageBackdropHost from '@/components/PageBackdropHost'
import { GAME_CONFIG } from '@/engine/config'
import { provideFrameMode } from '@/composables/frameMode'
import { useLoginAuthFlow } from '@/composables/login/useLoginAuthFlow'
import { applyEngineRuntimeConfigPatch, getEngineRuntimeConfig } from '@/config/runtime'
import { useSceneController } from '@/composables/scene/useSceneController'
import { useUserStore } from '@/stores/user'
import { notify } from '@/utils/notify'
import { isLikelyMobileDevice } from '@/utils/platformCapabilities'

const activeEngineTriggerId = ref<string | null>(null)
const route = useRoute()
const userStore = useUserStore()
const {
  pageFrameMode,
  displayModePreference,
  takeoverEnabled,
  takeoverBlockedReason,
  hostRuntimeReady,
  loginPlayerPosition,
} = useSceneController()
const mobileDevice = computed(() => isLikelyMobileDevice())

const {
  showConfirm,
  isPopupCallback,
  popupRedirectTarget,
  completeLogin,
  onClick: onAuthClick,
  confirm,
  launchProvider,
} = useLoginAuthFlow({
  mobileDevice,
  currentUser: computed(() => userStore.user),
  fetchUser: options => userStore.fetchUser(options),
})

provideFrameMode(pageFrameMode)
const showLoginLoading = computed(() => isPopupCallback.value)
const showLoginPortal = computed(
  () =>
    !isPopupCallback.value &&
    (mobileDevice.value || displayModePreference.value === 'dom' || !takeoverEnabled.value),
)
const loadingKicker = computed(() => (isPopupCallback.value ? 'OAuth Callback' : 'Scene Loading'))
const loadingTitle = computed(() =>
  isPopupCallback.value ? '正在完成登录认证' : '正在进入登录场景',
)
const loadingCopy = computed(() => {
  if (isPopupCallback.value) {
    return '认证成功后将自动返回主窗口。'
  }

  if (!takeoverEnabled.value) {
    return takeoverBlockedReason.value
      ? `引擎接管已回退：${takeoverBlockedReason.value}`
      : '当前默认使用原生 DOM 登录，可在校园游览中按需启动 3D 引擎。'
  }

  if (mobileDevice.value) {
    return '移动端使用当前窗口完成 OAuth 登录，不再依赖 popup。'
  }

  return hostRuntimeReady.value ? '正在等待登录场景完成页面接管' : '正在启动登录场景资源与相机'
})

type TriggerBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

type LoginEngineTrigger = {
  id: string
  bounds: TriggerBounds
  action: () => void | Promise<void>
}

type TriggerSubjectBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

const LOGIN_ROUTE_MOVE_SPEED = 40
const LOGIN_TRIGGER_HALF_WIDTH = 0.35
const LOGIN_TRIGGER_HEIGHT = Math.max(1, GAME_CONFIG.WORLD.PLAYER.CAMERA_EYE_HEIGHT)
const previousLoginMoveSpeed = ref<number | null>(null)

function buildTriggerBounds(startX: number, startY: number, startZ: number): TriggerBounds {
  return {
    minX: startX,
    maxX: startX + 1,
    minY: startY,
    maxY: startY + 5,
    minZ: startZ,
    maxZ: startZ + 4,
  }
}

function resolveTriggerSubjectBounds(
  position: readonly [number, number, number],
): TriggerSubjectBounds {
  return {
    minX: position[0] - LOGIN_TRIGGER_HALF_WIDTH,
    maxX: position[0] + LOGIN_TRIGGER_HALF_WIDTH,
    minY: position[1],
    maxY: position[1] + LOGIN_TRIGGER_HEIGHT,
    minZ: position[2] - LOGIN_TRIGGER_HALF_WIDTH,
    maxZ: position[2] + LOGIN_TRIGGER_HALF_WIDTH,
  }
}

function isWithinBounds(position: readonly [number, number, number], bounds: TriggerBounds) {
  const subjectBounds = resolveTriggerSubjectBounds(position)

  return (
    subjectBounds.minX <= bounds.maxX &&
    subjectBounds.maxX >= bounds.minX &&
    subjectBounds.minY <= bounds.maxY &&
    subjectBounds.maxY >= bounds.minY &&
    subjectBounds.minZ <= bounds.maxZ &&
    subjectBounds.maxZ >= bounds.minZ
  )
}

function enableLoginMoveSpeedOverride() {
  if (previousLoginMoveSpeed.value !== null) {
    return
  }

  const currentMoveSpeed = getEngineRuntimeConfig().controls.moveSpeed
  previousLoginMoveSpeed.value = currentMoveSpeed

  if (currentMoveSpeed !== LOGIN_ROUTE_MOVE_SPEED) {
    applyEngineRuntimeConfigPatch({
      controls: { moveSpeed: LOGIN_ROUTE_MOVE_SPEED },
    })
  }
}

function restoreLoginMoveSpeedOverride() {
  if (previousLoginMoveSpeed.value === null) {
    return
  }

  applyEngineRuntimeConfigPatch({
    controls: { moveSpeed: previousLoginMoveSpeed.value },
  })
  previousLoginMoveSpeed.value = null
}

const loginEngineTriggers: LoginEngineTrigger[] = [
  {
    id: 'github',
    bounds: buildTriggerBounds(323, 200, 793),
    action: () => launchProvider('github', { skipConfirm: true }),
  },
  {
    id: 'ustb',
    bounds: buildTriggerBounds(328, 200, 806),
    action: () => launchProvider('ustb', { skipConfirm: true }),
  },
  {
    id: 'guest',
    bounds: buildTriggerBounds(323, 200, 819),
    action: () => enterGuest(),
  },
]

const matchedEngineTrigger = computed(() => {
  const position = loginPlayerPosition.value
  if (!position) {
    return null
  }

  return loginEngineTriggers.find(trigger => isWithinBounds(position, trigger.bounds)) ?? null
})

async function enterGuest() {
  userStore.enterGuestMode()

  try {
    await completeLogin(popupRedirectTarget.value)
  } catch (error) {
    console.error('guest login navigation failed', error)
    notify.error('进入主页失败，请重试')
  }
}

watch(
  [() => route.path, isPopupCallback, matchedEngineTrigger],
  async ([path, popupCallback, nextTrigger]) => {
    if (path !== '/' || popupCallback || !nextTrigger) {
      activeEngineTriggerId.value = null
      return
    }

    if (activeEngineTriggerId.value === nextTrigger.id) {
      return
    }

    activeEngineTriggerId.value = nextTrigger.id
    await nextTrigger.action()
  },
  { immediate: true },
)

watch(
  () => route.path,
  path => {
    if (path === '/') {
      enableLoginMoveSpeedOverride()
      return
    }

    restoreLoginMoveSpeedOverride()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  restoreLoginMoveSpeedOverride()
})
</script>

<style scoped>
@keyframes move-bg {
  from {
    background-position: 30% bottom;
  }

  to {
    background-position: 70% bottom;
  }
}

@keyframes move-bg-rev {
  from {
    background-position: 70% bottom;
  }

  to {
    background-position: 30% bottom;
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wave {
    animation: none !important;
  }
}

.login-page {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  overflow: hidden;
  pointer-events: none;
}

.login-panel {
  z-index: 3;
  padding: 48px 28px;
  text-align: center;
  backdrop-filter: blur(14px);
  pointer-events: auto;
}

.login-loading-panel {
  display: grid;
  z-index: 3;
  gap: 10px;
  width: min(460px, calc(100vw - 40px));
  padding: 28px 30px;
  border-radius: 20px;
  background: color-mix(in srgb, rgb(7 12 22 / 54%) 90%, transparent);
  box-shadow: 0 26px 80px rgb(0 0 0 / 26%);
  color: rgb(236 244 255 / 92%);
  text-align: left;
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.login-loading-kicker {
  margin: 0;
  color: rgb(164 196 255 / 80%);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.login-loading-panel strong {
  font-size: 26px;
  font-weight: 700;
}

.login-loading-panel span {
  color: rgb(214 226 246 / 84%);
  line-height: 1.6;
}

.login-kicker {
  margin: 0 0 8px;
  color: rgb(78 113 175 / 88%);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.login-panel h1 {
  margin: 0 0 20px;
  color: var(--el-text-color-primary, #111);
}

.login-copy {
  max-width: 540px;
  margin: 0 auto 24px;
  color: color-mix(in srgb, var(--el-text-color-primary, #111) 72%, transparent);
  line-height: 1.6;
}

/* three text-only buttons centered and equally spaced */
.login-btns {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 48px;
}

.oauth-link {
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--el-text-color-primary, #111);
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
}

.oauth-link:hover {
  text-decoration: underline;
}

.oauth-link--guest {
  color: rgb(40 91 170 / 92%);
}

/* confirm modal */
.confirm-backdrop {
  display: flex;
  position: fixed;
  z-index: 40;
  align-items: center;
  justify-content: center;
  background-color: rgb(8 12 20 / 28%);
  background-image: radial-gradient(circle at top, rgb(76 132 255 / 14%), transparent 42%);
  inset: 0;
  backdrop-filter: blur(18px) saturate(120%);
  pointer-events: auto;
}

.confirm-box {
  display: grid;
  gap: 14px;
  width: min(420px, calc(100vw - 32px));
  padding: 24px;
  border-radius: 24px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--el-bg-color-overlay, #fff) 92%, rgb(90 142 255 / 10%)) 0%,
    color-mix(in srgb, var(--el-bg-color-overlay, #fff) 97%, transparent) 100%
  );
  box-shadow: 0 24px 80px rgb(15 23 42 / 20%);
  color: var(--el-text-color-primary, #111827);
  text-align: left;
}

.confirm-kicker,
.confirm-copy {
  margin: 0;
}

.confirm-kicker {
  color: color-mix(
    in srgb,
    var(--el-color-primary, #3b82f6) 72%,
    var(--el-text-color-primary, #111827) 18%
  );
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.confirm-title {
  font-size: clamp(1.15rem, 0.9rem + 0.7vw, 1.5rem);
  font-weight: 700;
  letter-spacing: 0.01em;
}

.confirm-copy {
  color: color-mix(in srgb, var(--el-text-color-primary, #111827) 74%, transparent);
  line-height: 1.7;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 4px;
}

.confirm-button {
  min-width: 112px;
  padding: 11px 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
  cursor: pointer;
}

.confirm-button:hover {
  transform: translateY(-1px);
}

.confirm-button--secondary {
  border-color: color-mix(in srgb, var(--el-border-color, #cbd5e1) 82%, transparent);
  background: color-mix(in srgb, var(--el-fill-color, #f8fafc) 86%, transparent);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 28%);
  color: var(--el-text-color-primary, #111827);
}

.confirm-button--secondary:hover {
  border-color: color-mix(
    in srgb,
    var(--el-color-primary, #3b82f6) 28%,
    var(--el-border-color, #cbd5e1)
  );
  background: color-mix(
    in srgb,
    var(--el-fill-color, #f8fafc) 72%,
    var(--el-color-primary, #3b82f6) 8%
  );
}

.confirm-button--primary {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary, #3b82f6) 88%, white 8%),
    color-mix(in srgb, var(--el-color-primary, #3b82f6) 72%, rgb(14 165 233) 18%)
  );
  box-shadow: 0 14px 28px color-mix(in srgb, var(--el-color-primary, #3b82f6) 26%, transparent);
  color: white;
}

.confirm-button--primary:hover {
  box-shadow: 0 18px 34px color-mix(in srgb, var(--el-color-primary, #3b82f6) 34%, transparent);
}

.confirm-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--el-color-primary, #3b82f6) 72%, white 14%);
  outline-offset: 2px;
}

@media (max-width: 560px) {
  .confirm-actions {
    flex-direction: column-reverse;
  }

  .confirm-button {
    width: 100%;
  }
}

/* layered wave background using SVG data-uri and pseudo-layers */
.waves {
  position: absolute;
  z-index: 1;
  right: 0;
  bottom: 0; /* stick to bottom */
  left: 0;
  height: 30vh;
  min-height: 220px;
  max-height: 360px;
  overflow: hidden; /* keep moving layers contained */
  pointer-events: none;
}

/* individual wave layers - use background-position animation for horizontal parallax
   and a small translateY for a gentle bob. Different durations/delays create depth. */
.wave {
  position: absolute;
  bottom: 0;
  left: -10%; /* allow room to drift */
  width: 120%;
  height: 100%;
  background-repeat: no-repeat;
  background-position: 50% bottom;
  background-size: 120% 100%;
  pointer-events: none;
  will-change: background-position, transform;
}

.wave.w1 {
  animation:
    move-bg 24s linear infinite,
    bob 6s ease-in-out infinite;
  opacity: 0.8;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 300' preserveAspectRatio='none'><path d='M0,180 C200,120 400,240 1200,160 L1200,300 L0,300 Z' fill='rgba(59,130,246,0.12)'/></svg>");
}

.wave.w2 {
  transform: translateY(4px);
  animation:
    move-bg-rev 30s linear infinite,
    bob 7.5s ease-in-out infinite;
  opacity: 0.6;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 280' preserveAspectRatio='none'><path d='M0,150 C300,80 500,220 1200,140 L1200,280 L0,280 Z' fill='rgba(59,130,246,0.10)'/></svg>");
}

.wave.w3 {
  transform: translateY(8px);
  animation:
    move-bg 40s linear infinite,
    bob 10s ease-in-out infinite;
  opacity: 0.4;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 260' preserveAspectRatio='none'><path d='M0,140 C220,60 520,210 1200,120 L1200,260 L0,260 Z' fill='rgba(59,130,246,0.08)'/></svg>");
}
</style>
