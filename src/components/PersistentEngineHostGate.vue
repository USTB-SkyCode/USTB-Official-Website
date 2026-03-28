<template>
  <component :is="resolvedHostComponent" v-if="resolvedHostComponent" />
</template>

<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { Component } from 'vue'
import { useSceneController } from '@/composables/scene/useSceneController'
import { getEngineTakeoverPolicy } from '@/utils/engineTakeoverPolicy'

const resolvedHostComponent = shallowRef<Component | null>(null)
const { fallbackToDom } = useSceneController()
const engineTakeoverPolicy = getEngineTakeoverPolicy()

let alive = true

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function waitForIdleWindow(timeoutMs: number) {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  return new Promise<void>(resolve => {
    const idleCallback = (
      window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      }
    ).requestIdleCallback

    if (typeof idleCallback === 'function') {
      idleCallback(() => resolve(), { timeout: timeoutMs })
      return
    }

    window.setTimeout(() => resolve(), Math.min(timeoutMs, 180))
  })
}

async function loadHostModuleWithRetry() {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= engineTakeoverPolicy.retryLimit; attempt += 1) {
    try {
      const result = await Promise.race([
        import('@/components/PersistentEngineHost.vue'),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('PersistentEngineHost load timed out'))
          }, engineTakeoverPolicy.loadTimeoutMs)
        }),
      ])
      return result
    } catch (error) {
      lastError = error
      if (attempt >= engineTakeoverPolicy.retryLimit) {
        break
      }

      console.warn(
        `[App] PersistentEngineHost load attempt ${attempt}/${engineTakeoverPolicy.retryLimit} failed; retrying.`,
        error,
      )
      await sleep(engineTakeoverPolicy.retryBackoffMs * attempt)
    }
  }

  throw lastError
}

onMounted(async () => {
  if (!engineTakeoverPolicy.supported) {
    fallbackToDom(
      engineTakeoverPolicy.reason
        ? `[App] Engine takeover unsupported before host load: ${engineTakeoverPolicy.reason}`
        : '[App] Engine takeover unsupported before host load',
    )
    return
  }

  if (engineTakeoverPolicy.startupDelayMs > 0) {
    await sleep(engineTakeoverPolicy.startupDelayMs)
  }

  if (!alive) {
    return
  }

  await waitForIdleWindow(engineTakeoverPolicy.loadTimeoutMs)

  if (!alive) {
    return
  }

  try {
    const module = await loadHostModuleWithRetry()
    if (!alive) {
      return
    }

    resolvedHostComponent.value = markRaw(module.default)
  } catch (error) {
    if (!alive) {
      return
    }

    fallbackToDom(
      `[App] Failed to load PersistentEngineHost async module (${engineTakeoverPolicy.networkProfile} network profile)`,
    )
    console.error('[App] Failed to load PersistentEngineHost async module', error)
  }
})

onBeforeUnmount(() => {
  alive = false
})
</script>
