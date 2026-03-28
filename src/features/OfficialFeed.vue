<template>
  <PageBackdropHost :frame-mode="frameMode">
    <div class="page latest-page app-page">
      <section
        class="updates-shell glass-card engine-surface-panel"
        data-engine-surface-key="home-latest-updates-shell"
        data-engine-surface-kind="section"
      >
        <div class="hero-head">
          <div class="hero-copy">
            <p class="eyebrow section-kicker">Latest Updates</p>
            <h1 class="title">最新动态</h1>
          </div>

          <div class="hero-summary">
            <article
              class="summary-card glass-card glass-summary engine-surface-panel"
              data-engine-surface-key="home-latest-summary-source"
              data-engine-surface-kind="article"
            >
              <span class="summary-label section-kicker">数据源</span>
              <strong>{{ feeds.length || 1 }}</strong>
              <p>{{ heroFeedTitle }}</p>
            </article>

            <article
              class="summary-card summary-card-accent glass-card glass-card--accent glass-summary engine-surface-panel"
              data-engine-surface-key="home-latest-summary-synced"
              data-engine-surface-kind="article"
            >
              <span class="summary-label section-kicker">已同步条目</span>
              <strong>{{ primaryFeed?.entryCount ?? entries.length }}</strong>
              <p>{{ lastFetchedText }}</p>
            </article>
          </div>
        </div>

        <div class="feed-head">
          <div class="section-head">
            <p class="section-kicker">Feed Stream</p>
            <h2>最新文档动态</h2>
            <p>{{ sectionDescription }}</p>
          </div>

          <div class="hero-actions">
            <a
              v-if="primarySiteUrl"
              class="hero-link action-link"
              :href="primarySiteUrl"
              target="_blank"
              rel="noreferrer"
            >
              打开站点
            </a>
            <button
              v-if="userStore.isAdmin"
              class="hero-sync-button"
              type="button"
              :disabled="loadingSync"
              @click="syncFeed"
            >
              {{ loadingSync ? '同步中...' : '立即同步 RSS' }}
            </button>
          </div>
        </div>

        <article
          v-if="loadingInitial"
          class="state-card glass-card engine-surface-panel"
          data-engine-surface-key="home-latest-state-loading"
          data-engine-surface-kind="article"
        >
          <span class="placeholder-tag">加载中</span>
          <h3>正在拉取 RSS 条目</h3>
          <p>从公开接口读取当前后端已同步的数据</p>
        </article>

        <article
          v-else-if="loadError"
          class="state-card state-card-error glass-card engine-surface-panel"
          data-engine-surface-key="home-latest-state-error"
          data-engine-surface-kind="article"
        >
          <span class="placeholder-tag">请求失败</span>
          <h3>动态加载失败</h3>
          <p>{{ loadError }}</p>
          <button class="retry-button" type="button" @click="handleRetry">重新加载</button>
        </article>

        <article
          v-else-if="!entries.length"
          class="state-card glass-card engine-surface-panel"
          data-engine-surface-key="home-latest-state-empty"
          data-engine-surface-kind="article"
        >
          <span class="placeholder-tag">暂无内容</span>
          <h3>当前还没有可展示的动态</h3>
          <p>后端已固定 RSS 来源，等首次同步后这里会自动出现条目。</p>
        </article>

        <div v-else class="feed-list">
          <article
            v-for="entry in entries"
            :key="entry.id"
            class="feed-card glass-card engine-surface-panel"
            :data-engine-surface-key="`home-latest-feed-card-${entry.id}`"
            data-engine-surface-kind="article"
          >
            <div class="feed-card-head">
              <span class="placeholder-tag">{{ entry.feedTitle || 'RSS' }}</span>
              <time class="feed-time">{{ formatEntryTime(entry) }}</time>
            </div>

            <h3 class="feed-title">{{ entry.title }}</h3>

            <div class="feed-body">
              <p class="feed-summary">{{ entry.summary || entry.content || '暂无摘要' }}</p>

              <div v-if="entry.content && entry.content !== entry.summary" class="feed-content">
                {{ entry.content }}
              </div>
            </div>

            <div class="feed-footer">
              <div class="feed-meta-stack">
                <span class="feed-meta">{{ entry.author || '未署名' }}</span>
              </div>
              <a
                class="feed-read-link action-link"
                :href="entry.link"
                target="_blank"
                rel="noreferrer"
                >查看原文</a
              >
            </div>
          </article>
        </div>
      </section>
    </div>
  </PageBackdropHost>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PageBackdropHost from '@/components/PageBackdropHost'
import { useFrameMode } from '@/composables/frameMode'
import { apiFetch } from '@/utils/api'
import { notify } from '@/utils/notify'
import { RSS_REFRESH_MS, useRssStore, type FeedEntry, type FeedItem } from '@/stores/rss'
import { useUserStore } from '@/stores/user'

const frameMode = useFrameMode()
const FRONTEND_POLL_BUFFER_MS = 5_000
const POLL_INTERVAL_MS = RSS_REFRESH_MS + FRONTEND_POLL_BUFFER_MS

type ApiEnvelope<T> = {
  data: T | null
  error: string | null
}

type FeedRecord = {
  id: number
  title: string | null
  description: string | null
  site_url: string | null
  source_url: string | null
  entry_count: number | null
  last_fetched_at: string | null
  created_at: string | null
  updated_at: string | null
}

type FeedListData = {
  items: FeedRecord[]
  total: number
  limit: number
  offset: number
}

type EntryRecord = {
  id: number
  feed_id: number | null
  guid: string | null
  title: string
  link: string
  author: string | null
  summary: string | null
  content: string | null
  published_at: string | null
  published_text: string | null
  feed_title: string | null
  feed_url: string | null
  created_at: string | null
  updated_at: string | null
}

type EntryListData = {
  items: EntryRecord[]
  total: number
  limit: number
  offset: number
}

type SyncResultData = {
  feed: FeedRecord
  entry_count: number
  inserted: number
  updated: number
}

const userStore = useUserStore()
const rssStore = useRssStore()

const loadingInitial = ref(rssStore.shouldRefresh())
const loadingSync = ref(false)
const loadError = ref('')
const entries = computed(() => rssStore.entries)
const feeds = computed(() => rssStore.feeds)

const primaryFeed = computed(() => feeds.value[0] ?? null)
const primarySiteUrl = computed(() => primaryFeed.value?.siteUrl ?? '')
const heroFeedTitle = computed(() => primaryFeed.value?.title || '像素北科 | vDocs 文档库')
const lastFetchedText = computed(() => {
  const value = primaryFeed.value?.lastFetchedAt
  return value ? `最近同步 ${formatDateTime(value)}` : '等待首次同步'
})
const sectionDescription = computed(() => {
  if (loadError.value) return '接口读取失败，稍后可重试。'
  if (!entries.value.length) return '当前数据库还没有 RSS 条目。'
  return `当前展示最新 ${entries.value.length} 条公开动态，按发布时间优先排序。`
})

let pollTimer: ReturnType<typeof window.setInterval> | null = null

function mapFeedRecord(record: FeedRecord): FeedItem {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    siteUrl: record.site_url,
    sourceUrl: record.source_url,
    entryCount: typeof record.entry_count === 'number' ? record.entry_count : 0,
    lastFetchedAt: record.last_fetched_at,
  }
}

function mapEntryRecord(record: EntryRecord): FeedEntry {
  return {
    id: record.id,
    title: record.title,
    link: record.link,
    author: record.author,
    summary: record.summary,
    content: record.content,
    publishedAt: record.published_at,
    publishedText: record.published_text,
    feedTitle: record.feed_title,
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatEntryTime(entry: FeedEntry): string {
  if (entry.publishedAt) return formatDateTime(entry.publishedAt)
  return entry.publishedText || '时间未记录'
}

async function fetchFeeds() {
  const response = await apiFetch<ApiEnvelope<FeedListData>>('/api/rss-feeds?limit=20&offset=0', {
    method: 'GET',
  })

  if (!response.ok || response.body?.error) {
    throw new Error(response.body?.error || 'RSS 源列表读取失败')
  }

  return Array.isArray(response.body?.data?.items)
    ? response.body.data.items.map(mapFeedRecord)
    : []
}

async function fetchEntries() {
  const response = await apiFetch<ApiEnvelope<EntryListData>>(
    '/api/rss-entries?limit=20&offset=0',
    {
      method: 'GET',
    },
  )

  if (!response.ok || response.body?.error) {
    throw new Error(response.body?.error || 'RSS 条目读取失败')
  }

  return Array.isArray(response.body?.data?.items)
    ? response.body.data.items.map(mapEntryRecord)
    : []
}

async function fetchRssSnapshot() {
  const [nextFeeds, nextEntries] = await Promise.all([fetchFeeds(), fetchEntries()])
  return {
    feeds: nextFeeds,
    entries: nextEntries,
  }
}

async function reloadFeed(force = false) {
  loadError.value = ''
  loadingInitial.value = !rssStore.entries.length && !rssStore.feeds.length

  try {
    await rssStore.fetchSnapshot(fetchRssSnapshot, {
      force,
      maxAgeMs: RSS_REFRESH_MS,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RSS 数据加载失败'
    loadError.value = message
    if (!rssStore.entries.length && !rssStore.feeds.length) {
      rssStore.clear()
    }
  } finally {
    loadingInitial.value = false
  }
}

function handleRetry() {
  void reloadFeed(true)
}

async function syncFeed() {
  loadingSync.value = true

  try {
    const response = await apiFetch<ApiEnvelope<SyncResultData>>('/api/rss-feeds/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    if (response.status === 409) {
      notify.warning('已有同步任务在进行中')
      return
    }

    if (!response.ok || response.body?.error) {
      throw new Error(response.body?.error || 'RSS 同步失败')
    }

    const syncData = response.body?.data
    notify.success(
      `同步完成：新增 ${syncData?.inserted ?? 0} 条，更新 ${syncData?.updated ?? 0} 条`,
    )
    await reloadFeed(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RSS 同步失败'
    notify.error(message)
  } finally {
    loadingSync.value = false
  }
}

onMounted(() => {
  void reloadFeed()
  pollTimer = window.setInterval(() => {
    void reloadFeed()
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

.updates-shell {
  width: min(var(--page-max-width), calc(100% - (var(--page-side-gap) * 2)));
  margin: 0 auto 24px;
  padding: 24px;
  padding-top: calc(var(--header-height, 64px) + 24px);
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

.eyebrow,
.placeholder-tag {
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.title {
  margin: 0 0 10px;
  color: var(--theme-text-strong);
  font-size: clamp(38px, 5vw, 62px);
  line-height: 1;
}

.subtitle,
.section-head p,
.summary-card p,
.state-card p {
  margin: 0;
  color: var(--el-text-color-secondary, rgb(0 0 0 / 68%));
  line-height: 1.72;
}

.hero-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-card strong,
.section-head h2,
.state-card h3,
.feed-card h3 {
  display: block;
  margin: 0 0 10px;
  color: var(--theme-text-strong);
}

.feed-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

.placeholder-tag {
  display: inline-flex;
  margin-bottom: 12px;
  padding: 5px 10px;
  border: 1px solid var(--theme-border-strong);
  border-radius: 999px;
  background: var(--theme-accent-soft);
  color: var(--theme-accent);
  font-size: 11px;
  font-weight: 700;
}

.hero-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(152px, 1fr));
  justify-content: flex-end;
  width: min(100%, 360px);
  gap: 12px;
}

.action-link,
.hero-sync-button,
.retry-button,
.feed-read-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease,
    color 180ms ease;
  border: 1px solid var(--theme-border-strong);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 7%)),
    color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 18%),
    0 10px 24px rgb(15 23 42 / 8%);
  color: var(--theme-text-strong);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  cursor: pointer;
}

.hero-link {
  border-color: color-mix(in srgb, var(--theme-border-strong) 88%, transparent);
}

.hero-sync-button {
  border-color: color-mix(in srgb, var(--theme-accent) 26%, transparent);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 7%)),
    color-mix(in srgb, var(--theme-accent-soft) 66%, transparent);
}

.action-link:hover,
.action-link:focus-visible,
.hero-sync-button:hover,
.hero-sync-button:focus-visible,
.retry-button:hover,
.retry-button:focus-visible {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 26%, var(--theme-border-strong));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 24%), rgb(255 255 255 / 10%)),
    color-mix(in srgb, var(--theme-accent-soft) 30%, var(--theme-card-bg));
  box-shadow: var(--theme-shadow-soft);
}

.hero-sync-button:disabled {
  transform: none;
  opacity: 0.7;
  cursor: wait;
}

.state-card {
  padding: 24px;
  background: linear-gradient(180deg, rgb(255 255 255 / 8%), rgb(255 255 255 / 3%));
  box-shadow: var(--theme-shadow-soft);
}

.state-card-error {
  border-color: color-mix(in srgb, #ef4444 24%, var(--theme-border-strong));
}

.state-card h3,
.feed-card h3 {
  margin: 0 0 10px;
  color: var(--theme-text-strong);
}

.state-card p {
  margin: 0;
  color: var(--el-text-color-secondary, rgb(0 0 0 / 68%));
  line-height: 1.72;
}

.retry-button {
  margin-top: 16px;
}

.feed-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 420px));
  align-items: stretch;
  justify-content: center;
  gap: 20px;
}

.feed-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 3%)),
    linear-gradient(135deg, color-mix(in srgb, var(--theme-card-bg) 86%, transparent), transparent);
  box-shadow: var(--theme-shadow-soft);
  gap: 16px;
}

.feed-card:hover,
.feed-card:focus-within {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--theme-accent) 20%, var(--theme-border-strong));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 12%), rgb(255 255 255 / 4%)),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent-soft) 14%, var(--theme-card-bg)),
      transparent
    );
  box-shadow: var(--theme-shadow-hero);
}

.feed-card-head,
.feed-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.feed-card-head {
  align-items: flex-start;
}

.feed-time,
.feed-meta {
  color: var(--el-text-color-secondary, rgb(0 0 0 / 68%));
  font-size: 13px;
}

.feed-time {
  text-align: right;
}

.feed-title {
  margin: 0;
  font-size: clamp(20px, 2.2vw, 24px);
  line-height: 1.25;
}

.feed-body {
  display: grid;
  gap: 12px;
}

.feed-summary,
.feed-content {
  margin: 0;
  color: var(--el-text-color-secondary, rgb(0 0 0 / 68%));
  line-height: 1.72;
}

.feed-summary {
  line-clamp: 4;
  display: -webkit-box;
  overflow: hidden;
  font-size: 14px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.feed-content {
  display: -webkit-box;
  padding: 12px 14px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 72%, transparent);
  border-radius: 16px;
  background: linear-gradient(180deg, rgb(255 255 255 / 8%), rgb(255 255 255 / 3%));
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
}

.feed-footer {
  margin-top: auto;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--theme-border-strong) 66%, transparent);
}

.feed-meta-stack {
  display: grid;
  gap: 3px;
}

.feed-read-link {
  min-height: 34px;
  padding: 0 14px;
  border-color: color-mix(in srgb, var(--theme-accent) 22%, transparent);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 7%)),
    color-mix(in srgb, var(--theme-accent-soft) 22%, transparent);
}

:global(html.dark) .feed-read-link {
  border-color: color-mix(in srgb, var(--theme-accent) 28%, rgb(255 255 255 / 10%));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 4%)),
    color-mix(in srgb, var(--theme-accent-soft) 34%, rgb(13 22 38 / 88%));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 10%),
    0 8px 18px rgb(0 0 0 / 22%);
  color: rgb(239 246 255 / 96%);
}

:global(html.dark) .feed-read-link:hover,
:global(html.dark) .feed-read-link:focus-visible {
  border-color: color-mix(in srgb, var(--theme-accent) 44%, rgb(255 255 255 / 12%));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 14%), rgb(255 255 255 / 6%)),
    color-mix(in srgb, var(--theme-accent-soft) 46%, rgb(14 24 42 / 92%));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 12%),
    0 10px 22px rgb(17 24 39 / 28%);
  color: white;
}

.section-head {
  max-width: 60ch;
  margin-bottom: 18px;
}

.section-head h2 {
  font-size: clamp(24px, 3.6vw, 34px);
}

@media (width <= 900px) {
  .hero-head,
  .feed-head,
  .feed-list {
    grid-template-columns: 1fr;
  }

  .feed-head {
    align-items: flex-start;
  }

  .hero-actions {
    justify-content: flex-start;
    width: 100%;
  }
}

@media (width <= 640px) {
  .hero-summary {
    grid-template-columns: 1fr;
  }
}

@media (width <= 500px) {
  .updates-shell {
    padding: 20px;
    padding-top: calc(var(--header-height, 64px) + 18px);
  }
}
</style>
