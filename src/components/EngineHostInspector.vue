<template>
  <aside v-if="visible" class="engine-host-inspector">
    <div class="engine-host-inspector__title">Takeover Pipeline</div>
    <div class="engine-host-inspector__row">
      <span>route</span>
      <strong>{{ routeId }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>scene</span>
      <strong>{{ sceneKey ?? '-' }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>host</span>
      <strong>{{ engineStatus }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>runtime</span>
      <strong>{{ debugStatus }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>chunks</span>
      <strong>{{ loadedChunkCount }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>ready</span>
      <strong>{{ takeoverReady ? 'yes' : 'no' }}</strong>
    </div>
    <div class="engine-host-inspector__section">surfaces</div>
    <div class="engine-host-inspector__row">
      <span>raw</span>
      <strong>{{ surfaceCount }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>published</span>
      <strong>{{ consumableSurfaceCount }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>adapter</span>
      <strong>{{ renderAdapterSnapshot.activeCount }}</strong>
    </div>
    <div class="engine-host-inspector__keys">
      {{ renderAdapterKeys || '-' }}
    </div>
    <div class="engine-host-inspector__row">
      <span>staging</span>
      <strong>{{ ui3dStagingSnapshot.activeCount }}</strong>
    </div>
    <div class="engine-host-inspector__keys">{{ ui3dStagingKeys || '-' }}</div>
    <div class="engine-host-inspector__section">submit</div>
    <div class="engine-host-inspector__row">
      <span>enabled</span>
      <strong>{{ ui3dSubmissionState.enabled ? 'yes' : 'no' }}</strong>
    </div>
    <div class="engine-host-inspector__row">
      <span>count</span>
      <strong>{{ ui3dSubmissionState.activeCount }}</strong>
    </div>
    <div class="engine-host-inspector__keys">{{ ui3dSubmitKeys || '-' }}</div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  routeId: string
  sceneKey: string | null
  engineStatus: string
  debugStatus: string
  loadedChunkCount: number
  takeoverReady: boolean
  surfaceCount: number
  consumableSurfaceCount: number
  renderAdapterSnapshot: { activeCount: number; instances: readonly { surfaceKey: string }[] }
  ui3dStagingSnapshot: { activeCount: number; surfaceKeys: readonly string[] }
  ui3dSubmissionState: { enabled: boolean; activeCount: number; surfaceKeys: readonly string[] }
}>()

const renderAdapterKeys = computed(() =>
  props.renderAdapterSnapshot.instances.map(i => i.surfaceKey).join(','),
)
const ui3dStagingKeys = computed(() => props.ui3dStagingSnapshot.surfaceKeys.join(','))
const ui3dSubmitKeys = computed(() => props.ui3dSubmissionState.surfaceKeys.join(','))
</script>

<style scoped>
.engine-host-inspector {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483646;
  width: min(320px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(9, 14, 24, 0.82);
  border: 1px solid rgba(180, 216, 255, 0.22);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px);
  color: #e8f3ff;
  pointer-events: none;
  font-family: 'IBM Plex Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.engine-host-inspector__title {
  margin-bottom: 8px;
  color: #9fd0ff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.engine-host-inspector__section {
  margin-top: 10px;
  margin-bottom: 4px;
  color: rgba(159, 208, 255, 0.84);
  text-transform: uppercase;
}

.engine-host-inspector__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.engine-host-inspector__row span {
  color: rgba(232, 243, 255, 0.68);
}

.engine-host-inspector__row strong {
  color: #f7fbff;
  font-weight: 600;
}

.engine-host-inspector__keys {
  margin-top: 3px;
  margin-bottom: 4px;
  color: rgba(214, 233, 255, 0.82);
  word-break: break-word;
}
</style>
