<template>
  <div class="avatar-menu-root">
    <button
      ref="trigger"
      class="avatar-button"
      :class="{ open }"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-controls="menuId"
      @click="toggle"
    >
      <img v-if="props.avatarUrl" :src="props.avatarUrl" alt="avatar" class="avatar" />
      <span v-else class="avatar-fallback">{{ avatarFallback }}</span>
    </button>

    <transition name="dropdown" appear>
      <div
        v-show="open"
        :id="menuId"
        ref="menu"
        class="dropdown-panel"
        role="menu"
        @keydown.esc="close"
      >
        <button class="menu-item" role="menuitem" @click="onProfile">个人信息</button>
        <button
          v-for="t in props.tabs"
          :key="t.key"
          class="menu-item"
          :class="{ active: props.active === t.key }"
          role="menuitem"
          @click="onSelect(t.key)"
        >
          {{ t.label }}
        </button>
        <div v-if="props.active !== 'explore'" class="menu-item darkToggle">
          <TraditionalStyleToggle variant="menu" />
        </div>
        <div class="menu-item darkToggle">
          <DarkModeToggle />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DarkModeToggle from '@/components/DarkModeToggle.vue'
import TraditionalStyleToggle from '@/components/TraditionalStyleToggle.vue'

import type { TabKey } from '@/constants/tabs'

const props = defineProps<{
  avatarUrl?: string
  avatarFallback?: string
  tabs: { key: TabKey; label: string }[]
  active: TabKey
}>()

const emit = defineEmits<{
  (e: 'select', key: TabKey): void
  (e: 'profile'): void
}>()

const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const avatarFallback = computed(() => props.avatarFallback || 'U')

const menuId = `avatar-menu-${Math.random().toString(36).slice(2, 9)}`

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function onSelect(k: TabKey) {
  emit('select', k)
  close()
}

function onProfile() {
  emit('profile')
  close()
}

function handleDocumentPointerDown(event: MouseEvent) {
  const menuElement = menu.value
  const triggerElement = trigger.value
  const target = event.target as Node | null

  if (!target) {
    return
  }

  if (menuElement?.contains(target) || triggerElement?.contains(target)) {
    return
  }

  open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})
</script>

<style scoped>
.avatar-menu-root {
  display: inline-block;
  position: relative;
}

.avatar-button {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  transition:
    transform 320ms cubic-bezier(0.22, 0.76, 0.24, 1),
    background 220ms ease,
    box-shadow 220ms ease;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent);
  border-radius: 0;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 14%),
    color-mix(in srgb, var(--theme-card-bg) 80%, transparent)
  );
  box-shadow:
    0 10px 22px rgb(15 23 42 / 14%),
    inset 0 1px 0 rgb(255 255 255 / 18%);
  cursor: pointer;
}

.avatar-button:hover {
  transform: translateY(-1px);
}

.avatar-button:active {
  transform: scale(0.78) rotate(-18deg);
}

.avatar-button.open {
  animation: avatar-button-bounce-spin 980ms cubic-bezier(0.22, 0.76, 0.24, 1);
  animation-fill-mode: both;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-accent-soft) 78%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 84%, transparent)
  );
  box-shadow:
    0 14px 28px rgb(15 23 42 / 20%),
    inset 0 1px 0 rgb(255 255 255 / 24%);
}

.avatar {
  width: 40px;
  height: 40px;
  object-fit: cover;
  transition: transform 220ms ease;
  border-radius: 0;
}

.avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-accent-soft) 72%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 84%, transparent)
  );
  color: var(--theme-text-strong);
  font-size: 15px;
  font-weight: 700;
}

.avatar-button.open .avatar {
  animation: avatar-image-settle 980ms cubic-bezier(0.22, 0.76, 0.24, 1);
  animation-fill-mode: both;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease,
    filter 0.22s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  transform: translateY(-10px) scale(0.96);
  opacity: 0;
  filter: blur(4px);
}

.dropdown-panel {
  display: flex;
  position: absolute;
  z-index: 1300;
  top: calc(100% + 10px);
  right: 0;
  flex-direction: column;
  min-width: min(188px, calc(100vw - 32px));
  max-width: min(212px, calc(100vw - 32px));
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--theme-border-strong);
  border-radius: 18px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-card-bg) 92%, white 8%),
    color-mix(in srgb, var(--theme-card-bg) 88%, transparent)
  );
  box-shadow:
    0 18px 42px rgb(2 6 23 / 22%),
    inset 0 1px 0 rgb(255 255 255 / 24%);
  backdrop-filter: blur(22px) saturate(145%);
  gap: 8px;
}

.dropdown-panel::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-accent) 22%, transparent),
    transparent 74%
  );
  pointer-events: none;
  inset: 0 auto auto 0;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 12px;
  transition:
    transform 180ms ease,
    background 180ms ease,
    color 180ms ease;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.menu-item:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--theme-accent-soft) 62%, transparent);
}

.menu-item.active {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-accent-soft) 82%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 84%, transparent)
  );
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%);
  color: var(--theme-text-strong);
}

.darkToggle {
  display: flex;
  align-items: center;
  justify-content: center;
}

:global(html.dark) .dropdown-panel {
  border-color: color-mix(in srgb, var(--theme-border-strong) 92%, transparent);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02)),
    color-mix(in srgb, var(--theme-card-bg) 96%, rgb(8 14 24 / 86%));
  box-shadow:
    0 18px 42px rgb(2 6 23 / 42%),
    inset 0 1px 0 rgb(255 255 255 / 8%);
}

@keyframes avatar-button-bounce-spin {
  0% {
    transform: scale(1) rotate(0deg);
  }

  16% {
    transform: scale(0.86) rotate(120deg);
  }

  42% {
    transform: scale(1.02) rotate(410deg);
  }

  72% {
    transform: scale(0.98) rotate(700deg);
  }

  100% {
    transform: scale(1) rotate(720deg);
  }
}

@keyframes avatar-image-settle {
  0% {
    transform: scale(1);
  }

  16% {
    transform: scale(0.88);
  }

  42% {
    transform: scale(1.03);
  }

  72% {
    transform: scale(0.98);
  }

  100% {
    transform: scale(1);
  }
}
</style>
