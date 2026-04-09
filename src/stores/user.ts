import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '../types/user'
import {
  USER_PERMISSION,
  canMaskAsUserPermission,
  isAdminPermission,
} from '@/constants/userPermission'
import apiFetch from '@/utils/api'
import type { CharacterModelType } from '@/engine/render/entity/character/CharacterModelSpec'
import {
  detectCharacterModelTypeFromSkinUrl,
  normalizeCharacterModelType,
} from '@/utils/characterSkinModel'

const ADMIN_MASK_STORAGE_KEY = 'userFrontendAdminMask'
const GUEST_SESSION_STORAGE_KEY = 'userGuestSession'

type GuestSessionRecord = {
  active: true
  loginTime: string
}

export type FetchUserOptions = {
  preserveGuest?: boolean
}

function readStoredAdminMask() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(ADMIN_MASK_STORAGE_KEY) === '1'
}

function buildGuestUser(loginTime: string): User {
  return {
    user_id: 'guest',
    username: '访客',
    email: '',
    login_time: loginTime,
    provider: 'guest',
    permission: USER_PERMISSION.USER,
  }
}

function readGuestSession(): User | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GuestSessionRecord>
    if (!parsed.active) {
      return null
    }

    const loginTime =
      typeof parsed.loginTime === 'string' && parsed.loginTime.trim().length > 0
        ? parsed.loginTime
        : new Date().toISOString()
    return buildGuestUser(loginTime)
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(readGuestSession())
  const playerSkinUrl = ref('')
  const playerSkinVersion = ref('')
  const playerSkinModelType = ref<CharacterModelType>('normal')
  const adminMaskEnabled = ref(readStoredAdminMask())
  const actualPermission = computed(() => user.value?.permission ?? -1)
  const isGuest = computed(() => user.value?.provider === 'guest')
  const canMaskAsUser = computed(() => canMaskAsUserPermission(actualPermission.value))
  const permission = computed(() => {
    if (adminMaskEnabled.value && canMaskAsUser.value) return USER_PERMISSION.USER
    return actualPermission.value
  })
  const isAdmin = computed(() => isAdminPermission(permission.value))
  const isSuperAdmin = computed(() => permission.value === USER_PERMISSION.SUPER_ADMIN)
  const isUser = computed(() => permission.value === USER_PERMISSION.USER)
  let fetchUserPromise: Promise<void> | null = null
  let fetchPlayerSkinPromise: Promise<void> | null = null

  function clearPlayerSkin() {
    playerSkinUrl.value = ''
    playerSkinVersion.value = ''
    playerSkinModelType.value = 'normal'
  }

  function persistAdminMask() {
    if (typeof window === 'undefined') return
    if (adminMaskEnabled.value) {
      window.localStorage.setItem(ADMIN_MASK_STORAGE_KEY, '1')
      return
    }
    window.localStorage.removeItem(ADMIN_MASK_STORAGE_KEY)
  }

  function persistGuestSession(nextUser: User | null) {
    if (typeof window === 'undefined') {
      return
    }

    if (nextUser?.provider === 'guest') {
      window.localStorage.setItem(
        GUEST_SESSION_STORAGE_KEY,
        JSON.stringify({
          active: true,
          loginTime: nextUser.login_time,
        } satisfies GuestSessionRecord),
      )
      return
    }

    window.localStorage.removeItem(GUEST_SESSION_STORAGE_KEY)
  }

  function syncAdminMaskState() {
    if (!canMaskAsUser.value && adminMaskEnabled.value) {
      adminMaskEnabled.value = false
      persistAdminMask()
    }
  }

  function setAdminMaskEnabled(value: boolean) {
    adminMaskEnabled.value = canMaskAsUser.value ? value : false
    persistAdminMask()
  }

  function toggleAdminMask() {
    setAdminMaskEnabled(!adminMaskEnabled.value)
  }

  async function fetchPlayerSkin() {
    if (!user.value || isGuest.value) {
      clearPlayerSkin()
      return
    }

    if (fetchPlayerSkinPromise) return fetchPlayerSkinPromise

    fetchPlayerSkinPromise = (async () => {
      try {
        const r = await apiFetch('/api/users/me/skin', { method: 'GET' })
        if (r.ok && r.body && typeof r.body === 'object' && 'data' in r.body) {
          const maybeData = ((r.body as Record<string, unknown>)['data'] ?? null) as Record<
            string,
            unknown
          > | null
          const nextUrl = typeof maybeData?.skin_url === 'string' ? maybeData.skin_url.trim() : ''
          const nextVersion =
            typeof maybeData?.skin_version === 'string' ? maybeData.skin_version.trim() : ''
          const explicitModelType = normalizeCharacterModelType(
            maybeData?.skin_model ?? maybeData?.model,
          )
          playerSkinUrl.value = nextUrl
          playerSkinVersion.value = nextVersion
          playerSkinModelType.value =
            explicitModelType ??
            (nextUrl ? await detectCharacterModelTypeFromSkinUrl(nextUrl) : 'normal')
          return
        }

        clearPlayerSkin()
      } catch (e) {
        console.warn('fetchPlayerSkin failed', e)
        clearPlayerSkin()
      } finally {
        fetchPlayerSkinPromise = null
      }
    })()

    return fetchPlayerSkinPromise
  }

  async function fetchUser(options: FetchUserOptions = {}) {
    // 并发去重
    if (fetchUserPromise) return fetchUserPromise

    const preserveGuest = options.preserveGuest ?? isGuest.value
    const guestFallbackUser = isGuest.value ? user.value : null

    fetchUserPromise = (async () => {
      try {
        const r = await apiFetch('/api/users/me', { method: 'GET' })
        if (r.ok && r.body && typeof r.body === 'object' && 'data' in r.body) {
          const maybeData = (r.body as Record<string, unknown>)['data']
          user.value = (maybeData as User) ?? null
          persistGuestSession(user.value)
          syncAdminMaskState()
          await fetchPlayerSkin()
        } else {
          if (preserveGuest && guestFallbackUser?.provider === 'guest') {
            user.value = guestFallbackUser
            persistGuestSession(guestFallbackUser)
            clearPlayerSkin()
            syncAdminMaskState()
            return
          }

          user.value = null
          persistGuestSession(null)
          clearPlayerSkin()
          syncAdminMaskState()
        }
      } catch (e) {
        console.warn('fetchUser failed', e)
        if (preserveGuest && guestFallbackUser?.provider === 'guest') {
          user.value = guestFallbackUser
          persistGuestSession(guestFallbackUser)
          clearPlayerSkin()
          syncAdminMaskState()
          return
        }

        user.value = null
        persistGuestSession(null)
        clearPlayerSkin()
        syncAdminMaskState()
      } finally {
        fetchUserPromise = null
      }
    })()

    return fetchUserPromise
  }

  async function logout() {
    if (isGuest.value) {
      user.value = null
      persistGuestSession(null)
      clearPlayerSkin()
      setAdminMaskEnabled(false)
      return
    }

    try {
      const r = await apiFetch('/api/session', { method: 'DELETE' })
      user.value = null
      persistGuestSession(null)
      clearPlayerSkin()
      setAdminMaskEnabled(false)
      return r
    } catch (e) {
      console.warn('logout failed', e)
      user.value = null
      persistGuestSession(null)
      clearPlayerSkin()
      setAdminMaskEnabled(false)
    }
  }

  function enterGuestMode() {
    const guestUser = buildGuestUser(new Date().toISOString())
    user.value = guestUser
    persistGuestSession(guestUser)
    clearPlayerSkin()
    syncAdminMaskState()
  }

  function setUser(u: User | null) {
    user.value = u
    persistGuestSession(u)
    if (!u) {
      clearPlayerSkin()
    }
    syncAdminMaskState()
  }

  return {
    user,
    adminMaskEnabled,
    canMaskAsUser,
    actualPermission,
    isGuest,
    isAdmin,
    isSuperAdmin,
    isUser,
    permission,
    playerSkinUrl,
    playerSkinVersion,
    playerSkinModelType,
    fetchUser,
    fetchPlayerSkin,
    enterGuestMode,
    logout,
    setUser,
    setAdminMaskEnabled,
    toggleAdminMask,
  }
})
