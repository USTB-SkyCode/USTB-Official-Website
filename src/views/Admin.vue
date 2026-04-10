<template>
  <div class="page admin-page app-page app-page--header">
    <section class="admin-shell app-shell">
      <div class="hero-card glass-card">
        <div class="hero-copy">
          <p class="eyebrow section-kicker">Operations Console</p>
          <h1>MC 管理员面板</h1>
          <p class="hero-subtitle">后台操作</p>
        </div>

        <div class="hero-actions glass-actions">
          <p class="actions-kicker glass-actions-label">Quick Actions</p>
          <button class="hero-action-button action-sync" :disabled="loadingSync" @click="syncAll">
            {{ loadingSync ? '同步中...' : '同步列表与状态' }}
          </button>
          <button class="hero-action-button action-home" @click="router.push('/home')">
            回到主页
          </button>
        </div>
      </div>

      <template v-if="userStore.isAdmin">
        <div class="admin-grid">
          <article class="panel-card glass-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker section-kicker">Registry</p>
                <h2>服务器列表维护</h2>
              </div>
              <button
                class="panel-button panel-button-ghost"
                :disabled="loadingList"
                @click="loadServers"
              >
                {{ loadingList ? '刷新中...' : '刷新列表' }}
              </button>
            </div>

            <div class="form-grid">
              <input
                :value="inputId ?? ''"
                class="field-input id-input"
                type="number"
                min="0"
                step="1"
                placeholder="id"
                @input="onIdInput"
              />
              <input v-model="inputIp" class="field-input" :placeholder="ipPlaceholder" />
              <input
                v-model="inputPort"
                class="field-input port-input"
                placeholder="端口（可选）"
              />
              <input v-model="inputName" class="field-input" placeholder="服务器名称（可选）" />
              <label class="toggle-field">
                <input v-model="inputExposeIp" class="toggle-input" type="checkbox" />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="expose-label">暴露 IP</span>
              </label>
            </div>

            <div class="inline-actions">
              <button
                class="panel-button panel-button-success"
                :disabled="loadingAdd"
                @click="createServer"
              >
                {{ loadingAdd ? '提交中...' : '新增服务器' }}
              </button>
              <button
                class="panel-button panel-button-warning"
                :disabled="updateButtonLoading"
                @click="updateServer"
              >
                {{ updateButtonLoading ? '处理中...' : '更新服务器' }}
              </button>
              <button class="panel-button panel-button-ghost" @click="resetForm">清空表单</button>
              <button
                class="panel-button panel-button-text"
                :disabled="!currentOrderText"
                @click="copyText(currentOrderText)"
              >
                复制当前顺序
              </button>
              <span class="helper-text">新增忽略 id；更新必须填写 id，或先点表格“编辑”回填。</span>
              <span v-if="orderDirty" class="helper-text helper-warning"
                >当前拖拽顺序尚未提交，点击“更新服务器”后生效。</span
              >
            </div>

            <div class="table-shell">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-sort">排序</th>
                    <th class="col-id">ID</th>
                    <th>名称</th>
                    <th>地址</th>
                    <th class="col-expose">暴露IP</th>
                    <th class="col-actions">操作</th>
                  </tr>
                </thead>
                <tbody ref="serverTableBody">
                  <tr v-for="row in servers" :key="`${row.id ?? 'null'}-${row.ip}`">
                    <td class="col-sort">
                      <button type="button" class="drag-handle" aria-label="拖动排序">☰</button>
                    </td>
                    <td class="col-id">{{ row.id ?? '—' }}</td>
                    <td>{{ row.name || '未命名' }}</td>
                    <td>
                      <span class="cell-ellipsis">{{ row.ip || '—' }}</span>
                    </td>
                    <td class="col-expose">
                      <span :class="row.expose_ip ? 'expose-yes' : 'expose-no'">{{
                        row.expose_ip ? '是' : '否'
                      }}</span>
                    </td>
                    <td class="col-actions">
                      <div class="row-actions">
                        <button class="row-action-button" @click="fillForm(row)">编辑</button>
                        <button class="row-action-button" @click="copyText(row.ip)">
                          复制地址
                        </button>
                        <button
                          class="row-action-button row-action-danger"
                          :disabled="deletingRowId === row.id"
                          @click="deleteServer(row)"
                        >
                          {{ deletingRowId === row.id ? '删除中...' : '删除' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!servers.length">
                    <td colspan="6" class="empty-table">暂无服务器记录</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article class="panel-card glass-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker section-kicker">Status Cache</p>
                <h2>状态缓存</h2>
              </div>
              <button
                class="panel-button panel-button-ghost"
                :disabled="loadingStatus"
                @click="loadStatuses"
              >
                {{ loadingStatus ? '刷新中...' : '刷新状态' }}
              </button>
            </div>

            <div class="table-shell">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>地址</th>
                    <th class="col-status">在线</th>
                    <th class="col-latency">延迟</th>
                    <th>刷新时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="status in parsedStatuses"
                    :key="`${status.name}-${status.ip}-${status.last_update}`"
                  >
                    <td>{{ status.name || '未命名' }}</td>
                    <td>
                      <span class="cell-ellipsis">{{ status.ip || '────' }}</span>
                    </td>
                    <td class="col-status">
                      <span
                        :class="[
                          'status-tag',
                          status.server_status === 'online' ? 'online' : 'offline',
                        ]"
                      >
                        {{ status.server_status === 'online' ? '在线' : '离线' }}
                      </span>
                    </td>
                    <td class="col-latency">{{ status.connect_ms ?? '—' }} ms</td>
                    <td>{{ formatRelativeTime(status.last_update) }}</td>
                  </tr>
                  <tr v-if="!parsedStatuses.length">
                    <td colspan="5" class="empty-table">暂无状态缓存</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article class="panel-card panel-card--full glass-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker section-kicker">Scene Camera Presets</p>
                <h2>场景机位预设</h2>
              </div>
              <button
                class="panel-button panel-button-ghost"
                :disabled="loadingCameraPresets"
                @click="loadSceneCameraPresets"
              >
                {{ loadingCameraPresets ? '刷新中...' : '刷新机位' }}
              </button>
            </div>

            <div class="camera-preset-editor">
              <div class="camera-preset-toolbar">
                <label class="camera-preset-select-field">
                  <span class="camera-preset-field-label">预设</span>
                  <select v-model="selectedCameraPresetKey" class="field-input field-select">
                    <option
                      v-for="option in cameraPresetOptions"
                      :key="option.key"
                      :value="option.key"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <div class="camera-preset-meta">
                  <p class="helper-text camera-preset-description">
                    {{ selectedCameraPresetDescription }}
                  </p>
                  <p class="helper-text">
                    {{
                      selectedCameraPresetRow?.hasOverride
                        ? '当前使用后台覆盖值'
                        : '当前使用前端默认值'
                    }}
                    · {{ formatPresetUpdatedAt(selectedCameraPresetRow?.updatedAt ?? null) }}
                  </p>
                </div>
              </div>

              <div class="camera-form-grid">
                <div class="vector-field">
                  <span class="camera-preset-field-label">相机位置 Position</span>
                  <div class="vector-input-row">
                    <input
                      v-model="cameraPresetForm.position.x"
                      class="field-input"
                      placeholder="X"
                    />
                    <input
                      v-model="cameraPresetForm.position.y"
                      class="field-input"
                      placeholder="Y"
                    />
                    <input
                      v-model="cameraPresetForm.position.z"
                      class="field-input"
                      placeholder="Z"
                    />
                  </div>
                </div>

                <div class="vector-field">
                  <span class="camera-preset-field-label">观察目标 Look Target</span>
                  <div class="vector-input-row">
                    <input
                      v-model="cameraPresetForm.lookTarget.x"
                      class="field-input"
                      placeholder="X"
                    />
                    <input
                      v-model="cameraPresetForm.lookTarget.y"
                      class="field-input"
                      placeholder="Y"
                    />
                    <input
                      v-model="cameraPresetForm.lookTarget.z"
                      class="field-input"
                      placeholder="Z"
                    />
                  </div>
                </div>

                <label class="camera-preset-select-field">
                  <span class="camera-preset-field-label">视角模式</span>
                  <select
                    v-model="cameraPresetForm.perspectiveMode"
                    class="field-input field-select"
                  >
                    <option
                      v-for="option in cameraPerspectiveOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>

              <div class="inline-actions">
                <button
                  class="panel-button panel-button-primary"
                  :disabled="savingCameraPreset"
                  @click="saveCameraPreset"
                >
                  {{ savingCameraPreset ? '保存中...' : '保存当前机位' }}
                </button>
                <button
                  class="panel-button panel-button-ghost"
                  @click="hydrateCameraPresetForm(selectedCameraPresetKey)"
                >
                  载入当前值
                </button>
                <button
                  class="panel-button panel-button-text"
                  :disabled="
                    !selectedCameraPresetRow?.hasOverride ||
                    resettingCameraPresetKey === selectedCameraPresetKey
                  "
                  @click="resetCameraPreset(selectedCameraPresetKey)"
                >
                  {{
                    resettingCameraPresetKey === selectedCameraPresetKey
                      ? '重置中...'
                      : '重置为默认'
                  }}
                </button>
                <span class="helper-text">
                  手动输入每个机位的 Position、Look Target
                  和视角模式；保存后刷新页面即可使用新的默认机位。
                </span>
              </div>

              <div class="table-shell">
                <table class="data-table camera-preset-table">
                  <thead>
                    <tr>
                      <th>预设</th>
                      <th>当前位置</th>
                      <th>观察目标</th>
                      <th class="col-status">视角</th>
                      <th class="col-status">来源</th>
                      <th>最近更新</th>
                      <th class="col-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in cameraPresetRows" :key="row.key">
                      <td>
                        <strong>{{ row.label }}</strong>
                        <div class="helper-text">{{ row.key }}</div>
                      </td>
                      <td>
                        <span class="camera-vector-text">{{
                          formatVectorSummary(row.currentPose.position)
                        }}</span>
                      </td>
                      <td>
                        <span class="camera-vector-text">{{
                          formatVectorSummary(row.currentPose.lookTarget)
                        }}</span>
                      </td>
                      <td>{{ row.currentPose.perspectiveMode ?? '—' }}</td>
                      <td>
                        <span :class="row.hasOverride ? 'status-tag online' : 'status-tag offline'">
                          {{ row.hasOverride ? '覆盖' : '默认' }}
                        </span>
                      </td>
                      <td>{{ formatPresetUpdatedAt(row.updatedAt) }}</td>
                      <td class="col-actions">
                        <div class="row-actions">
                          <button
                            class="row-action-button"
                            @click="hydrateCameraPresetForm(row.key)"
                          >
                            编辑
                          </button>
                          <button
                            class="row-action-button"
                            @click="
                              copyText(
                                `${row.key}\nposition=${formatVectorSummary(row.currentPose.position)}\nlookTarget=${formatVectorSummary(row.currentPose.lookTarget)}`,
                              )
                            "
                          >
                            复制
                          </button>
                          <button
                            class="row-action-button row-action-danger"
                            :disabled="!row.hasOverride || resettingCameraPresetKey === row.key"
                            @click="resetCameraPreset(row.key)"
                          >
                            {{ resettingCameraPresetKey === row.key ? '重置中...' : '重置' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>

        <article class="panel-card response-card glass-card">
          <div class="panel-head">
            <div>
              <p class="panel-kicker section-kicker">Operation Trace</p>
              <h2>最近一次 API 返回</h2>
            </div>
            <button class="panel-button panel-button-text" :disabled="!result" @click="copyResult">
              复制
            </button>
          </div>

          <div v-if="!result" class="empty-state">暂无最近响应</div>
          <pre v-else>{{ result }}</pre>
        </article>
      </template>

      <article v-else class="panel-card denied-card glass-card">
        <p class="panel-kicker section-kicker">Access</p>
        <h2>当前账号没有管理员权限</h2>
        <p>这个页面保留给管理员维护服务器数据。你可以返回主页，或切换有权限的账号后再访问。</p>
        <button class="panel-button panel-button-primary" @click="router.push('/home')">
          返回主页
        </button>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import Sortable, { type SortableEvent } from 'sortablejs'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { PlayerPerspectiveMode } from '@/engine/world/game/PlayerRig'
import {
  CAMERA_PRESET_OPTIONS,
  applySceneCameraPresetOverride,
  clearSceneCameraPresetOverride,
  getSceneCameraPresetOverride,
  isCameraPresetKey,
  replaceSceneCameraPresetOverrides,
  resolveDefaultSceneCameraPreset,
  resolveSceneCameraPreset,
  type CameraPresetKey,
  type EngineCameraPresetPose,
  type SceneCameraPresetOverride,
} from '@/config/scene'
import { useUserStore } from '@/stores/user'
import { apiFetch } from '@/utils/api'
import { formatRelativeTime, mapMcStatusRow } from '@/utils/mcStatus'
import { notify } from '@/utils/notify'

type ServerRow = {
  id: number | null
  ip: string
  name: string | null
  expose_ip: boolean
}

type ApiEnvelope<T = unknown> = {
  data: T | null
  error: unknown
}

type Vector3Tuple = [number, number, number]

type SceneCameraPresetRow = {
  presetKey: CameraPresetKey
  position: Vector3Tuple
  lookTarget: Vector3Tuple
  perspectiveMode: PlayerPerspectiveMode | null
  updatedAt: string | null
}

type CameraPresetDisplayRow = {
  key: CameraPresetKey
  label: string
  description: string
  defaultPose: EngineCameraPresetPose
  currentPose: EngineCameraPresetPose
  hasOverride: boolean
  updatedAt: string | null
}

const router = useRouter()
const userStore = useUserStore()

const inputId = ref<number | null>(null)
const inputIp = ref('')
const inputPort = ref('')
const inputName = ref('')
const inputExposeIp = ref(false)
const editingSnapshot = ref<ServerRow | null>(null)
const serverTableBody = ref<HTMLTableSectionElement | null>(null)
let serverTableSortable: Sortable | null = null

const servers = ref<ServerRow[]>([])
const statusRows = ref<unknown[]>([])
const result = ref<string | null>(null)

const loadingList = ref(false)
const loadingAdd = ref(false)
const loadingSort = ref(false)
const loadingStatus = ref(false)
const loadingSync = ref(false)
const deletingRowId = ref<number | null>(null)
const orderDirty = ref(false)

const loadingCameraPresets = ref(false)
const savingCameraPreset = ref(false)
const resettingCameraPresetKey = ref<CameraPresetKey | null>(null)
const selectedCameraPresetKey = ref<CameraPresetKey>('login')
const cameraPresetForm = reactive({
  position: { x: '', y: '', z: '' },
  lookTarget: { x: '', y: '', z: '' },
  perspectiveMode: 'first-person' as PlayerPerspectiveMode,
})

const cameraPresetOptions = CAMERA_PRESET_OPTIONS
const cameraPerspectiveOptions: Array<{ value: PlayerPerspectiveMode; label: string }> = [
  { value: 'first-person', label: '第一人称' },
  { value: 'spectator', label: '观察者' },
  { value: 'third-person-back', label: '第三人称背后' },
  { value: 'third-person-front', label: '第三人称前视' },
]

const ipPlaceholder = computed(() => {
  const base = 'abc.ustb.world'
  return inputId.value == null ? `${base}（新增时必填）` : `${base}（更新时可选）`
})

const parsedStatuses = computed(() => statusRows.value.map(mapMcStatusRow))
const currentOrderText = computed(() =>
  servers.value
    .map(item => item.id)
    .filter((value): value is number => typeof value === 'number')
    .join(', '),
)
const updateButtonLoading = computed(() => loadingAdd.value || loadingSort.value)
const selectedCameraPresetDescription = computed(
  () =>
    cameraPresetOptions.find(option => option.key === selectedCameraPresetKey.value)?.description ??
    '',
)
const cameraPresetRows = computed<CameraPresetDisplayRow[]>(() => {
  return cameraPresetOptions.flatMap(option => {
    const defaultPose = resolveDefaultSceneCameraPreset(option.key)
    const currentPose = resolveSceneCameraPreset(option.key)
    const override = getSceneCameraPresetOverride(option.key)
    if (!defaultPose || !currentPose) {
      return []
    }

    return [
      {
        ...option,
        defaultPose,
        currentPose,
        hasOverride: Boolean(override),
        updatedAt: override?.updatedAt ?? null,
      },
    ]
  })
})
const selectedCameraPresetRow = computed(
  () => cameraPresetRows.value.find(row => row.key === selectedCameraPresetKey.value) ?? null,
)

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPerspectiveMode(value: unknown): value is PlayerPerspectiveMode {
  return (
    value === 'first-person' ||
    value === 'spectator' ||
    value === 'third-person-back' ||
    value === 'third-person-front'
  )
}

function normalizeVectorTuple(value: unknown): Vector3Tuple | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null
  }

  const [x, y, z] = value
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null
  }

  return [x, y, z]
}

function parseSceneCameraPresetRow(value: unknown): SceneCameraPresetRow | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const row = value as Record<string, unknown>
  if (typeof row.presetKey !== 'string' || !isCameraPresetKey(row.presetKey)) {
    return null
  }

  const position = normalizeVectorTuple(row.position)
  const lookTarget = normalizeVectorTuple(row.lookTarget)
  if (!position || !lookTarget) {
    return null
  }

  return {
    presetKey: row.presetKey,
    position,
    lookTarget,
    perspectiveMode: isPerspectiveMode(row.perspectiveMode) ? row.perspectiveMode : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
  }
}

function formatNumericField(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

function formatVectorSummary(value: readonly [number, number, number]) {
  return value.map(item => formatNumericField(item)).join(', ')
}

function formatPresetUpdatedAt(value: string | null) {
  return value ? formatRelativeTime(value) : '默认内置值'
}

function setVectorForm(
  target: { x: string; y: string; z: string },
  value: readonly [number, number, number],
) {
  target.x = formatNumericField(value[0])
  target.y = formatNumericField(value[1])
  target.z = formatNumericField(value[2])
}

function hydrateCameraPresetForm(presetKey: CameraPresetKey) {
  const pose = resolveSceneCameraPreset(presetKey) ?? resolveDefaultSceneCameraPreset(presetKey)
  if (!pose) {
    return
  }

  selectedCameraPresetKey.value = presetKey
  setVectorForm(cameraPresetForm.position, pose.position)
  setVectorForm(cameraPresetForm.lookTarget, pose.lookTarget)
  cameraPresetForm.perspectiveMode = pose.perspectiveMode ?? 'spectator'
}

function flattenApiError(error: unknown): string | null {
  if (typeof error === 'string') {
    return error
  }

  if (Array.isArray(error)) {
    const parts = error.map(item => flattenApiError(item)).filter(Boolean)
    return parts.length ? parts.join('；') : null
  }

  if (error && typeof error === 'object') {
    const parts = Object.entries(error as Record<string, unknown>)
      .map(([key, value]) => {
        const message = flattenApiError(value)
        return message ? `${key}: ${message}` : null
      })
      .filter((value): value is string => Boolean(value))
    return parts.length ? parts.join('；') : null
  }

  return null
}

function onIdInput(event: Event) {
  const rawValue = (event.target as HTMLInputElement).value.trim()
  if (!rawValue) {
    inputId.value = null
    return
  }

  const nextValue = Number.parseInt(rawValue, 10)
  inputId.value = Number.isFinite(nextValue) ? nextValue : null
}

function getApiErrorMessage(
  response: { body?: ApiEnvelope | null; status: number },
  fallback: string,
) {
  const errorMessage = flattenApiError(response.body?.error)
  return errorMessage || `${fallback}（${response.status || 'network'}）`
}

function buildServerAddress() {
  const host = inputIp.value.trim()
  const port = inputPort.value.trim()

  if (!host) return ''
  return port ? `${host}:${port}` : host
}

async function loadServers() {
  loadingList.value = true
  try {
    const response = await apiFetch<ApiEnvelope<unknown>>('/api/mc-servers', { method: 'GET' })
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '服务器列表读取失败'))
    }

    const rows = Array.isArray(response.body?.data) ? response.body?.data : []
    servers.value = rows.map(item => {
      const row = item as Record<string, unknown>
      return {
        id: typeof row.id === 'number' ? (row.id as number) : null,
        ip: String(row.ip ?? ''),
        name: typeof row.name === 'string' ? (row.name as string) : null,
        expose_ip: row.expose_ip === true || (row.expose_ip as unknown) === 1,
      }
    })
    orderDirty.value = false
    result.value = JSON.stringify(response.body, null, 2)
  } catch (error) {
    servers.value = []
    orderDirty.value = false
    notify.error(error instanceof Error ? error.message : '服务器列表读取失败')
  } finally {
    loadingList.value = false
  }
}

async function loadStatuses() {
  loadingStatus.value = true
  try {
    const response = await apiFetch<ApiEnvelope<unknown>>('/api/mc-servers/statuses', {
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '状态缓存读取失败'))
    }

    statusRows.value = Array.isArray(response.body?.data) ? response.body.data : []
    result.value = JSON.stringify(response.body, null, 2)
  } catch (error) {
    statusRows.value = []
    notify.error(error instanceof Error ? error.message : '状态缓存读取失败')
  } finally {
    loadingStatus.value = false
  }
}

async function loadSceneCameraPresets() {
  loadingCameraPresets.value = true
  try {
    const response = await apiFetch<ApiEnvelope<unknown>>('/api/scene-camera-presets', {
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '机位预设读取失败'))
    }

    const rows = Array.isArray(response.body?.data) ? response.body.data : []
    const nextOverrides: Partial<Record<CameraPresetKey, SceneCameraPresetOverride>> = {}

    for (const item of rows) {
      const row = parseSceneCameraPresetRow(item)
      if (!row) {
        continue
      }

      nextOverrides[row.presetKey] = {
        position: row.position,
        lookTarget: row.lookTarget,
        perspectiveMode: row.perspectiveMode ?? undefined,
        updatedAt: row.updatedAt,
      }
    }

    replaceSceneCameraPresetOverrides(nextOverrides)
    hydrateCameraPresetForm(selectedCameraPresetKey.value)
    result.value = JSON.stringify(response.body, null, 2)
  } catch (error) {
    notify.error(error instanceof Error ? error.message : '机位预设读取失败')
  } finally {
    loadingCameraPresets.value = false
  }
}

async function syncAll() {
  loadingSync.value = true
  try {
    await Promise.all([loadServers(), loadStatuses(), loadSceneCameraPresets()])
  } finally {
    loadingSync.value = false
  }
}

function buildServerPatchPayload(fullIp: string, trimmedName: string, exposeIp: boolean) {
  const payload: Record<string, unknown> = {}
  const snapshot = editingSnapshot.value

  if (snapshot) {
    if (fullIp && fullIp !== snapshot.ip) {
      payload.ip = fullIp
    }

    if (trimmedName && trimmedName !== (snapshot.name ?? '')) {
      payload.name = trimmedName
    }

    if (exposeIp !== snapshot.expose_ip) {
      payload.expose_ip = exposeIp
    }

    return payload
  }

  if (fullIp) {
    payload.ip = fullIp
  }

  if (trimmedName) {
    payload.name = trimmedName
  }

  if (inputExposeIp.value) {
    payload.expose_ip = exposeIp
  }

  return payload
}

async function submitServerPatch(
  serverId: number,
  fullIp: string,
  trimmedName: string,
  exposeIp: boolean,
) {
  const payload = buildServerPatchPayload(fullIp, trimmedName, exposeIp)

  if (!Object.keys(payload).length) {
    return null
  }

  return apiFetch<ApiEnvelope<unknown>>(`/api/mc-servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

async function persistServerOrder() {
  const ids = servers.value
    .map(item => item.id)
    .filter((value): value is number => typeof value === 'number')

  if (!ids.length || !orderDirty.value) {
    return false
  }

  loadingSort.value = true
  try {
    const response = await apiFetch<ApiEnvelope<unknown>>('/api/mc-servers/order', {
      method: 'PUT',
      body: JSON.stringify({ id_list: ids }),
    })

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '排序提交失败'))
    }

    result.value = JSON.stringify(response.body, null, 2)
    orderDirty.value = false
    return true
  } finally {
    loadingSort.value = false
  }
}

function validateCreateInput() {
  if (!inputIp.value.trim() && inputPort.value.trim()) {
    notify.warning('填写端口前请先填写主机地址')
    return false
  }

  if (!inputIp.value.trim()) {
    notify.warning('新增服务器时 ip 为必填项')
    return false
  }

  return true
}

function moveServerRow(oldIndex: number, newIndex: number) {
  const nextRows = [...servers.value]
  const [moved] = nextRows.splice(oldIndex, 1)
  if (!moved) {
    return
  }

  nextRows.splice(newIndex, 0, moved)
  servers.value = nextRows
}

async function initServerDrag() {
  await nextTick()

  if (!(serverTableBody.value instanceof HTMLElement)) {
    return
  }

  if (serverTableSortable?.el === serverTableBody.value) {
    return
  }

  serverTableSortable?.destroy()
  serverTableSortable = Sortable.create(serverTableBody.value, {
    animation: 180,
    handle: '.drag-handle',
    ghostClass: 'drag-row-ghost',
    chosenClass: 'drag-row-chosen',
    onEnd(event: SortableEvent) {
      if (
        typeof event.oldIndex !== 'number' ||
        typeof event.newIndex !== 'number' ||
        event.oldIndex === event.newIndex
      ) {
        return
      }

      moveServerRow(event.oldIndex, event.newIndex)
      orderDirty.value = true
    },
  })
}

function destroyServerDrag() {
  serverTableSortable?.destroy()
  serverTableSortable = null
}

function parseCameraPresetInput(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label}不能为空`)
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}必须是数字`)
  }

  return parsed
}

function buildCameraPresetVectorPayload(
  vector: { x: string; y: string; z: string },
  label: string,
): Vector3Tuple {
  return [
    parseCameraPresetInput(vector.x, `${label} X`),
    parseCameraPresetInput(vector.y, `${label} Y`),
    parseCameraPresetInput(vector.z, `${label} Z`),
  ]
}

async function saveCameraPreset() {
  savingCameraPreset.value = true
  try {
    const payload = {
      position: buildCameraPresetVectorPayload(cameraPresetForm.position, '相机位置'),
      lookTarget: buildCameraPresetVectorPayload(cameraPresetForm.lookTarget, '观察目标'),
      perspectiveMode: cameraPresetForm.perspectiveMode,
    }

    const response = await apiFetch<ApiEnvelope<unknown>>(
      `/api/scene-camera-presets/${selectedCameraPresetKey.value}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '机位预设保存失败'))
    }

    const row = parseSceneCameraPresetRow(response.body?.data)
    if (row) {
      applySceneCameraPresetOverride(row.presetKey, {
        position: row.position,
        lookTarget: row.lookTarget,
        perspectiveMode: row.perspectiveMode ?? undefined,
        updatedAt: row.updatedAt,
      })
      hydrateCameraPresetForm(row.presetKey)
    }

    result.value = JSON.stringify(response.body, null, 2)
    notify.success('机位预设已保存')
  } catch (error) {
    notify.error(error instanceof Error ? error.message : '机位预设保存失败')
  } finally {
    savingCameraPreset.value = false
  }
}

async function resetCameraPreset(presetKey: CameraPresetKey) {
  if (!window.confirm(`确认将 ${presetKey} 机位恢复为默认值吗？`)) {
    return
  }

  resettingCameraPresetKey.value = presetKey
  try {
    const response = await apiFetch<ApiEnvelope<unknown>>(
      `/api/scene-camera-presets/${presetKey}`,
      {
        method: 'DELETE',
      },
    )

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '机位预设重置失败'))
    }

    clearSceneCameraPresetOverride(presetKey)
    hydrateCameraPresetForm(presetKey)
    result.value = JSON.stringify(response.body, null, 2)
    notify.success('机位预设已重置为默认值')
  } catch (error) {
    notify.error(error instanceof Error ? error.message : '机位预设重置失败')
  } finally {
    resettingCameraPresetKey.value = null
  }
}

async function createServer() {
  if (!validateCreateInput()) {
    return
  }

  if (inputId.value != null) {
    notify.info('新增服务器不会使用 id，当前填写的 id 将被忽略')
  }

  const fullIp = buildServerAddress()
  const trimmedName = inputName.value.trim()

  loadingAdd.value = true
  try {
    inputId.value = null
    editingSnapshot.value = null

    const response = await apiFetch<ApiEnvelope<unknown>>('/api/mc-servers', {
      method: 'POST',
      body: JSON.stringify({
        ip: fullIp,
        name: trimmedName || null,
        expose_ip: inputExposeIp.value,
      }),
    })

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '服务器新增失败'))
    }

    result.value = JSON.stringify(response.body, null, 2)
    notify.success('服务器已新增')
    resetForm()
    await loadServers()
  } catch (error) {
    notify.error(error instanceof Error ? error.message : '服务器新增失败')
  } finally {
    loadingAdd.value = false
  }
}

async function updateServer() {
  const hasId = inputId.value != null
  const fullIp = buildServerAddress()
  const trimmedName = inputName.value.trim()
  const shouldSyncOrder = orderDirty.value
  let updatedServer = false
  let updatedOrder = false

  if (!hasId && !shouldSyncOrder) {
    notify.warning('更新服务器必须先填写 id，或先点击表格中的“编辑”')
    return
  }

  if (!inputIp.value.trim() && inputPort.value.trim()) {
    notify.warning('填写端口前请先填写主机地址')
    return
  }

  loadingAdd.value = true
  try {
    if (inputId.value != null) {
      const response = await submitServerPatch(
        inputId.value,
        fullIp,
        trimmedName,
        inputExposeIp.value,
      )

      if (response) {
        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, '服务器更新失败'))
        }

        result.value = JSON.stringify(response.body, null, 2)
        updatedServer = true
      }
    }

    if (shouldSyncOrder) {
      updatedOrder = await persistServerOrder()
    }

    if (!updatedServer && !updatedOrder) {
      notify.warning('没有检测到可提交的变更')
      return
    }

    notify.success(
      updatedServer && updatedOrder
        ? '服务器信息与排序已更新'
        : updatedServer
          ? '服务器已更新'
          : '排序已更新',
    )
    resetForm()
    await loadServers()
  } catch (error) {
    notify.error(error instanceof Error ? error.message : '服务器更新失败')
  } finally {
    loadingAdd.value = false
  }
}

function fillForm(row: ServerRow) {
  editingSnapshot.value = { ...row }
  inputId.value = row.id
  const parts = row.ip.split(':')
  if (parts.length >= 2) {
    inputIp.value = parts.slice(0, -1).join(':')
    inputPort.value = parts[parts.length - 1]
  } else {
    inputIp.value = row.ip
    inputPort.value = ''
  }
  inputName.value = row.name ?? ''
  inputExposeIp.value = row.expose_ip
}

function resetForm() {
  editingSnapshot.value = null
  inputId.value = null
  inputIp.value = ''
  inputPort.value = ''
  inputName.value = ''
  inputExposeIp.value = false
}

async function deleteServer(row: ServerRow) {
  if (row.id == null) {
    notify.error('当前记录缺少 id，无法删除')
    return
  }

  const target = `ID ${row.id}`
  if (!window.confirm(`确认删除 ${target} 吗？`)) {
    return
  }

  deletingRowId.value = row.id
  try {
    const response = await apiFetch<ApiEnvelope<unknown>>(`/api/mc-servers/${row.id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, '服务器删除失败'))
    }

    result.value = JSON.stringify(response.body, null, 2)
    notify.success('服务器已删除')
    await loadServers()
  } catch (error) {
    notify.error(error instanceof Error ? error.message : '服务器删除失败')
  } finally {
    deletingRowId.value = null
  }
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
  notify.success('已复制到剪贴板')
}

async function copyResult() {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value)
  notify.success('已复制最近响应')
}

onMounted(() => {
  if (userStore.isAdmin) {
    void syncAll()
  }
})

watch(
  selectedCameraPresetKey,
  nextPresetKey => {
    hydrateCameraPresetForm(nextPresetKey)
  },
  { immediate: true },
)

watch(
  () => servers.value.map(item => `${item.id ?? 'null'}:${item.ip}`).join('|'),
  () => {
    if (userStore.isAdmin) {
      void initServerDrag()
    }
  },
)

onBeforeUnmount(() => {
  destroyServerDrag()
})
</script>

<style scoped>
.page {
  --page-max-width: 1480px;
}

.admin-page {
  background:
    radial-gradient(circle at top left, rgb(59 130 246 / 0.08), transparent 34%),
    radial-gradient(circle at top right, rgb(14 165 233 / 0.06), transparent 28%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-card-bg) 30%, white 70%),
      transparent 240px
    );
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 28px;
}

.hero-copy h1,
.panel-head h2 {
  margin: 0 0 10px;
  color: var(--theme-text-strong);
}

.hero-copy h1 {
  font-size: clamp(32px, 4vw, 46px);
  line-height: 1;
}

.hero-subtitle {
  max-width: 72ch;
  margin: 0;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}

.hero-actions,
.panel-head,
.inline-actions,
.row-actions {
  display: flex;
}

.hero-actions {
  flex-direction: column;
  gap: 10px;
}

.hero-action-button,
.panel-button,
.row-action-button {
  min-height: 42px;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease,
    opacity 180ms ease;
  border: 1px solid transparent;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  appearance: none;
}

.hero-action-button:disabled,
.panel-button:disabled,
.row-action-button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.hero-action-button,
.panel-button {
  width: 100%;
  padding: 0 14px;
}

.hero-action-button:hover:not(:disabled),
.panel-button:hover:not(:disabled),
.row-action-button:hover:not(:disabled),
.hero-action-button:focus-visible,
.panel-button:focus-visible,
.row-action-button:focus-visible {
  transform: translateY(-1px);
}

.action-sync {
  border-color: rgb(56 189 248 / 16%);
  background:
    linear-gradient(135deg, rgb(96 165 250 / 78%), rgb(56 189 248 / 72%)),
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 8%));
  box-shadow: 0 8px 18px rgb(37 99 235 / 14%);
  color: rgb(239 246 255);
}

.action-home,
.panel-button-ghost {
  border-color: color-mix(in srgb, var(--theme-border-strong) 82%, transparent);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 76%), rgb(255 255 255 / 58%)),
    color-mix(in srgb, var(--theme-card-bg) 52%, white 38%);
  box-shadow: 0 8px 18px rgb(15 23 42 / 6%);
  color: var(--theme-text-strong);
}

.action-home:hover:not(:disabled),
.action-home:focus-visible,
.panel-button-ghost:hover:not(:disabled),
.panel-button-ghost:focus-visible {
  border-color: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-border-strong));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 88%), rgb(255 255 255 / 68%)),
    color-mix(in srgb, var(--theme-accent-soft) 16%, white 62%);
}

.panel-button-success {
  border-color: rgb(34 197 94 / 20%);
  background: linear-gradient(135deg, rgb(34 197 94 / 88%), rgb(22 163 74 / 84%));
  box-shadow: 0 8px 18px rgb(22 163 74 / 14%);
  color: rgb(240 253 244);
}

.panel-button-warning {
  border-color: rgb(245 158 11 / 22%);
  background: linear-gradient(135deg, rgb(245 158 11 / 92%), rgb(217 119 6 / 88%));
  box-shadow: 0 8px 18px rgb(180 83 9 / 16%);
  color: rgb(255 251 235);
}

.panel-button-primary {
  border-color: rgb(59 130 246 / 20%);
  background: linear-gradient(135deg, rgb(59 130 246 / 92%), rgb(37 99 235 / 88%));
  box-shadow: 0 8px 18px rgb(37 99 235 / 16%);
  color: rgb(239 246 255);
}

.panel-button-text,
.row-action-button {
  width: auto;
  min-height: 34px;
  padding: 0 10px;
  border-color: color-mix(in srgb, var(--theme-border-strong) 70%, transparent);
  background: color-mix(in srgb, var(--theme-card-bg) 84%, transparent);
  color: var(--theme-text-strong);
}

.row-action-danger {
  border-color: rgb(239 68 68 / 20%);
  color: rgb(220 38 38);
}

.admin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.95fr);
  gap: 20px;
}

.panel-card--full {
  grid-column: 1 / -1;
}

.panel-card {
  padding: 22px;
}

.panel-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-head h2 {
  font-size: 22px;
}

.form-grid {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) 120px minmax(0, 0.9fr) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.field-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  padding: 0 13px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 82%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-card-bg) 84%, transparent);
  color: var(--theme-text-strong);
  font: inherit;
}

.field-select {
  appearance: none;
}

.field-input::placeholder {
  color: var(--el-text-color-secondary);
}

.toggle-field {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-track {
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 26px;
  padding: 3px;
  transition:
    background 180ms ease,
    border-color 180ms ease;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 82%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-card-bg) 82%, transparent);
}

.toggle-thumb {
  width: 18px;
  height: 18px;
  transition:
    transform 180ms ease,
    background 180ms ease;
  border-radius: 999px;
  background: rgb(255 255 255 / 88%);
  box-shadow: 0 3px 8px rgb(15 23 42 / 16%);
}

.toggle-input:checked + .toggle-track {
  border-color: rgb(59 130 246 / 24%);
  background: rgb(59 130 246 / 78%);
}

.toggle-input:checked + .toggle-track .toggle-thumb {
  transform: translateX(18px);
}

.expose-label,
.helper-text,
.expose-no,
.empty-state,
.empty-table {
  color: var(--el-text-color-secondary);
}

.expose-yes {
  color: #198754;
  font-weight: 600;
}

.inline-actions {
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 14px;
  gap: 12px;
}

.helper-text {
  font-size: 13px;
}

.helper-warning {
  color: var(--theme-accent);
  font-weight: 600;
}

.camera-preset-editor {
  display: grid;
  gap: 16px;
}

.camera-preset-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.camera-preset-select-field,
.vector-field {
  display: grid;
  gap: 8px;
}

.camera-preset-field-label {
  color: var(--theme-text-strong);
  font-size: 13px;
  font-weight: 700;
}

.camera-preset-meta {
  display: grid;
  gap: 6px;
  align-content: start;
}

.camera-preset-description {
  margin: 0;
}

.camera-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(220px, 260px);
  gap: 14px;
  align-items: end;
}

.vector-input-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.camera-preset-table {
  min-width: 980px;
}

.camera-vector-text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.table-shell {
  overflow: auto hidden;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 82%, transparent);
  border-radius: 18px;
}

.data-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  background: color-mix(in srgb, var(--theme-card-bg) 88%, transparent);
}

.data-table thead {
  background: color-mix(in srgb, var(--theme-card-bg) 92%, transparent);
}

.data-table th,
.data-table td {
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-border-strong) 76%, transparent);
  text-align: left;
  vertical-align: middle;
}

.data-table tbody tr:hover {
  background: color-mix(in srgb, var(--theme-accent-soft) 22%, transparent);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.col-sort,
.col-id,
.col-expose,
.col-status,
.col-latency {
  width: 1%;
  white-space: nowrap;
}

.col-actions {
  min-width: 220px;
}

.cell-ellipsis {
  display: inline-block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 80%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-card-bg) 90%, white 8%);
  color: var(--theme-text-strong);
  font-size: 18px;
  line-height: 1;
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

:deep(.drag-row-ghost > td) {
  background: color-mix(in srgb, var(--theme-accent-soft) 34%, transparent) !important;
}

:deep(.drag-row-chosen > td) {
  background: color-mix(in srgb, var(--theme-accent-soft) 22%, transparent) !important;
}

.row-actions {
  flex-wrap: wrap;
  gap: 6px;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-tag.online {
  background: color-mix(in srgb, #2ecc71 18%, transparent);
  color: #198754;
}

.status-tag.offline {
  background: color-mix(in srgb, #64748b 14%, transparent);
  color: var(--el-text-color-secondary);
}

.response-card pre {
  margin: 0;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.empty-state,
.empty-table {
  text-align: center;
}

.empty-state {
  padding: 20px 16px;
  border: 1px dashed color-mix(in srgb, var(--theme-border-strong) 70%, transparent);
  border-radius: 16px;
}

.empty-table {
  padding: 24px 12px;
}

.denied-card {
  display: grid;
  gap: 14px;
}

.denied-card h2,
.denied-card p {
  margin: 0;
}

@media (width <= 1200px) {
  .admin-grid {
    grid-template-columns: 1fr;
  }
}

@media (width <= 900px) {
  .hero-card {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 100px minmax(0, 1fr) 120px;
  }

  .camera-preset-toolbar,
  .camera-form-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    min-width: 0;
  }
}

@media (width <= 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .table-shell {
    overflow: auto;
  }
}
</style>
