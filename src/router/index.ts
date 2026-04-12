import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Admin from '../views/Admin.vue'
import Self from '../views/Self.vue'
import { useUserStore } from '@/stores/user'

const renderTestRoutes = import.meta.env.DEV
  ? [{ path: '/render', component: () => import('../views/RendererTest.vue') }]
  : []

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: Login, meta: { public: true } },
    { path: '/home', component: Home },
    { path: '/admin', component: Admin, meta: { requiresAdmin: true } },
    { path: '/me', component: Self },
    ...renderTestRoutes,
  ],
})

router.beforeEach(async to => {
  if (to.meta?.public) return true

  const userStore = useUserStore()

  if (to.meta?.requiresAdmin) {
    try {
      await userStore.fetchUser({ preserveGuest: false })
    } catch {
      console.warn('fetch admin user failed')
    }

    if (!userStore.user) {
      return { path: '/', query: { redirect: to.fullPath } }
    }

    if (!userStore.isAdmin) {
      return { path: '/home' }
    }

    return true
  }

  if (userStore.isGuest) {
    void userStore.fetchUser({ preserveGuest: true })
    return true
  }

  if (!userStore.user) {
    try {
      await userStore.fetchUser({ preserveGuest: true })
    } catch {
      console.warn('fetch user failed')
    }
  }

  if (!userStore.user) {
    return { path: '/', query: { redirect: to.fullPath } }
  }

  return true
})

export default router
