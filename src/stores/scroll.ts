import { defineStore } from 'pinia'

export const useScrollStore = defineStore('scroll', {
  state: () => ({
    positions: {} as Record<string, number>,
  }),
  actions: {
    setScroll(key: string, top: number) {
      this.positions[key] = top
    },
    getScroll(key: string) {
      return (this.positions[key] ?? 0) as number
    },
    resetScroll(key?: string) {
      if (key) {
        this.positions[key] = 0
      } else {
        this.positions = {} as Record<string, number>
      }
    },
  },
})
