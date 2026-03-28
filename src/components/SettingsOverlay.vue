<template>
  <div v-if="visible" class="settings-overlay">
    <div class="settings-modal">
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="close-btn" @click="$emit('close')">脳</button>
      </div>
      <div class="settings-content">
        <div class="setting-group">
          <h3>Resources</h3>
          <ResourceSwitcher />
        </div>
        <!-- Add more settings here in the future -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 全局设置浮层组件，以模态对话框形式展示，包含资源包切换等设置项。 */

import ResourceSwitcher from './ResourceSwitcher.vue'

defineProps<{
  visible: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>

<style scoped>
/* 遮罩层：半透明 + 模糊 */
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

/* 模态主体 */
.settings-modal {
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid #444;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  color: #eee;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

/* 标题栏 */
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #444;
}

.settings-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

/* 关闭按钮 */
.close-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #fff;
}

.settings-content {
  padding: 24px;
}

.setting-group {
  margin-bottom: 24px;
}

.setting-group h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 1.1rem;
  color: #ccc;
  border-bottom: 1px solid #444;
  padding-bottom: 8px;
}
</style>
