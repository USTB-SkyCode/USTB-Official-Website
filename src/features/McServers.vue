<template>
  <PageBackdropHost :frame-mode="frameMode">
    <div class="page mc-servers-page app-page app-page--header">
      <section
        class="servers-hero glass-card engine-surface-panel"
        data-engine-surface-key="home-servers-hero"
        data-engine-surface-kind="section"
      >
        <div class="hero-head">
          <div class="hero-copy">
            <p class="eyebrow section-kicker">Server Status</p>
            <h1 class="title">服务器列表</h1>
            <p class="subtitle">USTB服务器在线状态</p>
            <p class="hero-download-row">
              <a
                class="hero-download-link"
                href="https://github.com/LYOfficial/USTBL/releases"
                target="_blank"
                rel="noreferrer"
              >
                下载USTBL启动器
              </a>
            </p>
          </div>

          <div class="hero-summary">
            <article
              class="summary-card glass-card glass-summary engine-surface-panel"
              data-engine-surface-key="home-servers-summary-total"
              data-engine-surface-kind="article"
            >
              <span class="summary-label section-kicker">节点总数</span>
              <strong>{{ statuses.length }}</strong>
              <p>当前服务器记录</p>
            </article>

            <article
              class="summary-card summary-card-accent glass-card glass-card--accent glass-summary engine-surface-panel"
              data-engine-surface-key="home-servers-summary-online"
              data-engine-surface-kind="article"
            >
              <span class="summary-label section-kicker">在线节点</span>
              <strong>{{ onlineCount }}</strong>
              <p>最近刷新 {{ lastUpdatedText }}</p>
            </article>
          </div>
        </div>

        <div class="grid">
          <MCcard v-for="(s, idx) in statuses" :key="s.ip ?? idx" :status="s" />
          <div v-if="!statuses.length" class="empty">
            暂无服务器状态，等待后端缓存写入后会在这里展示。
          </div>
        </div>
      </section>
    </div>
  </PageBackdropHost>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import MCcard from '@/components/MCcard.vue'
import PageBackdropHost from '@/components/PageBackdropHost'
import { useFrameMode } from '@/composables/frameMode'
import { useMcStatusStore } from '@/stores/mcStatus'
import { apiFetch } from '@/utils/api'
import { formatRelativeTime, mapMcStatusRow } from '@/utils/mcStatus'

const frameMode = useFrameMode()

const BACKEND_STATUS_REFRESH_MS = 120_000
const FRONTEND_POLL_BUFFER_MS = 5_000
const POLL_INTERVAL_MS = BACKEND_STATUS_REFRESH_MS + FRONTEND_POLL_BUFFER_MS

const mcStatusStore = useMcStatusStore()
const statuses = computed(() => mcStatusStore.statuses)
const onlineCount = computed(
  () => statuses.value.filter(item => item.server_status === 'online').length,
)
const lastUpdatedText = computed(() => {
  const latest = statuses.value
    .map(item => item.last_update)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

  return formatRelativeTime(latest)
})

let pollTimer: ReturnType<typeof window.setInterval> | null = null

async function loadStatuses(force = false) {
  try {
    await mcStatusStore.fetchStatuses(fetchMcStatuses, {
      force,
      maxAgeMs: BACKEND_STATUS_REFRESH_MS,
    })
  } catch {
    mcStatusStore.setStatuses([])
  }
}

async function fetchMcStatuses() {
  const response = await apiFetch('/api/mc-servers/statuses', { method: 'GET' })
  const body = response.body as { data?: unknown } | undefined
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map(mapMcStatusRow)
}

onMounted(() => {
  void loadStatuses()
  pollTimer = window.setInterval(() => {
    void loadStatuses()
  }, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped lang="css">
.page {
  --page-max-width: 1520px;
}

.servers-hero {
  width: min(var(--page-max-width), calc(100% - (var(--page-side-gap) * 2)));
  margin: 0 auto 24px;
  padding: 24px;
}

.hero-head {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 18px;
  margin-bottom: 24px;
}

.hero-copy {
  max-width: 64ch;
}

.title {
  margin: 0 0 10px;
  color: var(--theme-text-strong);
  font-size: clamp(38px, 5vw, 62px);
  line-height: 1;
}

.subtitle,
.summary-card p,
.empty {
  margin: 0;
  color: var(--el-text-color-secondary, rgb(0 0 0 / 68%));
  line-height: 1.72;
}

.summary-card strong {
  display: block;
  margin: 0 0 10px;
  color: var(--theme-text-strong);
}

.hero-download-row {
  margin: 14px 0 0;
}

.hero-download-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  gap: 10px;
  padding: 0 18px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 26%, var(--theme-border-strong));
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 7%)),
    color-mix(in srgb, var(--theme-accent-soft) 38%, var(--theme-card-bg));
  color: var(--theme-text-strong);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 18%),
    0 10px 24px rgb(15 23 42 / 10%);
  backdrop-filter: blur(14px) saturate(130%);
  -webkit-backdrop-filter: blur(14px) saturate(130%);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.hero-download-link:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 34%, var(--theme-border-strong));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 24%), rgb(255 255 255 / 10%)),
    color-mix(in srgb, var(--theme-accent-soft) 52%, var(--theme-card-bg));
  box-shadow: var(--theme-shadow-soft);
}

.hero-download-link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--theme-accent) 48%, white 12%);
  outline-offset: 3px;
}

.hero-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-self: start;
  gap: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 420px));
  align-items: stretch;
  justify-content: center;
  margin: 0 auto;
  gap: 20px;
}

.empty {
  padding: 24px;
  text-align: center;
}

@media (width <= 900px) {
  .hero-head {
    grid-template-columns: 1fr;
  }
}

@media (width <= 640px) {
  .hero-summary {
    grid-template-columns: 1fr;
  }
}

@media (width <= 500px) {
  .servers-hero {
    padding: 20px;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
