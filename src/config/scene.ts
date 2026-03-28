import type { PlayerPerspectiveMode } from '@/engine/world/game/PlayerRig'
import type {
  PlayerMotionBehaviorConfig,
  PlayerMotionBounds,
} from '@/engine/world/control/PlayerMotionController'
import { getEnvConfig } from '@/config/env'
import type { TabKey } from '@/constants/tabs'

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

const CAMERA_PRESETS: Record<CameraPresetKey, EngineCameraPresetPose> = {
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
    motionBehavior: preset.motionBehavior ? { ...preset.motionBehavior } : undefined,
  }
}

export function resolveSceneCameraPreset(
  presetKey: string | null | undefined,
): EngineCameraPresetPose | null {
  if (!presetKey) {
    return null
  }

  const preset = CAMERA_PRESETS[presetKey as CameraPresetKey]
  if (!preset) {
    return null
  }

  return clonePresetPose(preset)
}
