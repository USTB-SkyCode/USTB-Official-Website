import type { PlayerPerspectiveMode } from '@/engine/world/game/PlayerRig'
import type {
  PlayerMotionBehaviorConfig,
  PlayerMotionBounds,
} from '@/engine/world/control/PlayerMotionController'
import { getEnvConfig } from '@/config/env'
import type { TabKey } from '@/constants/tabs'
import { shallowRef } from 'vue'

export type SceneRuntimeProfileKind = 'shared-open-world'
export type SceneRuntimeProfileKey = 'campus-open-world'

export type EngineCameraPresetPose = {
  position: [number, number, number]
  lookTarget: [number, number, number]
  perspectiveMode?: PlayerPerspectiveMode
  motionBehavior?: PlayerMotionBehaviorConfig
}

export type SceneConfigDefinition = {
  runtimeProfileKey: SceneRuntimeProfileKey
  runtimeKind: SceneRuntimeProfileKind
  mcaBaseUrl: string
}

export type CameraPresetKey = TabKey | 'login' | 'self'

export type SceneCameraPresetOverride = {
  position: [number, number, number]
  lookTarget: [number, number, number]
  perspectiveMode?: PlayerPerspectiveMode
  updatedAt?: string | null
}

export type SceneCameraPresetOverrideMap = Partial<
  Record<CameraPresetKey, SceneCameraPresetOverride>
>

export type SceneCameraPresetOption = {
  key: CameraPresetKey
  label: string
  description: string
}

type SceneRuntimeProfileDefinition = {
  kind: SceneRuntimeProfileKind
  mcaBaseUrl: string
}

type SceneDefinition = {
  runtimeProfileKey: SceneRuntimeProfileKey
}

// ----------------------------------------------------------------------------
// Utilities for concise camera poses based on spawn position
// ----------------------------------------------------------------------------
function offsetPose(
  basePosition: [number, number, number],
  baseLookTarget: [number, number, number],
  offset: {
    position?: [number, number, number]
    lookTarget?: [number, number, number]
    perspectiveMode?: PlayerPerspectiveMode
  },
): EngineCameraPresetPose {
  return {
    position: [
      basePosition[0] + (offset.position?.[0] ?? 0),
      basePosition[1] + (offset.position?.[1] ?? 0),
      basePosition[2] + (offset.position?.[2] ?? 0),
    ],
    lookTarget: [
      baseLookTarget[0] + (offset.lookTarget?.[0] ?? 0),
      baseLookTarget[1] + (offset.lookTarget?.[1] ?? 0),
      baseLookTarget[2] + (offset.lookTarget?.[2] ?? 0),
    ],
    perspectiveMode: offset.perspectiveMode,
    motionBehavior: undefined,
  }
}

// Explicit baseline spawn configuration per logical domain
const CAMPUS_BASE_POSITION: [number, number, number] = [287, -32, 833]
const CAMPUS_BASE_TARGET: [number, number, number] = [288, -32, 833]

// ----------------------------------------------------------------------------
// Central Scene Definitions
// ----------------------------------------------------------------------------
export const DEBUG_RENDER_SCENE_KEY = 'debug-renderer' as const

const SCENE_RUNTIME_PROFILES: Record<SceneRuntimeProfileKey, SceneRuntimeProfileDefinition> = {
  'campus-open-world': {
    kind: 'shared-open-world',
    get mcaBaseUrl() {
      return getEnvConfig().mcaBaseUrl
    },
  },
}

const SCENE_DEFINITIONS: Record<string, SceneDefinition> = {
  'campus-home': {
    runtimeProfileKey: 'campus-open-world',
  },
  'operations-overlook': {
    runtimeProfileKey: 'campus-open-world',
  },
  [DEBUG_RENDER_SCENE_KEY]: {
    runtimeProfileKey: 'campus-open-world',
  },
}

const CAMERA_PRESET_OPTIONS_BY_KEY: Record<CameraPresetKey, SceneCameraPresetOption> = {
  login: {
    key: 'login',
    label: '登录页',
    description: '访客进入站点后的初始第一人称机位。',
  },
  explore: {
    key: 'explore',
    label: '校园游览',
    description: '主页校园游览 tab 的默认机位。',
  },
  schedule: {
    key: 'schedule',
    label: '主要活动',
    description: '主页主要活动 tab 的悬浮观察机位。',
  },
  history: {
    key: 'history',
    label: '往期活动',
    description: '主页往期活动 tab 的悬浮观察机位。',
  },
  latest: {
    key: 'latest',
    label: '最新动态',
    description: '主页最新动态 tab 的悬浮观察机位。',
  },
  servers: {
    key: 'servers',
    label: '服务器列表',
    description: '主页服务器列表 tab 的悬浮观察机位。',
  },
  self: {
    key: 'self',
    label: '个人主页',
    description: '个人主页的第三人称前视机位。',
  },
}

export const CAMERA_PRESET_OPTIONS = Object.values(CAMERA_PRESET_OPTIONS_BY_KEY)

const CAMERA_PRESET_DEFAULTS: Record<CameraPresetKey, EngineCameraPresetPose> = {
  login: {
    position: [309, 199, 808],
    lookTarget: [310, 199, 808],
    perspectiveMode: 'first-person',
    motionBehavior: {
      pitchRangeWhenAboveY: {
        y: 199,
        pitchRange: [-30, 89],
      },
      movementBounds: {
        minX: 308,
        maxX: 348,
        minY: 199,
        minZ: 788,
        maxZ: 828,
      } satisfies PlayerMotionBounds,
    },
  },
  explore: offsetPose(CAMPUS_BASE_POSITION, CAMPUS_BASE_TARGET, {
    perspectiveMode: 'first-person',
  }),
  schedule: offsetPose(CAMPUS_BASE_POSITION, CAMPUS_BASE_TARGET, {
    position: [42, 54, 38],
    lookTarget: [-20, 14, 4],
    perspectiveMode: 'spectator',
  }),
  history: offsetPose(CAMPUS_BASE_POSITION, CAMPUS_BASE_TARGET, {
    position: [-18, 58, 52],
    lookTarget: [-12, 12, -6],
    perspectiveMode: 'spectator',
  }),
  latest: offsetPose(CAMPUS_BASE_POSITION, CAMPUS_BASE_TARGET, {
    position: [12, 62, -34],
    lookTarget: [-18, 16, 8],
    perspectiveMode: 'spectator',
  }),
  servers: offsetPose(CAMPUS_BASE_POSITION, CAMPUS_BASE_TARGET, {
    position: [54, 48, -10],
    lookTarget: [-6, 10, 4],
    perspectiveMode: 'spectator',
  }),
  self: offsetPose(CAMPUS_BASE_POSITION, CAMPUS_BASE_TARGET, {
    position: [10, 44, 30],
    lookTarget: [-18, 10, 0],
    perspectiveMode: 'third-person-front',
  }),
}

function cloneMotionBehavior(
  motionBehavior: PlayerMotionBehaviorConfig | undefined,
): PlayerMotionBehaviorConfig | undefined {
  if (!motionBehavior) {
    return undefined
  }

  return {
    ...motionBehavior,
    pitchRange: motionBehavior.pitchRange
      ? ([...motionBehavior.pitchRange] as [number, number])
      : undefined,
    pitchRangeWhenAboveY: motionBehavior.pitchRangeWhenAboveY
      ? {
          y: motionBehavior.pitchRangeWhenAboveY.y,
          pitchRange: [...motionBehavior.pitchRangeWhenAboveY.pitchRange] as [number, number],
        }
      : undefined,
    movementBounds:
      motionBehavior.movementBounds === null
        ? null
        : motionBehavior.movementBounds
          ? { ...motionBehavior.movementBounds }
          : undefined,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizePerspectiveMode(value: unknown): PlayerPerspectiveMode | undefined {
  if (
    value === 'first-person' ||
    value === 'spectator' ||
    value === 'third-person-back' ||
    value === 'third-person-front'
  ) {
    return value
  }

  return undefined
}

function normalizeVector3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null
  }

  const [x, y, z] = value
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null
  }

  return [x, y, z]
}

function normalizeSceneCameraPresetOverride(value: unknown): SceneCameraPresetOverride | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const position = normalizeVector3(candidate.position)
  const lookTarget = normalizeVector3(candidate.lookTarget)
  if (!position || !lookTarget) {
    return null
  }

  return {
    position,
    lookTarget,
    perspectiveMode: normalizePerspectiveMode(candidate.perspectiveMode),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
  }
}

export function isCameraPresetKey(value: string): value is CameraPresetKey {
  return value in CAMERA_PRESET_DEFAULTS
}

const cameraPresetOverridesState = shallowRef<SceneCameraPresetOverrideMap>({})

export function replaceSceneCameraPresetOverrides(nextOverrides: unknown) {
  const normalized: SceneCameraPresetOverrideMap = {}
  if (nextOverrides && typeof nextOverrides === 'object') {
    for (const [rawKey, rawValue] of Object.entries(nextOverrides as Record<string, unknown>)) {
      if (!isCameraPresetKey(rawKey)) {
        continue
      }

      const override = normalizeSceneCameraPresetOverride(rawValue)
      if (!override) {
        continue
      }

      normalized[rawKey] = override
    }
  }

  cameraPresetOverridesState.value = normalized
}

export function applySceneCameraPresetOverride(
  presetKey: CameraPresetKey,
  override: SceneCameraPresetOverride,
) {
  const normalized = normalizeSceneCameraPresetOverride(override)
  if (!normalized) {
    return
  }

  cameraPresetOverridesState.value = {
    ...cameraPresetOverridesState.value,
    [presetKey]: normalized,
  }
}

export function clearSceneCameraPresetOverride(presetKey: CameraPresetKey) {
  const nextOverrides = { ...cameraPresetOverridesState.value }
  delete nextOverrides[presetKey]
  cameraPresetOverridesState.value = nextOverrides
}

export function getSceneCameraPresetOverride(presetKey: CameraPresetKey) {
  return cameraPresetOverridesState.value[presetKey] ?? null
}

function offsetMotionBehaviorByPosition(
  motionBehavior: PlayerMotionBehaviorConfig | undefined,
  defaultPosition: [number, number, number],
  nextPosition: [number, number, number],
): PlayerMotionBehaviorConfig | undefined {
  const cloned = cloneMotionBehavior(motionBehavior)
  if (!cloned) {
    return undefined
  }

  const deltaX = nextPosition[0] - defaultPosition[0]
  const deltaY = nextPosition[1] - defaultPosition[1]
  const deltaZ = nextPosition[2] - defaultPosition[2]

  if (cloned.movementBounds) {
    cloned.movementBounds = {
      ...cloned.movementBounds,
      minX: cloned.movementBounds.minX + deltaX,
      maxX: cloned.movementBounds.maxX + deltaX,
      minY:
        typeof cloned.movementBounds.minY === 'number'
          ? cloned.movementBounds.minY + deltaY
          : undefined,
      maxY:
        typeof cloned.movementBounds.maxY === 'number'
          ? cloned.movementBounds.maxY + deltaY
          : undefined,
      minZ: cloned.movementBounds.minZ + deltaZ,
      maxZ: cloned.movementBounds.maxZ + deltaZ,
    }
  }

  if (cloned.pitchRangeWhenAboveY) {
    cloned.pitchRangeWhenAboveY = {
      y: cloned.pitchRangeWhenAboveY.y + deltaY,
      pitchRange: [...cloned.pitchRangeWhenAboveY.pitchRange] as [number, number],
    }
  }

  return cloned
}

function mergeSceneCameraPresetPose(
  presetKey: CameraPresetKey,
  preset: EngineCameraPresetPose,
): EngineCameraPresetPose {
  const override = getSceneCameraPresetOverride(presetKey)
  const merged = clonePresetPose(preset)
  if (!override) {
    return merged
  }

  merged.position = [...override.position] as [number, number, number]
  merged.lookTarget = [...override.lookTarget] as [number, number, number]
  if (override.perspectiveMode) {
    merged.perspectiveMode = override.perspectiveMode
  }

  const perspectiveChanged = Boolean(
    override.perspectiveMode && override.perspectiveMode !== preset.perspectiveMode,
  )
  merged.motionBehavior = perspectiveChanged
    ? undefined
    : offsetMotionBehaviorByPosition(preset.motionBehavior, preset.position, merged.position)

  return merged
}

replaceSceneCameraPresetOverrides(getEnvConfig().sceneCameraPresetOverrides)

// ----------------------------------------------------------------------------
// Resolvers
// ----------------------------------------------------------------------------

function resolveSceneDefinition(sceneKey: string | null | undefined): SceneDefinition {
  if (!sceneKey) {
    throw new Error('Scene setup requires an explicit scene key')
  }

  const definition = SCENE_DEFINITIONS[sceneKey]
  if (!definition) {
    throw new Error(`Scene '${sceneKey}' is not configured`)
  }

  return definition
}

function resolveSceneRuntimeProfile(
  runtimeProfileKey: SceneRuntimeProfileKey,
): SceneRuntimeProfileDefinition {
  const runtimeProfile = SCENE_RUNTIME_PROFILES[runtimeProfileKey]
  if (!runtimeProfile) {
    throw new Error(`Scene runtime profile '${runtimeProfileKey}' is not configured`)
  }

  return runtimeProfile
}

export function resolveSceneConfig(sceneKey: string | null | undefined): SceneConfigDefinition {
  const definition = resolveSceneDefinition(sceneKey)
  const runtimeProfile = resolveSceneRuntimeProfile(definition.runtimeProfileKey)

  return {
    runtimeProfileKey: definition.runtimeProfileKey,
    runtimeKind: runtimeProfile.kind,
    mcaBaseUrl: runtimeProfile.mcaBaseUrl,
  }
}

function clonePresetPose(preset: EngineCameraPresetPose) {
  return {
    position: [...preset.position] as [number, number, number],
    lookTarget: [...preset.lookTarget] as [number, number, number],
    perspectiveMode: preset.perspectiveMode,
    motionBehavior: cloneMotionBehavior(preset.motionBehavior),
  }
}

export function resolveDefaultSceneCameraPreset(
  presetKey: string | null | undefined,
): EngineCameraPresetPose | null {
  if (!presetKey) {
    return null
  }

  const preset = CAMERA_PRESET_DEFAULTS[presetKey as CameraPresetKey]
  if (!preset) {
    return null
  }

  return clonePresetPose(preset)
}

export function resolveSceneCameraPreset(
  presetKey: string | null | undefined,
): EngineCameraPresetPose | null {
  const preset = resolveDefaultSceneCameraPreset(presetKey)
  if (!preset || !presetKey || !isCameraPresetKey(presetKey)) {
    return null
  }

  return mergeSceneCameraPresetPose(presetKey, preset)
}
