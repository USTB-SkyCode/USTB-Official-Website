<template>
  <div style="display: none" />
</template>

<script setup lang="ts">
import { isRef, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'

const props = defineProps<{
  container?: Ref<HTMLElement | null> | HTMLElement | null
}>()

function getEl(): HTMLElement | null {
  const c = props.container as unknown as Ref<HTMLElement | null> | HTMLElement | null | undefined
  if (!c) return null
  if (isRef(c)) {
    return c.value ?? null
  }
  return c
}

let _ro: ResizeObserver | null = null
let _mo: MutationObserver | null = null

function setVars(left: number, width: number, opacity = 1) {
  const el = getEl()
  if (!el) return
  el.style.setProperty('--indicator-left', `${left}px`)
  el.style.setProperty('--indicator-width', `${width}px`)
  el.style.setProperty('--indicator-opacity', String(opacity))
}

function clearVars() {
  const el = getEl()
  if (!el) return
  el.style.setProperty('--indicator-left', '0px')
  el.style.setProperty('--indicator-width', '0px')
  el.style.setProperty('--indicator-opacity', '0')
}

async function syncActive() {
  await nextTick()
  const el = getEl()
  if (!el) return
  const activeBtn = el.querySelector('.nav-btn.active:not(.nav-btn--hidden)') as HTMLElement | null
  if (activeBtn) {
    const rect = activeBtn.getBoundingClientRect()
    const parentRect = el.getBoundingClientRect()
    setVars(rect.left - parentRect.left, rect.width, 1)
  } else {
    clearVars()
  }
}

function moveTo(target: EventTarget | null) {
  const el = getEl()
  if (!el || !target) return
  const btn = (target as HTMLElement).closest
    ? ((target as HTMLElement).closest('.nav-btn') as HTMLElement)
    : null
  if (!btn || btn.classList.contains('nav-btn--hidden')) return
  const rect = btn.getBoundingClientRect()
  const parentRect = el.getBoundingClientRect()
  setVars(rect.left - parentRect.left, rect.width, 1)
}

defineExpose({ syncActive, moveTo, clearVars })

onMounted(() => {
  const el = getEl()
  if (!el) return
  _ro = new ResizeObserver(() => {
    syncActive()
  })
  _ro.observe(el)

  _mo = new MutationObserver(() => {
    syncActive()
  })
  _mo.observe(el, { childList: true, subtree: true, characterData: true })

  syncActive()
})

onBeforeUnmount(() => {
  _ro?.disconnect()
  _mo?.disconnect()
})
</script>
