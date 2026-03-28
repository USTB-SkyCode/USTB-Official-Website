<template>
  <PersistentEngineHostGate v-if="shouldMountPersistentEngineHost" />
  <GlobalErrorDialog />
  <div class="app-router-layer">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GlobalErrorDialog from '@/components/GlobalErrorDialog.vue'
import PersistentEngineHostGate from '@/components/PersistentEngineHostGate.vue'
import { useSceneController } from '@/composables/scene/useSceneController'

const { takeoverEnabled, shouldReservePersistentHost } = useSceneController()

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
