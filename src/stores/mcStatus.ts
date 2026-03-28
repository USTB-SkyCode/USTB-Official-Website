import { defineStore } from 'pinia'
import type { McStatus } from '@/types/mcstatus'

const BACKEND_STATUS_REFRESH_MS = 120_000

export const useMcStatusStore = defineStore('mcStatus', {
  state: () => ({
    statuses: [] as McStatus[],
    lastFetchedAt: 0,
    fetchPromise: null as Promise<McStatus[]> | null,
  }),
  actions: {
    setStatuses(list: McStatus[]) {
      this.statuses = list
      this.lastFetchedAt = Date.now()
    },
    shouldRefresh(maxAgeMs = BACKEND_STATUS_REFRESH_MS) {
      if (!this.statuses.length) return true
      return Date.now() - this.lastFetchedAt >= maxAgeMs
    },
    async fetchStatuses(
      loader: () => Promise<McStatus[]>,
      options?: { force?: boolean; maxAgeMs?: number },
    ) {
      const force = options?.force ?? false
      const maxAgeMs = options?.maxAgeMs ?? BACKEND_STATUS_REFRESH_MS

      if (!force && !this.shouldRefresh(maxAgeMs)) {
        return this.statuses
      }

      if (this.fetchPromise) {
        return this.fetchPromise
      }

      this.fetchPromise = (async () => {
        try {
          const list = await loader()
          this.setStatuses(list)
          return list
        } finally {
          this.fetchPromise = null
        }
      })()

      return this.fetchPromise
    },
  },
})
