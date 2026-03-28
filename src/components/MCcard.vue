<template>
  <article
    class="mc-card"
    :class="{
      'mc-card--launcher-draggable': canDragToLauncher,
      'mc-card--launcher-dragging': dragActive,
    }"
    :draggable="canDragToLauncher"
    :title="
      canDragToLauncher
        ? `拖动 ${status.name} 到启动器，自动配置登录并选中 ${status.ip}`
        : undefined
    "
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <div class="card-header">
      <div class="server-info">
        <img v-if="iconValid && iconSrc" :src="iconSrc" alt="server icon" class="server-icon" />
        <div v-else class="server-icon placeholder" aria-hidden="true">MC</div>

        <div class="server-details">
          <div class="server-title-row">
            <h3 class="server-name">{{ status.name }}</h3>
            <span v-if="canDragToLauncher" class="drag-pill">拖到启动器</span>
            <span class="status-pill" :class="statusTone">
              {{ status.server_status === 'online' ? '在线' : '离线' }}
            </span>
          </div>
          <p class="server-meta">
            {{ status.type || '未知类型' }} • {{ status.version || '未知版本' }}
          </p>
          <p v-if="status.ip" class="server-ip">{{ status.ip }}</p>
          <p v-else class="server-ip ip-hidden">────</p>
        </div>
      </div>

      <div class="latency-indicator" :title="latencyTitle">
        <div class="latency-badge" :class="latencyClass">
          <span class="latency-dot"></span>
          <span class="latency-value">{{ latencyValue }}</span>
          <span class="latency-unit">ms</span>
        </div>
      </div>
    </div>

    <div class="server-description">
      <p v-if="!status.motdSegments.length" class="motd-text">暂无服务器描述</p>
      <p v-else class="motd-text">
        <template v-for="(seg, i) in status.motdSegments" :key="i">
          <span class="motd-segment" :style="getMotdSegmentStyle(seg)">{{ seg.text }}</span>
        </template>
      </p>
    </div>

    <div class="metric-grid">
      <article class="metric-card">
        <span class="metric-label">在线玩家</span>
        <strong>{{ playersText }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-label">状态更新时间</span>
        <strong>{{ refreshAge }}</strong>
      </article>
    </div>

    <div class="card-footer">
      <div class="server-stats">
        <span class="players-count">{{ status.connect_ms != null ? '响应正常' : '暂无延迟' }}</span>
        <span class="protocol-info">协议版本 {{ status.protocol || '—' }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { McStatus, MotdSegment } from '@/types/mcstatus'
import { formatRelativeTime } from '@/utils/mcStatus'
import { buildLauncherDropProfile, populateLauncherDragData } from '@/utils/launcherDrag'
import { notify } from '@/utils/notify'

const props = defineProps<{ status: McStatus }>()
const status = props.status

function normalizeIconRaw(v: string | null | undefined) {
  if (!v) return null
  let s = String(v).trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  s = s.replace(/\\r|\\n/g, '')
  const noSpace = s.replace(/\s+/g, '')
  if (noSpace.startsWith('data:')) return noSpace
  if (/^[A-Za-z0-9+/=]+$/.test(noSpace)) {
    return `data:image/png;base64,${noSpace}`
  }
  if (noSpace.includes('base64,')) return noSpace
  return s || null
}

const iconSrc = computed(() => normalizeIconRaw(status.icon))
const iconValid = ref(false)
const dragActive = ref(false)
const canDragToLauncher = computed(() => status.expose_ip && Boolean(status.ip?.trim()))

watch(
  iconSrc,
  value => {
    if (!value) {
      iconValid.value = false
      return
    }
    const image = new Image()
    image.onload = () => (iconValid.value = true)
    image.onerror = () => (iconValid.value = false)
    image.src = value
  },
  { immediate: true },
)

const latencyClass = computed(() => {
  const ms = status.connect_ms
  if (ms == null) return 'unknown'
  if (ms < 150) return 'good'
  if (ms < 400) return 'warning'
  return 'bad'
})

const latencyValue = computed(() => (status.connect_ms != null ? status.connect_ms : '—'))
const latencyTitle = computed(() =>
  status.connect_ms != null ? `${status.connect_ms} ms` : '无法获取延迟',
)
const playersText = computed(() => `${status.players_online ?? '—'} / ${status.players_max ?? '—'}`)
const refreshAge = computed(() => formatRelativeTime(status.last_update))
const statusTone = computed(() =>
  status.server_status === 'online' ? 'status-online' : 'status-offline',
)

function getMotdSegmentStyle(segment: MotdSegment) {
  const textDecoration = [
    segment.underlined ? 'underline' : '',
    segment.strikethrough ? 'line-through' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    color: segment.color ?? undefined,
    fontWeight: segment.bold ? '700' : undefined,
    fontStyle: segment.italic ? 'italic' : undefined,
    textDecoration: textDecoration || undefined,
  }
}

function handleDragStart(event: DragEvent) {
  if (!canDragToLauncher.value || !event.dataTransfer || !status.ip) {
    event.preventDefault()
    return
  }

  try {
    const profile = buildLauncherDropProfile(status.name, status.ip)
    populateLauncherDragData(event.dataTransfer, profile)
    dragActive.value = true
  } catch (error) {
    event.preventDefault()
    console.error('launcher drag build failed', error)
    notify.error(error instanceof Error ? error.message : '启动器拖拽配置生成失败')
  }
}

function handleDragEnd() {
  dragActive.value = false
}
</script>

<style scoped>
.mc-card {
  display: flex;
  position: relative;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
  transition:
    transform 220ms ease,
    box-shadow 220ms ease,
    border-color 220ms ease;
  border: 1px solid var(--theme-border-strong);
  border-radius: 22px;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 13%),
    color-mix(in srgb, var(--theme-card-bg) 76%, transparent)
  );
  box-shadow: var(--theme-shadow-hero);
  backdrop-filter: blur(18px) saturate(132%);
}

.mc-card--launcher-draggable {
  cursor: grab;
}

.mc-card--launcher-draggable:active,
.mc-card--launcher-dragging {
  cursor: grabbing;
}

.mc-card--launcher-draggable:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 32%, var(--theme-border-strong));
}

.mc-card--launcher-dragging {
  transform: scale(0.985);
  opacity: 0.92;
}

.mc-card::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-accent) 20%, transparent),
    transparent 72%
  );
  pointer-events: none;
  inset: 0 auto auto 0;
}

.mc-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 20px 42px rgb(15 23 42 / 12%);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.server-info {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.server-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 50%;
  object-fit: cover;
}

.server-icon.placeholder {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-accent-soft) 68%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 84%, transparent)
  );
  color: var(--theme-text-strong);
  font-weight: 700;
}

.server-details {
  flex: 1;
  min-width: 0;
}

.server-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 4px;
}

.drag-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px dashed color-mix(in srgb, var(--theme-accent) 44%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent-soft) 44%, transparent);
  color: var(--theme-text-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.server-name {
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.status-online {
  border-color: color-mix(in srgb, #2ecc71 28%, transparent);
  background: color-mix(in srgb, #2ecc71 18%, transparent);
  color: #198754;
}

.status-offline {
  border-color: color-mix(in srgb, #94a3b8 26%, transparent);
  background: color-mix(in srgb, #64748b 14%, transparent);
  color: var(--el-text-color-secondary);
}

.server-meta,
.server-ip {
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-meta {
  font-size: 13px;
  line-height: 1.2;
}

.server-ip {
  margin-top: 6px;
  font-size: 12px;
  letter-spacing: 0.04em;
}

.server-ip.ip-hidden {
  opacity: 0.4;
  letter-spacing: 0.2em;
}

.latency-indicator {
  flex-shrink: 0;
}

.latency-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  transition: all 0.3s ease;
  border-radius: 20px;
  color: var(--el-color-white);
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
}

.latency-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentcolor;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 20%);
}

.latency-value {
  font-weight: 700;
}

.latency-unit {
  opacity: 0.8;
  font-size: 11px;
}

.latency-badge.good {
  background-color: var(--el-color-success);
}

.latency-badge.warning {
  background-color: var(--el-color-warning);
}

.latency-badge.bad {
  background-color: var(--el-color-danger);
}

.latency-badge.unknown {
  background-color: var(--el-color-info);
}

.server-description {
  margin: 10px 0 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 6%), rgb(255 255 255 / 2%)),
    color-mix(in srgb, var(--theme-card-bg) 68%, rgb(9 17 32 / 72%));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 10%);
}

.motd-text {
  margin: 0;
  color: color-mix(in srgb, var(--theme-text-strong) 88%, white 12%);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.motd-segment {
  text-shadow: none;
}

:global(html:not(.dark)) .server-description {
  border-color: rgb(59 130 246 / 20%);
  background:
    radial-gradient(circle at top left, rgb(96 165 250 / 18%), transparent 52%),
    linear-gradient(180deg, rgb(16 24 40 / 94%), rgb(28 45 74 / 90%));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 10%),
    0 10px 24px rgb(15 23 42 / 14%);
}

:global(html:not(.dark)) .motd-text {
  color: rgb(241 245 249 / 94%);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 12px 11px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 76%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--theme-card-bg) 72%, transparent);
  gap: 4px;
}

.metric-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.metric-card strong {
  color: var(--theme-text-strong);
  font-size: 16px;
  line-height: 1.15;
}

.card-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
}

.server-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  gap: 16px;
}

.protocol-info {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  text-align: right;
}

@media (width <= 640px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .latency-indicator {
    align-self: flex-end;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .server-stats {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (width <= 480px) {
  .server-info {
    width: 100%;
  }

  .server-title-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
