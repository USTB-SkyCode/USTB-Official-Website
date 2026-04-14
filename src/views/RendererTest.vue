<template>
  <div class="renderer-test">
    <canvas ref="canvasRef"></canvas>

    <aside class="controls" :class="{ collapsed: !isControlsExpanded }">
      <div class="controls-header" @click="isControlsExpanded = !isControlsExpanded">
        <div>
          <div class="eyebrow">Runtime Console</div>
          <div class="panel-title">Renderer Test</div>
        </div>
        <div class="header-badges">
          <span class="badge badge-status">{{ debugStatus }}</span>
          <span class="badge badge-runtime">{{ runtimeDebugStatus }}</span>
          <span class="badge badge-fps">{{ realFps }} FPS</span>
          <span class="collapse-indicator">{{ isControlsExpanded ? 'Hide' : 'Show' }}</span>
        </div>
      </div>

      <div v-show="isControlsExpanded" class="controls-body">
        <div class="toolbar-row">
          <button class="action-btn primary" @click="rebuildScene">Rebuild</button>
          <button class="action-btn" @click="resetLiquidGlassSettings">Reset Glass Preset</button>
          <button class="action-btn" @click="resetHologramSettings">Reset Hologram Preset</button>
          <button class="action-btn" @click="((textVisible = !textVisible), syncUi3dComponents())">
            Toggle Text Label
          </button>
          <div class="toolbar-hint">M teleport</div>
          <div class="toolbar-hint">I liquid glass</div>
          <div class="toolbar-hint">O hologram</div>
          <div class="toolbar-hint">T text</div>
          <div class="toolbar-hint">ESC unlock</div>
          <div class="toolbar-hint">F5 perspective</div>
          <div class="toolbar-hint">LMB break</div>
          <div class="toolbar-hint">RMB place</div>
          <div class="toolbar-hint">MMB pick</div>
          <div class="toolbar-hint">Mode {{ perspectiveModeLabel }}</div>
          <div class="toolbar-hint">Pos {{ playerPositionLabel }}</div>
          <div class="toolbar-hint">Eye {{ cameraPositionLabel }}</div>
          <div class="toolbar-hint">View {{ cameraViewPositionLabel }}</div>
          <div class="toolbar-hint">Miss {{ cacheMissCount }}</div>
        </div>

        <details class="surface-card compact-section collapsible-section" open>
          <summary class="section-title collapsible-summary">Liquid Glass Lab</summary>
          <div class="liquid-glass-panel-grid">
            <div
              v-for="section in liquidGlassControlSections"
              :key="section.title"
              class="liquid-glass-section"
            >
              <div class="storage-subtitle">{{ section.title }}</div>
              <div class="liquid-glass-controls">
                <div
                  v-for="control in section.controls"
                  :key="control.path.join('.')"
                  class="liquid-glass-control"
                >
                  <template v-if="control.kind === 'boolean'">
                    <label class="liquid-glass-toggle">
                      <span>{{ control.label }}</span>
                      <input
                        :checked="Boolean(getControlValue(control.path))"
                        type="checkbox"
                        @change="onBooleanControlInput(control, $event)"
                      />
                    </label>
                  </template>
                  <template v-else-if="control.kind === 'vec3'">
                    <div class="liquid-glass-vec3-header">
                      <span>{{ control.label }}</span>
                      <strong>{{ formatControlValue(control) }}</strong>
                    </div>
                    <div class="liquid-glass-vec3-grid">
                      <label
                        v-for="(channel, channelIndex) in control.channels"
                        :key="`${control.path.join('.')}#${channel}`"
                        class="liquid-glass-slider"
                      >
                        <span>{{ channel }}</span>
                        <input
                          :max="control.max"
                          :min="control.min"
                          :step="control.step"
                          :value="
                            (getControlValue(control.path) as [number, number, number])[
                              channelIndex
                            ]
                          "
                          type="range"
                          @input="onVec3ControlInput(control, channelIndex, $event)"
                        />
                      </label>
                    </div>
                  </template>
                  <template v-else>
                    <div class="liquid-glass-slider-header">
                      <span>{{ control.label }}</span>
                      <strong>{{ formatControlValue(control) }}</strong>
                    </div>
                    <label class="liquid-glass-slider">
                      <input
                        :max="control.max"
                        :min="control.min"
                        :step="control.step"
                        :value="Number(getControlValue(control.path))"
                        type="range"
                        @input="onNumberControlInput(control, $event)"
                      />
                    </label>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </details>

        <details class="surface-card compact-section step3-focus-card collapsible-section" open>
          <summary class="section-title collapsible-summary">Runtime Triage</summary>
          <div v-if="runtimeDebugAvailable" class="headline-grid">
            <div v-for="item in priorityMetrics" :key="item.label" class="headline-item">
              <span class="headline-label">{{ item.label }}</span>
              <span class="headline-value">{{ item.value }}</span>
            </div>
          </div>
          <div v-else class="null-state">null</div>
        </details>

        <details class="surface-card compact-section collapsible-section">
          <summary class="section-title collapsible-summary">Block Interaction</summary>
          <div class="metric-list compact-list">
            <div class="metric-row">
              <span class="metric-row-label">Selected</span>
              <span class="metric-row-value">{{ selectedBlockState }}</span>
            </div>
            <div class="metric-row">
              <span class="metric-row-label">Target</span>
              <span class="metric-row-value">{{ targetedBlockState ?? 'null' }}</span>
            </div>
            <div class="metric-row">
              <span class="metric-row-label">Pos</span>
              <span class="metric-row-value">{{ targetedBlockPosition ?? 'null' }}</span>
            </div>
          </div>
        </details>

        <details class="surface-card compact-section collapsible-section" open>
          <summary class="section-title collapsible-summary">First-Person Hand Tuner</summary>
          <div class="tuner-grid">
            <div class="tuner-group">
              <div class="storage-subtitle">Offset</div>
              <div class="tuner-row">
                <label>
                  <span class="tuner-label">
                    X <strong>{{ firstPersonHandOffset.x.toFixed(2) }}</strong>
                  </span>
                  <input
                    v-model.number="firstPersonHandOffset.x"
                    type="range"
                    min="-2"
                    max="2"
                    step="0.01"
                  />
                </label>
                <label>
                  <span class="tuner-label">
                    Y <strong>{{ firstPersonHandOffset.y.toFixed(2) }}</strong>
                  </span>
                  <input
                    v-model.number="firstPersonHandOffset.y"
                    type="range"
                    min="-2"
                    max="2"
                    step="0.01"
                  />
                </label>
                <label>
                  <span class="tuner-label">
                    Z <strong>{{ firstPersonHandOffset.z.toFixed(2) }}</strong>
                  </span>
                  <input
                    v-model.number="firstPersonHandOffset.z"
                    type="range"
                    min="-2"
                    max="2"
                    step="0.01"
                  />
                </label>
              </div>
            </div>
            <div class="tuner-group">
              <div class="storage-subtitle">Rotation</div>
              <div class="tuner-row">
                <label>
                  <span class="tuner-label">
                    P <strong>{{ firstPersonHandRotation.pitch.toFixed(0) }}</strong>
                  </span>
                  <input
                    v-model.number="firstPersonHandRotation.pitch"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                  />
                </label>
                <label>
                  <span class="tuner-label">
                    Y <strong>{{ firstPersonHandRotation.yaw.toFixed(0) }}</strong>
                  </span>
                  <input
                    v-model.number="firstPersonHandRotation.yaw"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                  />
                </label>
                <label>
                  <span class="tuner-label">
                    R <strong>{{ firstPersonHandRotation.roll.toFixed(0) }}</strong>
                  </span>
                  <input
                    v-model.number="firstPersonHandRotation.roll"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                  />
                </label>
              </div>
            </div>
            <div class="tuner-actions">
              <button class="action-btn" @click="resetFirstPersonHandPose">Reset Hand Pose</button>
            </div>
          </div>
        </details>

        <div class="metrics-layout">
          <details
            v-if="!runtimeDebugAvailable"
            class="surface-card compact-section summary-card collapsible-section"
          >
            <summary class="section-title collapsible-summary">Runtime Metrics</summary>
            <div class="null-state">null</div>
          </details>

          <details
            v-for="group in metricGroups"
            :key="group.title"
            class="surface-card compact-section summary-card collapsible-section"
          >
            <summary class="section-title collapsible-summary">{{ group.title }}</summary>
            <div class="metric-list compact-list">
              <div v-for="item in group.items" :key="item.label" class="metric-row">
                <span class="metric-row-label">{{ item.label }}</span>
                <span class="metric-row-value">{{ item.value }}</span>
              </div>
            </div>
          </details>

          <details class="surface-card worker-card collapsible-section">
            <summary class="section-title collapsible-summary">Worker Throughput</summary>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>W</th>
                  <th>Parse</th>
                  <th>Mesh</th>
                  <th>Avg</th>
                  <th>W/N/B</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!runtimeDebugAvailable">
                  <td colspan="5" class="null-table-cell">null</td>
                </tr>
                <tr v-for="(ws, idx) in runtimeDebugAvailable ? workerStats : []" :key="idx">
                  <td>{{ idx }}</td>
                  <td>{{ ws.parseCompletedPerSec.toFixed(1) }}</td>
                  <td>{{ ws.meshCompletedPerSec.toFixed(1) }}</td>
                  <td>{{ ws.avgMeshTimeMs.toFixed(1) }}ms</td>
                  <td>
                    {{ ws.avgMeshWasmTimeMs.toFixed(1) }}/
                    {{ ws.avgMeshNormalizeTimeMs.toFixed(1) }}/
                    {{ ws.avgMeshBuildTimeMs.toFixed(1) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </details>

          <details class="surface-card compact-section storage-card collapsible-section">
            <summary class="section-title collapsible-summary">SAB Storage</summary>
            <div v-if="runtimeDebugAvailable" class="metric-list storage-list">
              <div class="metric-row">
                <span class="metric-row-label">Slots</span>
                <span class="metric-row-value">
                  {{ storageStats.sab.usedSlots }} / {{ storageStats.sab.totalSlots }}
                </span>
              </div>
              <div class="metric-row">
                <span class="metric-row-label">Memory</span>
                <span class="metric-row-value">
                  {{ (storageStats.sab.usedBytes / 1024 / 1024).toFixed(1) }} /
                  {{ (storageStats.sab.capacityBytes / 1024 / 1024).toFixed(1) }} MB
                </span>
              </div>
              <div class="storage-group">
                <div class="storage-subtitle">Chunk Distribution</div>
                <div class="metric-list compact-list">
                  <div
                    v-for="(count, key) in storageStats.distribution"
                    :key="key"
                    class="metric-row"
                  >
                    <span class="metric-row-label">{{ key }}</span>
                    <strong class="metric-row-value">{{ count }}</strong>
                  </div>
                </div>
              </div>
              <div v-if="storageStats.heap" class="storage-group">
                <div class="storage-subtitle">Heap Allocator</div>
                <div class="metric-list compact-list">
                  <div class="metric-row">
                    <span class="metric-row-label">Total</span>
                    <span class="metric-row-value">{{ storageStats.heap.total }}</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row-label">Used</span>
                    <span class="metric-row-value">{{ storageStats.heap.used }}</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row-label">Free</span>
                    <span class="metric-row-value">{{ storageStats.heap.free }}</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row-label">Max</span>
                    <span class="metric-row-value">{{ storageStats.heap.maxContig }}</span>
                  </div>
                  <div class="metric-row">
                    <span class="metric-row-label">Frag</span>
                    <span class="metric-row-value">{{ storageStats.heap.frag }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="null-state">null</div>
          </details>

          <section class="surface-card compact-section log-card">
            <details class="log-details">
              <summary class="section-title log-summary">Raw Debug Stream</summary>
              <pre class="debug-output">{{ rawDebugOutput }}</pre>
            </details>
          </section>
        </div>
      </div>
    </aside>

    <div v-if="showTeleportModal" class="modal-overlay">
      <div class="modal">
        <h3>Teleport</h3>
        <div class="input-group">
          <label>X: <input v-model.number="teleportCoords.x" type="number" /></label>
        </div>
        <div class="input-group">
          <label>Y: <input v-model.number="teleportCoords.y" type="number" /></label>
        </div>
        <div class="input-group">
          <label>Z: <input v-model.number="teleportCoords.z" type="number" /></label>
        </div>
        <div class="actions">
          <button @click="teleport">Go</button>
          <button @click="closeModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { DEBUG_FLAGS, readBoolDebugFlag } from '@/config/debug'
import { resolveSceneConfig, DEBUG_RENDER_SCENE_KEY } from '@/config/scene'
import {
  buildRuntimeDebugEntries,
  formatRuntimeDebugOutput,
} from '@/engine/debug/runtimeDebugFormatter'
import {
  createReferenceDemoHologramEffectSettings,
  type HologramEffectSettings,
} from '@/engine/render/backend/webgl2/ui3d/HologramEffectSettings'
import {
  LIQUID_GLASS_CONTROL_SECTIONS as LIQUID_GLASS_EFFECT_CONTROL_SECTIONS,
  createReferenceDemoLiquidGlassEffectSettings,
  type LiquidGlassControlDefinition,
  type LiquidGlassEffectSettings,
} from '@/engine/render/backend/webgl2/ui3d/LiquidGlassEffectSettings'
import { createHologramComponent } from '@/engine/render/backend/webgl2/ui3d/HologramComponent'
import { createLiquidGlassComponent } from '@/engine/render/backend/webgl2/ui3d/LiquidGlassComponent'
import { createTextLabelComponent } from '@/engine/render/backend/webgl2/ui3d/TextLabelComponent'
import {
  createReferenceDemoTextLabelStyle,
  type TextLabelStyle,
} from '@/engine/render/backend/webgl2/ui3d/TextLabelSettings'
import { useEngine } from '@/hooks/useEngine'
import { useResourceStore } from '@/stores/resource'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isControlsExpanded = ref(true)
const showTeleportModal = ref(false)
const teleportCoords = ref({ x: 0, y: 0, z: 0 })
const liquidGlassVisible = ref(false)
const liquidGlassPanelFrame = ref({ x: 32, y: 28, width: 360, height: 220 })
const liquidGlassSettings = ref<LiquidGlassEffectSettings>(
  createReferenceDemoLiquidGlassEffectSettings(),
)
const hologramVisible = ref(false)
const hologramPanelFrame = ref({ x: 436, y: 56, width: 280, height: 188 })
const hologramSettings = ref<HologramEffectSettings>(createReferenceDemoHologramEffectSettings())
const textVisible = ref(false)
const textLabelFrame = ref({ x: 40, y: 284, width: 320, height: 88 })
const textLabelStyle = ref<TextLabelStyle>(createReferenceDemoTextLabelStyle())
const route = useRoute()

const enableRuntimeDebug = readBoolDebugFlag(
  typeof route.query.runtimeDebug === 'string' ? route.query.runtimeDebug : null,
  DEBUG_FLAGS.runtime,
)

const {
  renderer,
  debugStatus,
  performanceSnapshot,
  runtimeDebugSnapshot,
  setup,
  rebuildScene,
  renderCameraEyePosition,
  renderCameraViewPosition,
  motionAnchorPosition,
  perspectiveMode,
  cyclePerspectiveMode,
  teleportMotionAnchor,
  dispose,
  realFps,
  cacheMissCount,
  workerStats,
  storageStats,
  selectedBlockState,
  targetedBlockState,
  targetedBlockPosition,
  firstPersonHandOffset,
  firstPersonHandRotation,
  resetFirstPersonHandPose,
} = useEngine({ enableRuntimeDebug })

const resourceStore = useResourceStore()

const runtimeDebugAvailable = computed(
  () => enableRuntimeDebug && runtimeDebugSnapshot.value !== null,
)
const runtimeDebugStatus = computed(() => (enableRuntimeDebug ? 'runtime on' : 'runtime off'))
const rawDebugOutput = computed(() =>
  formatRuntimeDebugOutput(runtimeDebugSnapshot.value, performanceSnapshot.value),
)

const cameraPositionLabel = computed(() => {
  return `${Math.floor(-renderCameraEyePosition[0])}, ${Math.floor(renderCameraEyePosition[1])}, ${Math.floor(-renderCameraEyePosition[2])}`
})

const cameraViewPositionLabel = computed(() => {
  return `${Math.floor(-renderCameraViewPosition[0])}, ${Math.floor(renderCameraViewPosition[1])}, ${Math.floor(-renderCameraViewPosition[2])}`
})

const perspectiveModeLabel = computed(() => perspectiveMode())

const playerPositionLabel = computed(() => {
  return `${Math.floor(-motionAnchorPosition[0])}, ${Math.floor(motionAnchorPosition[1])}, ${Math.floor(-motionAnchorPosition[2])}`
})

type ParsedMetric = { label: string; value: string }
type MetricGroup = { title: string; items: ParsedMetric[] }

const liquidGlassControlSections = LIQUID_GLASS_EFFECT_CONTROL_SECTIONS

function getControlValue(path: readonly string[]) {
  return path.reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, liquidGlassSettings.value)
}

function setControlValue(path: readonly string[], value: unknown) {
  const nextSettings = JSON.parse(
    JSON.stringify(liquidGlassSettings.value),
  ) as LiquidGlassEffectSettings
  let cursor: Record<string, unknown> = nextSettings as unknown as Record<string, unknown>
  for (let index = 0; index < path.length - 1; index++) {
    cursor = cursor[path[index]] as Record<string, unknown>
  }
  cursor[path[path.length - 1]] = value
  liquidGlassSettings.value = nextSettings
  syncUi3dComponents()
}

function formatControlValue(control: LiquidGlassControlDefinition) {
  const value = getControlValue(control.path)
  if (Array.isArray(value)) {
    return value.map(component => Number(component).toFixed(2)).join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off'
  }
  if (typeof value === 'number') {
    return control.kind === 'int' ? `${Math.round(value)}` : value.toFixed(2)
  }
  return 'n/a'
}

function onBooleanControlInput(control: LiquidGlassControlDefinition, event: Event) {
  if (control.kind !== 'boolean') {
    return
  }
  setControlValue(control.path, (event.target as HTMLInputElement).checked)
}

function onNumberControlInput(control: LiquidGlassControlDefinition, event: Event) {
  if (control.kind !== 'float' && control.kind !== 'int') {
    return
  }
  const rawValue = Number((event.target as HTMLInputElement).value)
  setControlValue(control.path, control.kind === 'int' ? Math.round(rawValue) : rawValue)
}

function onVec3ControlInput(
  control: LiquidGlassControlDefinition,
  channelIndex: number,
  event: Event,
) {
  if (control.kind !== 'vec3') {
    return
  }
  const nextVec = [...(getControlValue(control.path) as [number, number, number])] as [
    number,
    number,
    number,
  ]
  nextVec[channelIndex] = Number((event.target as HTMLInputElement).value)
  setControlValue(control.path, nextVec)
}

function resetLiquidGlassSettings() {
  liquidGlassSettings.value = createReferenceDemoLiquidGlassEffectSettings()
  syncUi3dComponents()
}

function resetHologramSettings() {
  hologramSettings.value = createReferenceDemoHologramEffectSettings()
  syncUi3dComponents()
}

function syncUi3dComponents() {
  const activeRenderer = renderer.value
  const canvas = canvasRef.value
  if (!activeRenderer || !canvas) {
    return
  }

  const components = []

  if (liquidGlassVisible.value) {
    const width = Math.min(liquidGlassSettings.value.shape.width, canvas.width - 32)
    const height = Math.min(liquidGlassSettings.value.shape.height, canvas.height - 32)
    const x = Math.min(liquidGlassPanelFrame.value.x, canvas.width - width - 16)
    const y = Math.min(liquidGlassPanelFrame.value.y, canvas.height - height - 16)
    components.push(
      createLiquidGlassComponent(
        1,
        {
          x: Math.max(16, x),
          y: Math.max(16, y),
          width,
          height,
        },
        liquidGlassSettings.value,
        '0',
      ),
    )
  }

  if (hologramVisible.value) {
    const width = Math.min(hologramPanelFrame.value.width, canvas.width - 32)
    const height = Math.min(hologramPanelFrame.value.height, canvas.height - 32)
    const x = Math.min(hologramPanelFrame.value.x, canvas.width - width - 16)
    const y = Math.min(hologramPanelFrame.value.y, canvas.height - height - 16)
    components.push(
      createHologramComponent(
        2,
        {
          x: Math.max(16, x),
          y: Math.max(16, y),
          width,
          height,
        },
        hologramSettings.value,
        8,
      ),
    )
  }

  if (textVisible.value) {
    const width = Math.min(textLabelFrame.value.width, canvas.width - 32)
    const height = Math.min(textLabelFrame.value.height, canvas.height - 32)
    const x = Math.min(textLabelFrame.value.x, canvas.width - width - 16)
    const y = Math.min(textLabelFrame.value.y, canvas.height - height - 16)
    components.push(
      createTextLabelComponent(
        3,
        {
          x: Math.max(16, x),
          y: Math.max(16, y),
          width,
          height,
        },
        textLabelStyle.value,
        100,
      ),
    )
  }

  activeRenderer.setUi3dComponents(components)
}

function collectMetricGroup(
  title: string,
  labels: readonly string[],
  metrics: ParsedMetric[],
  usedLabels: Set<string>,
) {
  const items = labels
    .map(label => metrics.find(item => item.label === label))
    .filter((item): item is ParsedMetric => !!item)

  for (const item of items) {
    usedLabels.add(item.label)
  }

  return items.length > 0 ? { title, items } : null
}

const parsedMetrics = computed(() => {
  return buildRuntimeDebugEntries(runtimeDebugSnapshot.value, performanceSnapshot.value)
})

const priorityMetricLabels = [
  'Visible O/D/T',
  'Upload',
  'Commit R/P',
  'Resident Dead/Live KB',
  'Bridge C/Avg/Max',
  'Exec Calls/s',
  'Rebuild/Commit',
]

const priorityMetrics = computed(() => {
  if (!runtimeDebugAvailable.value) {
    return []
  }

  return priorityMetricLabels
    .map(label => parsedMetrics.value.find(item => item.label === label))
    .filter((item): item is ParsedMetric => !!item)
})

const metricGroups = computed<MetricGroup[]>(() => {
  if (!runtimeDebugAvailable.value) {
    return []
  }

  const usedLabels = new Set(priorityMetrics.value.map(item => item.label))
  const groups = [
    collectMetricGroup(
      'Scene & Streaming',
      ['Anchor/Eye/View', 'Chunks', 'Artifacts C/S/I'],
      parsedMetrics.value,
      usedLabels,
    ),
    collectMetricGroup('Worker & Pipeline', ['Worker Mesh/s'], parsedMetrics.value, usedLabels),
    collectMetricGroup(
      'Render & Frame',
      ['Lights Agg/Sel', '[Frame] csm', 'Shadow'],
      parsedMetrics.value,
      usedLabels,
    ),
  ].filter((group): group is { title: string; items: ParsedMetric[] } => !!group)

  const uncategorized = parsedMetrics.value.filter(item => !usedLabels.has(item.label))
  if (uncategorized.length > 0) {
    groups.push({
      title: 'Other Signals',
      items: uncategorized,
    })
  }

  return groups
})

const teleport = () => {
  teleportMotionAnchor([-teleportCoords.value.x, teleportCoords.value.y, -teleportCoords.value.z])
  showTeleportModal.value = false
  canvasRef.value?.requestPointerLock()
}

const closeModal = () => {
  showTeleportModal.value = false
  canvasRef.value?.requestPointerLock()
}

const onKeyDown = (event: KeyboardEvent) => {
  if (showTeleportModal.value) {
    if (event.code === 'Escape') {
      closeModal()
    }
    return
  }

  if (event.code === 'KeyZ') {
    isControlsExpanded.value = !isControlsExpanded.value
    return
  }

  if (event.code === 'KeyI') {
    event.preventDefault()
    liquidGlassVisible.value = !liquidGlassVisible.value
    syncUi3dComponents()
    return
  }

  if (event.code === 'KeyO') {
    event.preventDefault()
    hologramVisible.value = !hologramVisible.value
    syncUi3dComponents()
    return
  }

  if (event.code === 'KeyT') {
    event.preventDefault()
    textVisible.value = !textVisible.value
    syncUi3dComponents()
    return
  }

  if (event.code === 'F5') {
    event.preventDefault()
    cyclePerspectiveMode()
    return
  }

  if (event.code === 'KeyM') {
    showTeleportModal.value = true
    document.exitPointerLock()
    teleportCoords.value = {
      x: Math.floor(-motionAnchorPosition[0]),
      y: Math.floor(motionAnchorPosition[1]),
      z: Math.floor(-motionAnchorPosition[2]),
    }
  }
}

const bootRenderer = async () => {
  if (!canvasRef.value) return
  const sceneConfig = resolveSceneConfig(DEBUG_RENDER_SCENE_KEY)
  await setup(canvasRef.value, resourceStore.activeResource, {
    worldBasePath: sceneConfig.mcaBaseUrl,
  })
  syncUi3dComponents()
}

onMounted(async () => {
  if (!canvasRef.value) return

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', syncUi3dComponents)
  await bootRenderer()
})

watch(
  () => resourceStore.activeKey,
  async () => {
    if (!canvasRef.value) return
    dispose()
    await bootRenderer()
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', syncUi3dComponents)
  dispose()
})
</script>

<style scoped>
.renderer-test {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.controls {
  position: absolute;
  top: 12px;
  left: 12px;
  width: min(460px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: auto;
  color: #202020;
  background: rgba(245, 245, 245, 0.3);
  border: 1px solid #8f8f8f;
  border-radius: 0;
  box-shadow: none;
  scrollbar-width: auto;
  backdrop-filter: none;
}

.controls.collapsed {
  width: 280px;
}

.controls-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 10px;
  cursor: pointer;
  user-select: none;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #666;
}

.panel-title {
  margin-top: 2px;
  font-size: 20px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.header-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid #8f8f8f;
}

.badge-status {
  background: rgba(242, 242, 242, 0.24);
  color: #222;
}

.badge-fps {
  background: rgba(242, 242, 242, 0.24);
  color: #222;
}

.badge-runtime {
  background: rgba(242, 242, 242, 0.24);
  color: #222;
}

.collapse-indicator {
  align-self: center;
  font-size: 12px;
  color: #666;
}

.controls-body {
  padding: 0 14px 14px;
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.action-btn {
  padding: 6px 10px;
  border-radius: 0;
  font-weight: 700;
  letter-spacing: 0.02em;
  border: 1px solid #888;
  font-size: 12px;
  background: rgba(239, 239, 239, 0.26);
  color: #111;
}

.action-btn.primary {
  background: rgba(239, 239, 239, 0.26);
  color: #111;
}

.toolbar-hint {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid #b4b4b4;
  color: #333;
  font-size: 11px;
}

.metrics-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.liquid-glass-panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.liquid-glass-section {
  display: grid;
  gap: 6px;
  padding: 8px 9px;
  border: 1px solid rgba(160, 160, 160, 0.85);
  background: rgba(255, 255, 255, 0.16);
}

.liquid-glass-controls {
  display: grid;
  gap: 8px;
}

.liquid-glass-control {
  display: grid;
  gap: 4px;
}

.liquid-glass-toggle,
.liquid-glass-slider-header,
.liquid-glass-vec3-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #444;
}

.liquid-glass-slider,
.liquid-glass-vec3-grid {
  display: grid;
  gap: 6px;
}

.liquid-glass-vec3-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.liquid-glass-slider input,
.liquid-glass-toggle input {
  width: 100%;
}

.liquid-glass-vec3-grid .liquid-glass-slider {
  gap: 2px;
}

.surface-card {
  padding: 10px 12px;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid #b4b4b4;
}

.collapsible-section {
  padding: 0;
}

.collapsible-section > :not(summary) {
  padding: 0 12px 10px;
}

.collapsible-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
}

.collapsible-summary::-webkit-details-marker {
  display: none;
}

.collapsible-summary::after {
  content: 'Expand';
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: none;
  color: #666;
}

.collapsible-section[open] > .collapsible-summary::after {
  content: 'Collapse';
}

.scheduler-panel-card {
  gap: 10px;
}

.scheduler-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.scheduler-card {
  display: grid;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid rgba(160, 160, 160, 0.85);
  background: rgba(255, 255, 255, 0.16);
}

.scheduler-card-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 8px;
}

.scheduler-card-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #222;
}

.scheduler-card-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: #555;
}

.scheduler-card-badge {
  min-width: 44px;
  padding: 3px 6px;
  border: 1px solid rgba(120, 120, 120, 0.9);
  background: rgba(255, 255, 255, 0.28);
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  color: #222;
}

.scheduler-card-badge-calm {
  background: rgba(231, 236, 230, 0.45);
}

.scheduler-card-badge-warn {
  background: rgba(247, 228, 178, 0.58);
}

.scheduler-card-badge-critical {
  background: rgba(244, 191, 176, 0.62);
}

.scheduler-card-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 8px;
}

.scheduler-kv {
  display: grid;
  gap: 2px;
}

.scheduler-kv-span {
  grid-column: 1 / -1;
}

.scheduler-kv-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #666;
}

.scheduler-kv-value {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 12px;
  line-height: 1.3;
  color: #111;
  word-break: break-word;
}

.compact-section {
  display: grid;
  gap: 8px;
}

.section-title {
  margin-bottom: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #555;
}

.headline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
}

.step3-focus-card .headline-grid {
  grid-template-columns: 1fr;
  gap: 6px;
}

.step3-focus-card .headline-item {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(180, 180, 180, 0.7);
  background: rgba(255, 255, 255, 0.14);
}

.step3-focus-card .headline-label,
.step3-focus-card .headline-value {
  display: block;
}

.step3-focus-card .headline-label {
  line-height: 1.2;
}

.step3-focus-card .headline-value {
  font-size: 13px;
  line-height: 1.25;
  text-align: left;
  word-break: normal;
  overflow-wrap: anywhere;
}

.headline-item,
.metric-row {
  display: grid;
  grid-template-columns: minmax(108px, auto) 1fr;
  gap: 8px;
  align-items: start;
}

.headline-label,
.metric-row-label {
  font-size: 11px;
  color: #555;
}

.headline-value,
.metric-row-value {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 12px;
  line-height: 1.3;
  color: #111;
  word-break: break-word;
  text-align: right;
}

.metric-list {
  display: grid;
  gap: 4px;
}

.null-state,
.null-table-cell {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 12px;
  line-height: 1.3;
  color: #444;
}

.null-table-cell {
  text-align: center;
  padding: 10px 0;
}

.compact-list {
  padding-top: 2px;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.stats-table th,
.stats-table td {
  padding: 5px 6px;
  text-align: left;
  border-bottom: 1px solid #d2d2d2;
}

.stats-table th {
  color: #555;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(244, 244, 244, 0.22);
}

.storage-list,
.storage-group {
  display: grid;
  gap: 6px;
}

.tuner-grid {
  display: grid;
  gap: 10px;
}

.tuner-group {
  display: grid;
  gap: 6px;
}

.tuner-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tuner-row label {
  display: grid;
  gap: 4px;
  font-size: 11px;
  color: #555;
}

.tuner-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.tuner-row input {
  width: 100%;
  min-width: 0;
  background: rgba(255, 255, 255, 0.32);
  color: #111;
  border: 1px solid #888;
  padding: 4px 6px;
}

.tuner-actions {
  display: flex;
  justify-content: flex-end;
}

.storage-subtitle {
  margin-top: 4px;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666;
}

.log-details {
  display: grid;
  gap: 8px;
}

.log-summary {
  cursor: pointer;
  list-style: none;
}

.log-summary::-webkit-details-marker {
  display: none;
}

.debug-output {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  padding: 10px;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.22);
  color: #111;
  border: 1px solid #c8c8c8;
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 11px;
  line-height: 1.35;
  white-space: pre-wrap;
  scrollbar-width: auto;
  backdrop-filter: none;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal {
  background: rgba(245, 245, 245, 0.38);
  padding: 20px;
  border-radius: 0;
  color: #222;
  min-width: 200px;
  border: 1px solid #8f8f8f;
}

.input-group {
  margin-bottom: 10px;
}

.input-group input {
  width: 60px;
  margin-left: 10px;
  background: rgba(255, 255, 255, 0.32);
  color: #111;
  border: 1px solid #888;
  padding: 2px 5px;
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

button {
  padding: 5px 15px;
  cursor: pointer;
  background: rgba(239, 239, 239, 0.26);
  color: #111;
  border: 1px solid #888;
  border-radius: 0;
}

button:hover {
  background: rgba(226, 226, 226, 0.36);
}

@media (max-width: 900px) {
  .controls {
    top: 10px;
    left: 10px;
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }

  .scheduler-grid,
  .scheduler-card-metrics,
  .scheduler-card-header,
  .scheduler-kv,
  .scheduler-kv-span {
    grid-template-columns: 1fr;
  }

  .scheduler-card-header {
    display: grid;
  }

  .headline-grid,
  .headline-item,
  .metric-row,
  .tuner-row {
    grid-template-columns: 1fr;
  }

  .headline-value,
  .metric-row-value {
    text-align: left;
  }
}
</style>
