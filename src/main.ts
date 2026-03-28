import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/styles/tokens/light.css'
import '@/styles/tokens/dark.css'
import '@/styles/frame-mode.css'
import '@/styles/shared-surfaces.css'

import App from './App.vue'
import router from './router'
import { applyEngineRuntimeConfigPatch, subscribeEngineRuntimeConfig } from './config/runtime'
import { useEnginePersistenceStore } from './stores/enginePersistence'
import { useSceneControllerStore } from './stores/sceneController'
import { useUserStore } from './stores/user'
import { installGlobalErrorReporter } from './utils/errorReporter'
import { getEngineTakeoverPolicy } from './utils/engineTakeoverPolicy'

const app = createApp(App)
const pinia = createPinia()

installGlobalErrorReporter(app)

app.use(pinia)
app.use(router)

const enginePersistenceStore = useEnginePersistenceStore(pinia)
applyEngineRuntimeConfigPatch(enginePersistenceStore.runtimeConfig)
subscribeEngineRuntimeConfig(nextConfig => {
  enginePersistenceStore.setRuntimeConfig(nextConfig)
})

const sceneControllerStore = useSceneControllerStore(pinia)
const engineTakeoverPolicy = getEngineTakeoverPolicy()
sceneControllerStore.setTakeoverEnabled(engineTakeoverPolicy.supported)
sceneControllerStore.setTakeoverBlockedReason(engineTakeoverPolicy.reason)

// 初始化用户数据
const userStore = useUserStore(pinia)
userStore.fetchUser()

app.mount('#app')
