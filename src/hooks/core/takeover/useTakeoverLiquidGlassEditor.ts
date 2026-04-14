import { computed, ref } from 'vue'
import type {
  LiquidGlassControlDefinition,
  LiquidGlassEffectSettings,
} from '@/engine/render/backend/webgl2/ui3d/LiquidGlassEffectSettings'
import {
  createDefaultLiquidGlassEffectSettings,
  LIQUID_GLASS_CONTROL_SECTIONS,
} from '@/engine/render/backend/webgl2/ui3d/LiquidGlassEffectSettings'
import type { LiquidGlassInstanceSettings } from '@/engine/render/backend/webgl2/ui3d/LiquidGlassInstanceSettings'
import {
  createDefaultLiquidGlassInstanceSettings,
  LIQUID_GLASS_INSTANCE_CONTROL_SECTIONS,
} from '@/engine/render/backend/webgl2/ui3d/LiquidGlassInstanceSettings'
import type { TakeoverSurfaceLayer } from '@/constants/takeoverSurface'

export type TakeoverLiquidGlassSelection = {
  routeId: string | null
  sceneKey: string | null
  surfaceKey: string
  kind: string
  layer: TakeoverSurfaceLayer
  borderRadius: number
}

type LayerScope = {
  routeId: string | null
  sceneKey: string | null
  layer: TakeoverSurfaceLayer
}

type InstanceScope = {
  routeId: string | null
  sceneKey: string | null
  surfaceKey: string
  kind: string
  layer: TakeoverSurfaceLayer
  borderRadius: number
}

const activeSelection = ref<TakeoverLiquidGlassSelection | null>(null)
const drawOverrides = ref<Record<string, LiquidGlassEffectSettings>>({})
const instanceOverrides = ref<Record<string, LiquidGlassInstanceSettings>>({})
const revision = ref(0)

const baseDrawSettingsByLayer: Record<TakeoverSurfaceLayer, LiquidGlassEffectSettings> = {
  section: createDefaultLiquidGlassEffectSettings(),
  article: createDefaultLiquidGlassEffectSettings(),
  headerbar: createDefaultLiquidGlassEffectSettings(),
  indicator: createDefaultLiquidGlassEffectSettings(),
}

baseDrawSettingsByLayer.section.highlight.strength = 0.3
baseDrawSettingsByLayer.section.colorOverlay.color = [0.72, 0.88, 1.0]
baseDrawSettingsByLayer.section.colorOverlay.strength = 0.08
baseDrawSettingsByLayer.section.colorGrading.enabled = false

baseDrawSettingsByLayer.article.highlight.strength = 0.34
baseDrawSettingsByLayer.article.colorOverlay.color = [0.72, 0.88, 1.0]
baseDrawSettingsByLayer.article.colorOverlay.strength = 0.09
baseDrawSettingsByLayer.article.colorGrading.enabled = false

baseDrawSettingsByLayer.headerbar.highlight.strength = 0.22
baseDrawSettingsByLayer.headerbar.colorOverlay.color = [0.78, 0.9, 1.0]
baseDrawSettingsByLayer.headerbar.colorOverlay.strength = 0.05
baseDrawSettingsByLayer.headerbar.colorGrading.enabled = false
baseDrawSettingsByLayer.headerbar.blur.radius = 8

baseDrawSettingsByLayer.indicator.highlight.strength = 0.18
baseDrawSettingsByLayer.indicator.colorOverlay.color = [0.88, 0.94, 1.0]
baseDrawSettingsByLayer.indicator.colorOverlay.strength = 0.03
baseDrawSettingsByLayer.indicator.colorGrading.enabled = false
baseDrawSettingsByLayer.indicator.blur.radius = 6

function cloneDrawSettings(settings: LiquidGlassEffectSettings): LiquidGlassEffectSettings {
  return JSON.parse(JSON.stringify(settings)) as LiquidGlassEffectSettings
}

function cloneInstanceSettings(settings: LiquidGlassInstanceSettings): LiquidGlassInstanceSettings {
  return JSON.parse(JSON.stringify(settings)) as LiquidGlassInstanceSettings
}

function getScopePrefix(routeId: string | null, sceneKey: string | null) {
  return sceneKey ?? routeId ?? 'global'
}

function getDrawOverrideKey(scope: LayerScope) {
  return `${getScopePrefix(scope.routeId, scope.sceneKey)}::${scope.layer}`
}

function getInstanceOverrideKey(scope: InstanceScope) {
  return `${getScopePrefix(scope.routeId, scope.sceneKey)}::${scope.surfaceKey}`
}

function getNestedValue(source: unknown, path: readonly string[]) {
  return path.reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

function setNestedValue(target: Record<string, unknown>, path: readonly string[], value: unknown) {
  let cursor = target
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index]] as Record<string, unknown>
  }
  cursor[path[path.length - 1]] = value
}

export function useTakeoverLiquidGlassEditor() {
  const isOpen = computed(() => activeSelection.value !== null)
  const selection = computed(() => activeSelection.value)
  const drawControlSections = LIQUID_GLASS_CONTROL_SECTIONS
  const instanceControlSections = LIQUID_GLASS_INSTANCE_CONTROL_SECTIONS

  function resolveDrawSettings(scope: LayerScope): LiquidGlassEffectSettings {
    return drawOverrides.value[getDrawOverrideKey(scope)] ?? baseDrawSettingsByLayer[scope.layer]
  }

  function resolveInstanceSettings(scope: InstanceScope): LiquidGlassInstanceSettings {
    return (
      instanceOverrides.value[getInstanceOverrideKey(scope)] ??
      createDefaultLiquidGlassInstanceSettings(scope.borderRadius)
    )
  }

  function lockSelection(nextSelection: TakeoverLiquidGlassSelection) {
    activeSelection.value = { ...nextSelection }
    revision.value += 1
  }

  function clearSelection() {
    activeSelection.value = null
    revision.value += 1
  }

  function getSelectedDrawSettings() {
    if (!activeSelection.value) {
      return null
    }

    return resolveDrawSettings(activeSelection.value)
  }

  function getSelectedInstanceSettings() {
    if (!activeSelection.value) {
      return null
    }

    return resolveInstanceSettings(activeSelection.value)
  }

  function setSelectedDrawControlValue(path: readonly string[], value: unknown) {
    if (!activeSelection.value) {
      return
    }

    const key = getDrawOverrideKey(activeSelection.value)
    const nextSettings = cloneDrawSettings(resolveDrawSettings(activeSelection.value))
    setNestedValue(nextSettings as unknown as Record<string, unknown>, path, value)
    drawOverrides.value = {
      ...drawOverrides.value,
      [key]: nextSettings,
    }
    revision.value += 1
  }

  function setSelectedInstanceControlValue(path: readonly string[], value: unknown) {
    if (!activeSelection.value) {
      return
    }

    const key = getInstanceOverrideKey(activeSelection.value)
    const nextSettings = cloneInstanceSettings(resolveInstanceSettings(activeSelection.value))
    setNestedValue(nextSettings as unknown as Record<string, unknown>, path, value)
    instanceOverrides.value = {
      ...instanceOverrides.value,
      [key]: nextSettings,
    }
    revision.value += 1
  }

  function resetSelectedDrawSettings() {
    if (!activeSelection.value) {
      return
    }

    const key = getDrawOverrideKey(activeSelection.value)
    const nextOverrides = { ...drawOverrides.value }
    delete nextOverrides[key]
    drawOverrides.value = nextOverrides
    revision.value += 1
  }

  function resetSelectedInstanceSettings() {
    if (!activeSelection.value) {
      return
    }

    const key = getInstanceOverrideKey(activeSelection.value)
    const nextOverrides = { ...instanceOverrides.value }
    delete nextOverrides[key]
    instanceOverrides.value = nextOverrides
    revision.value += 1
  }

  function formatControlValue(
    source: LiquidGlassEffectSettings | LiquidGlassInstanceSettings | null,
    control: LiquidGlassControlDefinition,
  ) {
    if (!source) {
      return 'n/a'
    }

    const value = getNestedValue(source, control.path)
    if (Array.isArray(value)) {
      return value.map(component => Number(component).toFixed(2)).join(', ')
    }
    if (typeof value === 'boolean') {
      return value ? 'On' : 'Off'
    }
    if (typeof value === 'number') {
      return control.kind === 'int' ? `${Math.round(value)}` : value.toFixed(2)
    }
    return 'n/a'
  }

  function readControlValue(
    source: LiquidGlassEffectSettings | LiquidGlassInstanceSettings | null,
    path: readonly string[],
  ) {
    return source ? getNestedValue(source, path) : undefined
  }

  return {
    isOpen,
    revision,
    selection,
    drawControlSections,
    instanceControlSections,
    resolveDrawSettings,
    resolveInstanceSettings,
    lockSelection,
    clearSelection,
    getSelectedDrawSettings,
    getSelectedInstanceSettings,
    setSelectedDrawControlValue,
    setSelectedInstanceControlValue,
    resetSelectedDrawSettings,
    resetSelectedInstanceSettings,
    formatControlValue,
    readControlValue,
  }
}
