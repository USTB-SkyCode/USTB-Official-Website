<template>
  <aside v-if="isOpen && selection" class="takeover-liquid-glass-editor">
    <div class="takeover-liquid-glass-editor__header">
      <div>
        <div class="takeover-liquid-glass-editor__eyebrow">Liquid Glass Target</div>
        <div class="takeover-liquid-glass-editor__title">{{ selection.surfaceKey }}</div>
      </div>
      <button class="takeover-liquid-glass-editor__close" type="button" @click="clearSelection">
        Close
      </button>
    </div>

    <div class="takeover-liquid-glass-editor__meta">
      <span>Layer {{ selection.layer }}</span>
      <span>Kind {{ selection.kind }}</span>
      <span>Scene {{ selection.sceneKey ?? selection.routeId ?? 'global' }}</span>
    </div>

    <div class="takeover-liquid-glass-editor__actions">
      <button type="button" @click="resetSelectedDrawSettings">Reset Draw</button>
      <button type="button" @click="resetSelectedInstanceSettings">Reset Instance</button>
    </div>

    <details class="takeover-liquid-glass-editor__section" open>
      <summary>Draw Parameters</summary>
      <div class="takeover-liquid-glass-editor__grid">
        <div
          v-for="section in drawControlSections"
          :key="`draw:${section.title}`"
          class="takeover-liquid-glass-editor__group"
        >
          <div class="takeover-liquid-glass-editor__group-title">{{ section.title }}</div>
          <div class="takeover-liquid-glass-editor__controls">
            <div
              v-for="control in section.controls"
              :key="`draw:${control.path.join('.')}`"
              class="takeover-liquid-glass-editor__control"
            >
              <template v-if="control.kind === 'boolean'">
                <label class="takeover-liquid-glass-editor__toggle">
                  <span>{{ control.label }}</span>
                  <input
                    :checked="Boolean(readControlValue(getSelectedDrawSettings(), control.path))"
                    type="checkbox"
                    @change="onDrawBooleanInput(control, $event)"
                  />
                </label>
              </template>
              <template v-else-if="control.kind === 'vec3'">
                <div class="takeover-liquid-glass-editor__slider-header">
                  <span>{{ control.label }}</span>
                  <strong>{{ formatControlValue(getSelectedDrawSettings(), control) }}</strong>
                </div>
                <label
                  v-for="(channel, channelIndex) in control.channels"
                  :key="`draw:${control.path.join('.')}#${channel}`"
                  class="takeover-liquid-glass-editor__slider"
                >
                  <span>{{ channel }}</span>
                  <input
                    :max="control.max"
                    :min="control.min"
                    :step="control.step"
                    :value="
                      (
                        readControlValue(getSelectedDrawSettings(), control.path) as [
                          number,
                          number,
                          number,
                        ]
                      )[channelIndex]
                    "
                    type="range"
                    @input="onDrawVec3Input(control, channelIndex, $event)"
                  />
                </label>
              </template>
              <template v-else>
                <div class="takeover-liquid-glass-editor__slider-header">
                  <span>{{ control.label }}</span>
                  <strong>{{ formatControlValue(getSelectedDrawSettings(), control) }}</strong>
                </div>
                <label class="takeover-liquid-glass-editor__slider">
                  <input
                    :max="control.max"
                    :min="control.min"
                    :step="control.step"
                    :value="Number(readControlValue(getSelectedDrawSettings(), control.path))"
                    type="range"
                    @input="onDrawNumberInput(control, $event)"
                  />
                </label>
              </template>
            </div>
          </div>
        </div>
      </div>
    </details>

    <details class="takeover-liquid-glass-editor__section" open>
      <summary>Instance Parameters</summary>
      <div class="takeover-liquid-glass-editor__grid">
        <div
          v-for="section in instanceControlSections"
          :key="`instance:${section.title}`"
          class="takeover-liquid-glass-editor__group"
        >
          <div class="takeover-liquid-glass-editor__group-title">{{ section.title }}</div>
          <div class="takeover-liquid-glass-editor__controls">
            <div
              v-for="control in section.controls"
              :key="`instance:${control.path.join('.')}`"
              class="takeover-liquid-glass-editor__control"
            >
              <template v-if="control.kind === 'boolean'">
                <label class="takeover-liquid-glass-editor__toggle">
                  <span>{{ control.label }}</span>
                  <input
                    :checked="
                      Boolean(readControlValue(getSelectedInstanceSettings(), control.path))
                    "
                    type="checkbox"
                    @change="onInstanceBooleanInput(control, $event)"
                  />
                </label>
              </template>
              <template v-else-if="control.kind === 'vec3'">
                <div class="takeover-liquid-glass-editor__slider-header">
                  <span>{{ control.label }}</span>
                  <strong>{{ formatControlValue(getSelectedInstanceSettings(), control) }}</strong>
                </div>
                <label
                  v-for="(channel, channelIndex) in control.channels"
                  :key="`instance:${control.path.join('.')}#${channel}`"
                  class="takeover-liquid-glass-editor__slider"
                >
                  <span>{{ channel }}</span>
                  <input
                    :max="control.max"
                    :min="control.min"
                    :step="control.step"
                    :value="
                      (
                        readControlValue(getSelectedInstanceSettings(), control.path) as [
                          number,
                          number,
                          number,
                        ]
                      )[channelIndex]
                    "
                    type="range"
                    @input="onInstanceVec3Input(control, channelIndex, $event)"
                  />
                </label>
              </template>
              <template v-else>
                <div class="takeover-liquid-glass-editor__slider-header">
                  <span>{{ control.label }}</span>
                  <strong>{{ formatControlValue(getSelectedInstanceSettings(), control) }}</strong>
                </div>
                <label class="takeover-liquid-glass-editor__slider">
                  <input
                    :max="control.max"
                    :min="control.min"
                    :step="control.step"
                    :value="Number(readControlValue(getSelectedInstanceSettings(), control.path))"
                    type="range"
                    @input="onInstanceNumberInput(control, $event)"
                  />
                </label>
              </template>
            </div>
          </div>
        </div>
      </div>
    </details>
  </aside>
</template>

<script setup lang="ts">
import type { LiquidGlassControlDefinition } from '@/engine/render/ui3d/LiquidGlassEffectSettings'
import { useTakeoverLiquidGlassEditor } from '@/hooks/core/takeover/useTakeoverLiquidGlassEditor'

const {
  isOpen,
  selection,
  drawControlSections,
  instanceControlSections,
  clearSelection,
  getSelectedDrawSettings,
  getSelectedInstanceSettings,
  setSelectedDrawControlValue,
  setSelectedInstanceControlValue,
  resetSelectedDrawSettings,
  resetSelectedInstanceSettings,
  formatControlValue,
  readControlValue,
} = useTakeoverLiquidGlassEditor()

function onDrawBooleanInput(control: LiquidGlassControlDefinition, event: Event) {
  if (control.kind !== 'boolean') {
    return
  }
  setSelectedDrawControlValue(control.path, (event.target as HTMLInputElement).checked)
}

function onDrawNumberInput(control: LiquidGlassControlDefinition, event: Event) {
  if (control.kind !== 'float' && control.kind !== 'int') {
    return
  }
  const rawValue = Number((event.target as HTMLInputElement).value)
  setSelectedDrawControlValue(
    control.path,
    control.kind === 'int' ? Math.round(rawValue) : rawValue,
  )
}

function onDrawVec3Input(
  control: LiquidGlassControlDefinition,
  channelIndex: number,
  event: Event,
) {
  if (control.kind !== 'vec3') {
    return
  }
  const nextValue = [
    ...(readControlValue(getSelectedDrawSettings(), control.path) as [number, number, number]),
  ] as [number, number, number]
  nextValue[channelIndex] = Number((event.target as HTMLInputElement).value)
  setSelectedDrawControlValue(control.path, nextValue)
}

function onInstanceBooleanInput(control: LiquidGlassControlDefinition, event: Event) {
  if (control.kind !== 'boolean') {
    return
  }
  setSelectedInstanceControlValue(control.path, (event.target as HTMLInputElement).checked)
}

function onInstanceNumberInput(control: LiquidGlassControlDefinition, event: Event) {
  if (control.kind !== 'float' && control.kind !== 'int') {
    return
  }
  const rawValue = Number((event.target as HTMLInputElement).value)
  setSelectedInstanceControlValue(
    control.path,
    control.kind === 'int' ? Math.round(rawValue) : rawValue,
  )
}

function onInstanceVec3Input(
  control: LiquidGlassControlDefinition,
  channelIndex: number,
  event: Event,
) {
  if (control.kind !== 'vec3') {
    return
  }
  const nextValue = [
    ...(readControlValue(getSelectedInstanceSettings(), control.path) as [number, number, number]),
  ] as [number, number, number]
  nextValue[channelIndex] = Number((event.target as HTMLInputElement).value)
  setSelectedInstanceControlValue(control.path, nextValue)
}
</script>

<style scoped>
.takeover-liquid-glass-editor {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 2147483646;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 16px;
  border: 1px solid rgba(170, 210, 255, 0.24);
  border-radius: 18px;
  background: rgba(8, 12, 22, 0.88);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(18px);
  color: #eaf4ff;
  font-family: 'IBM Plex Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
}

.takeover-liquid-glass-editor__header,
.takeover-liquid-glass-editor__actions,
.takeover-liquid-glass-editor__slider-header,
.takeover-liquid-glass-editor__toggle,
.takeover-liquid-glass-editor__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.takeover-liquid-glass-editor__eyebrow,
.takeover-liquid-glass-editor__group-title,
.takeover-liquid-glass-editor__section summary {
  color: #9fd0ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.takeover-liquid-glass-editor__title {
  margin-top: 4px;
  font-size: 14px;
  color: #f8fbff;
}

.takeover-liquid-glass-editor__close,
.takeover-liquid-glass-editor__actions button {
  border: 1px solid rgba(170, 210, 255, 0.22);
  border-radius: 999px;
  background: rgba(22, 32, 54, 0.8);
  color: inherit;
  padding: 6px 10px;
  cursor: pointer;
}

.takeover-liquid-glass-editor__meta {
  margin-top: 10px;
  flex-wrap: wrap;
  justify-content: flex-start;
  color: rgba(232, 243, 255, 0.72);
}

.takeover-liquid-glass-editor__actions {
  margin-top: 12px;
  justify-content: flex-start;
}

.takeover-liquid-glass-editor__section {
  margin-top: 14px;
}

.takeover-liquid-glass-editor__grid {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}

.takeover-liquid-glass-editor__group {
  padding: 12px;
  border: 1px solid rgba(170, 210, 255, 0.14);
  border-radius: 14px;
  background: rgba(12, 18, 30, 0.72);
}

.takeover-liquid-glass-editor__controls {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}

.takeover-liquid-glass-editor__slider {
  display: grid;
  gap: 4px;
}

.takeover-liquid-glass-editor__slider input {
  width: 100%;
}
</style>
