import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/styles/tokens/light.css'
import '@/styles/tokens/dark.css'
import '@/styles/frame-mode.css'
import '@/styles/shared-surfaces.css'

import App from './App.vue'
import router from './router'
import { markAppBootstrapReady, reportAppBootstrapError } from './bootstrap/appBootstrap'
import { applyEngineRuntimeConfigPatch, subscribeEngineRuntimeConfig } from './config/runtime'
import { useDarkStore } from './stores/dark'
import { useEnginePersistenceStore } from './stores/enginePersistence'
import { useSceneControllerStore } from './stores/sceneController'
import { useUserStore } from './stores/user'
import { installGlobalErrorReporter } from './utils/errorReporter'
import { getEngineTakeoverPolicy } from './utils/engineTakeoverPolicy'
import { preloadResourcePackCatalog } from './resource/catalog'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  installGlobalErrorReporter(app)

  app.use(pinia)
  app.use(router)

  // Eagerly hydrate theme state so html theme classes/tokens are correct on every route.
  useDarkStore(pinia)

  app.mount('#app')

  try {
    const enginePersistenceStore = useEnginePersistenceStore(pinia)
    applyEngineRuntimeConfigPatch(enginePersistenceStore.runtimeConfig)
    subscribeEngineRuntimeConfig(nextConfig => {
      enginePersistenceStore.setRuntimeConfig(nextConfig)
    })

    const sceneControllerStore = useSceneControllerStore(pinia)
    const engineTakeoverPolicy = getEngineTakeoverPolicy()
    sceneControllerStore.setTakeoverEnabled(
      engineTakeoverPolicy.supported && enginePersistenceStore.displayModePreference === 'engine',
    )
    sceneControllerStore.setTakeoverBlockedReason(
      engineTakeoverPolicy.supported
        ? null
        : (engineTakeoverPolicy.reason ?? '当前环境不支持 3D 引擎'),
    )

    markAppBootstrapReady()
    preloadResourcePackCatalog()

    // 初始化用户数据
    const userStore = useUserStore(pinia)
    void userStore.fetchUser({ preserveGuest: true })
  } catch (error) {
    console.error('[App] bootstrap failed', error)
    reportAppBootstrapError(error, '前端启动失败')
  }
}

bootstrap()
