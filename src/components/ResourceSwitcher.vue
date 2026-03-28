<template>
  <div class="resource-switcher">
    <button
      v-for="res in resources"
      :key="res.key"
      :class="['resource-btn', { 'is-active': res.key === activeKey }]"
      type="button"
      @click="set(res.key)"
    >
      {{ res.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @file ResourceSwitcher.vue
 * @brief 资源包切换组�?
 *
 * 说明�? *  - 显示可用资源包列�? *  - 允许用户切换当前激活的资源�? *  - �?ResourceStore 交互
 */

import { computed } from 'vue'
import { useResourceStore } from '@/stores/resource'

const store = useResourceStore()

// 资源列表 (计算属�?
const resources = computed(() => store.resources)

// 当前激活的资源�?Key
const activeKey = computed(() => store.activeKey)

/**
 * 切换资源�? * @param key 资源包唯一标识
 */
const set = (key: string) => {
  store.setResource(key)
}
</script>

<style scoped>
/* 切换器容�?*/
.resource-switcher {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

/* 资源按钮样式 */
.resource-btn {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid #555;
  background: #2a2a2a;
  color: #e5e7eb;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.resource-btn:hover {
  background: #3a3a3a;
  border-color: #777;
}

/* 激活状态样�?*/
.resource-btn.is-active {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
  font-weight: 600;
}
</style>
