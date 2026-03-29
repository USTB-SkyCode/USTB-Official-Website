import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { User } from '@/types/user'
import { buildAppUrl, buildAuthUrl } from '@/utils/api'
import { notify } from '@/utils/notify'

type AuthPopupMessage = {
  type: 'world-oauth-complete'
  success: boolean
  redirect: string
  emittedAt?: number
}

type PersistChoice = {
  provider: string
  persist: boolean
}

const LOGIN_PERSIST_CHOICE_KEY = 'loginPersistChoice'
const AUTO_LOGIN_GUARD_KEY = 'loginPersistGuard'
const AUTH_POPUP_STORAGE_KEY = 'world-oauth-popup-result'
const AUTH_POPUP_CHANNEL_NAME = 'world-oauth-popup-channel'
const AUTO_LOGIN_DELAY_MS = 50
const POPUP_CLOSE_POLL_INTERVAL_MS = 250
const POPUP_WIDTH = 560
const POPUP_HEIGHT = 760

function resolvePostLoginTarget(candidate: unknown) {
  return typeof candidate === 'string' && candidate.startsWith('/') ? candidate : '/home'
}

export function useLoginAuthFlow(options: {
  mobileDevice: ComputedRef<boolean>
  currentUser: ComputedRef<User | null>
  fetchUser: () => Promise<unknown> | unknown
}) {
  const route = useRoute()
  const router = useRouter()
  const showConfirm = ref(false)

  let pendingHref = ''
  let popupWindow: Window | null = null
  let popupClosePollTimer: ReturnType<typeof setInterval> | null = null
  let authPopupChannel: BroadcastChannel | null = null

  const isPopupCallback = computed(() => route.query.popupAuthComplete === '1')
  const popupRedirectTarget = computed(() => resolvePostLoginTarget(route.query.redirect))

  async function completeLogin(target: unknown = route.query.redirect) {
    await router.replace(resolvePostLoginTarget(target))
  }

  function getPersistChoice(): PersistChoice | null {
    const raw = localStorage.getItem(LOGIN_PERSIST_CHOICE_KEY)
    if (!raw) return null

    try {
      return JSON.parse(raw) as PersistChoice
    } catch {
      console.warn('parse loginPersistChoice failed')
      return null
    }
  }

  function getProviderAuthHref(provider: string, popupFlow: boolean) {
    if (!popupFlow) {
      return buildAuthUrl(`/auth/${provider}`, buildAppUrl(popupRedirectTarget.value))
    }

    const popupCallbackUrl = new URL(buildAppUrl('/'), window.location.origin)
    popupCallbackUrl.searchParams.set('popupAuthComplete', '1')
    popupCallbackUrl.searchParams.set('redirect', popupRedirectTarget.value)
    return buildAuthUrl(`/auth/${provider}`, popupCallbackUrl.toString())
  }

  function setAutoLoginGuard(provider: string) {
    sessionStorage.setItem(AUTO_LOGIN_GUARD_KEY, provider)
  }

  function clearAutoLoginGuard() {
    sessionStorage.removeItem(AUTO_LOGIN_GUARD_KEY)
  }

  function getAutoLoginGuard() {
    return sessionStorage.getItem(AUTO_LOGIN_GUARD_KEY)
  }

  function clearPopupClosePollTimer() {
    if (popupClosePollTimer !== null) {
      clearInterval(popupClosePollTimer)
      popupClosePollTimer = null
    }
  }

  function cleanupPopupSession() {
    clearPopupClosePollTimer()
    popupWindow = null
  }

  function emitPopupAuthResult(message: AuthPopupMessage) {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin)
    }

    authPopupChannel?.postMessage(message)

    try {
      window.localStorage.setItem(AUTH_POPUP_STORAGE_KEY, JSON.stringify(message))
    } catch (error) {
      console.warn('popup auth: failed to persist popup result', error)
    }
  }

  function watchPopupClosed() {
    clearPopupClosePollTimer()
    popupClosePollTimer = setInterval(() => {
      if (!popupWindow || popupWindow.closed) {
        cleanupPopupSession()
        clearAutoLoginGuard()
      }
    }, POPUP_CLOSE_POLL_INTERVAL_MS)
  }

  function openAuthPopup(authHref: string, provider: string) {
    setAutoLoginGuard(provider)

    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2))
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2))
    const popupFeatures = [
      'popup=yes',
      `width=${POPUP_WIDTH}`,
      `height=${POPUP_HEIGHT}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes',
    ].join(',')

    popupWindow = window.open(authHref, `world-oauth-${provider}`, popupFeatures)
    if (!popupWindow) {
      clearAutoLoginGuard()
      window.location.href = authHref
      return
    }

    popupWindow.focus()
    watchPopupClosed()
  }

  function startAuthFlow(authHref: string, provider: string) {
    if (options.mobileDevice.value) {
      setAutoLoginGuard(provider)
      window.location.assign(authHref)
      return
    }

    openAuthPopup(authHref, provider)
  }

  function launchProvider(provider: string, launchOptions: { skipConfirm?: boolean } = {}) {
    let authHref = ''
    const popupFlow = !options.mobileDevice.value
    try {
      authHref = getProviderAuthHref(provider, popupFlow)
    } catch (error) {
      console.error('build auth url failed', error)
      notify.error('登录入口未配置，请检查 /config.js 中的 APP_CONFIG.AUTH_BASE_URL')
      return
    }

    const last = getPersistChoice()
    if (launchOptions.skipConfirm || (last && last.persist && last.provider === provider)) {
      pendingHref = authHref
      startAuthFlow(pendingHref, provider)
      return
    }

    pendingHref = authHref
    showConfirm.value = true
  }

  async function applyPopupAuthResult(data: AuthPopupMessage) {
    if (isPopupCallback.value) {
      return
    }

    cleanupPopupSession()
    clearAutoLoginGuard()

    if (!data.success) {
      notify.error('登录未完成，请重试')
      return
    }

    try {
      await options.fetchUser()
    } catch (error) {
      console.warn('popup auth: fetchUser failed', error)
    }

    if (!options.currentUser.value) {
      notify.error('登录状态同步失败，请重试')
      return
    }

    await completeLogin(data.redirect)
  }

  async function handleAuthPopupMessage(event: MessageEvent<AuthPopupMessage>) {
    if (event.origin !== window.location.origin) {
      return
    }

    const data = event.data
    if (!data || data.type !== 'world-oauth-complete') {
      return
    }

    await applyPopupAuthResult(data)
  }

  async function handleAuthPopupStorage(event: StorageEvent) {
    if (event.key !== AUTH_POPUP_STORAGE_KEY || !event.newValue) {
      return
    }

    try {
      const payload = JSON.parse(event.newValue) as AuthPopupMessage
      if (payload.type !== 'world-oauth-complete') {
        return
      }

      await applyPopupAuthResult(payload)
    } catch (error) {
      console.warn('popup auth: failed to parse storage payload', error)
    }
  }

  async function handleAuthPopupBroadcast(event: MessageEvent<AuthPopupMessage>) {
    const data = event.data
    if (!data || data.type !== 'world-oauth-complete') {
      return
    }

    await applyPopupAuthResult(data)
  }

  async function finalizePopupCallback() {
    try {
      await options.fetchUser()
    } catch (error) {
      console.warn('popup auth callback: fetchUser failed', error)
    }

    const success = !!options.currentUser.value
    emitPopupAuthResult({
      type: 'world-oauth-complete',
      success,
      redirect: popupRedirectTarget.value,
      emittedAt: Date.now(),
    })

    window.close()

    if (success) {
      return
    }

    await router.replace({ path: '/', query: { redirect: popupRedirectTarget.value } })
  }

  async function redirectAuthenticatedUser() {
    if (!options.currentUser.value) {
      return
    }

    clearAutoLoginGuard()
    cleanupPopupSession()
    await completeLogin(route.query.redirect)
  }

  function onClick(href: string) {
    const provider = href.split('/').pop()
    if (!provider) {
      return
    }

    launchProvider(provider)
  }

  function confirm(keep: boolean) {
    showConfirm.value = false

    const provider = pendingHref.match(/\/auth\/([^/?#]+)/)?.[1]
    if (!provider) {
      return
    }

    localStorage.setItem(
      LOGIN_PERSIST_CHOICE_KEY,
      JSON.stringify({ provider, persist: keep } satisfies PersistChoice),
    )
    startAuthFlow(pendingHref, provider)
  }

  onMounted(() => {
    if (isPopupCallback.value) {
      clearAutoLoginGuard()
      void finalizePopupCallback()
      return
    }

    if (options.currentUser.value) {
      void redirectAuthenticatedUser()
      return
    }

    if (typeof BroadcastChannel !== 'undefined') {
      authPopupChannel = new BroadcastChannel(AUTH_POPUP_CHANNEL_NAME)
      authPopupChannel.addEventListener('message', handleAuthPopupBroadcast)
    }

    window.addEventListener('message', handleAuthPopupMessage)
    window.addEventListener('storage', handleAuthPopupStorage)

    const last = getPersistChoice()
    if (!last?.persist || typeof last.provider !== 'string') {
      clearAutoLoginGuard()
      return
    }

    if (getAutoLoginGuard() === last.provider) {
      return
    }

    setTimeout(() => {
      try {
        pendingHref = getProviderAuthHref(last.provider, !options.mobileDevice.value)
      } catch (error) {
        console.error('auto login build auth url failed', error)
        notify.error('自动登录入口未配置，请检查 /config.js 中的 APP_CONFIG.AUTH_BASE_URL')
        clearAutoLoginGuard()
        return
      }

      startAuthFlow(pendingHref, last.provider)
    }, AUTO_LOGIN_DELAY_MS)
  })

  watch(
    () => options.currentUser.value,
    nextUser => {
      if (isPopupCallback.value || !nextUser) {
        return
      }

      void redirectAuthenticatedUser()
    },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('message', handleAuthPopupMessage)
    window.removeEventListener('storage', handleAuthPopupStorage)
    authPopupChannel?.removeEventListener('message', handleAuthPopupBroadcast)
    authPopupChannel?.close()
    authPopupChannel = null
    clearPopupClosePollTimer()
  })

  return {
    showConfirm,
    isPopupCallback,
    popupRedirectTarget,
    completeLogin,
    onClick,
    confirm,
    launchProvider,
  }
}
