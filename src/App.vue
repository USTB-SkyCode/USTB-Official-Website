<template>
  <GlobalErrorDialog />

  <section
    v-if="bootstrapState.phase === 'error'"
    class="app-bootstrap-state app-bootstrap-state--error"
  >
    <p class="app-bootstrap-state__kicker">Bootstrap Error</p>
    <strong>{{ bootstrapState.title }}</strong>
    <span>{{ bootstrapState.message }}</span>
  </section>

  <section v-else-if="bootstrapState.phase !== 'ready'" class="app-bootstrap-state">
    <p class="app-bootstrap-state__kicker">Bootstrap</p>
    <strong>{{ bootstrapState.title }}</strong>
    <span>{{ bootstrapState.message }}</span>
  </section>

  <template v-else>
    <PersistentEngineHostGate v-if="shouldMountPersistentEngineHost" />
    <div class="app-router-layer">
      <router-view />
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppBootstrapState } from '@/bootstrap/appBootstrap'
import GlobalErrorDialog from '@/components/GlobalErrorDialog.vue'
import PersistentEngineHostGate from '@/components/PersistentEngineHostGate.vue'
import { useSceneController } from '@/composables/scene/useSceneController'

const { takeoverEnabled, shouldReservePersistentHost } = useSceneController()
const bootstrapState = useAppBootstrapState()

const shouldMountPersistentEngineHost = computed(
  () => takeoverEnabled.value && shouldReservePersistentHost.value,
)
</script>

<style>
html,
body,
#app {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  background: transparent !important;
}

html,
body,
#app {
  min-height: 100%;
}

html,
body {
  background-color: transparent !important;
  background-image: none !important;
}

#app {
  position: relative;
  isolation: isolate;
}

.app-bootstrap-state {
  position: fixed;
  z-index: 2000;
  top: 50%;
  left: 50%;
  display: grid;
  gap: 8px;
  width: min(440px, calc(100vw - 40px));
  padding: 24px 26px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 76%, transparent);
  border-radius: 26px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg) 88%, transparent), transparent),
    color-mix(in srgb, var(--theme-card-bg) 82%, white 8%);
  box-shadow: var(--theme-shadow-hero);
  color: var(--theme-text-strong);
  transform: translate(-50%, -50%);
  backdrop-filter: blur(18px);
}

.app-bootstrap-state--error {
  border-color: color-mix(in srgb, var(--el-color-danger) 28%, var(--theme-border-strong));
}

.app-bootstrap-state__kicker {
  margin: 0;
  color: var(--theme-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.app-bootstrap-state strong {
  font-size: 1.08rem;
}

.app-bootstrap-state span {
  color: var(--theme-text-muted);
  line-height: 1.6;
}

.app-router-layer {
  position: relative;
  z-index: 10;
}

.app-router-layer > * {
  position: relative;
  z-index: 1;
}

html,
body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

::-webkit-scrollbar {
  width: 0 !important;
  background: transparent;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  background: transparent;
  mix-blend-mode: normal;
}

::view-transition-old(root),
.dark::view-transition-new(root) {
  z-index: 1;
}

::view-transition-new(root),
.dark::view-transition-old(root) {
  z-index: 2147483646;
}
</style>
