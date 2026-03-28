import { defineStore } from 'pinia'

const RSS_REFRESH_MS = 120_000

export type FeedItem = {
  id: number
  title: string | null
  description: string | null
  siteUrl: string | null
  sourceUrl: string | null
  entryCount: number
  lastFetchedAt: string | null
}

export type FeedEntry = {
  id: number
  title: string
  link: string
  author: string | null
  summary: string | null
  content: string | null
  publishedAt: string | null
  publishedText: string | null
  feedTitle: string | null
}

type RssSnapshot = {
  feeds: FeedItem[]
  entries: FeedEntry[]
}

export const useRssStore = defineStore('rss', {
  state: () => ({
    feeds: [] as FeedItem[],
    entries: [] as FeedEntry[],
    lastFetchedAt: 0,
    fetchPromise: null as Promise<RssSnapshot> | null,
  }),
  actions: {
    setSnapshot(snapshot: RssSnapshot) {
      this.feeds = snapshot.feeds
      this.entries = snapshot.entries
      this.lastFetchedAt = Date.now()
    },
    clear() {
      this.feeds = []
      this.entries = []
      this.lastFetchedAt = 0
    },
    shouldRefresh(maxAgeMs = RSS_REFRESH_MS) {
      if (!this.feeds.length && !this.entries.length) return true
      return Date.now() - this.lastFetchedAt >= maxAgeMs
    },
    async fetchSnapshot(
      loader: () => Promise<RssSnapshot>,
      options?: { force?: boolean; maxAgeMs?: number },
    ) {
      const force = options?.force ?? false
      const maxAgeMs = options?.maxAgeMs ?? RSS_REFRESH_MS

      if (!force && !this.shouldRefresh(maxAgeMs)) {
        return {
          feeds: this.feeds,
          entries: this.entries,
        }
      }

      if (this.fetchPromise) {
        return this.fetchPromise
      }

      this.fetchPromise = (async () => {
        try {
          const snapshot = await loader()
          this.setSnapshot(snapshot)
          return snapshot
        } finally {
          this.fetchPromise = null
        }
      })()

      return this.fetchPromise
    },
  },
})

export { RSS_REFRESH_MS }
