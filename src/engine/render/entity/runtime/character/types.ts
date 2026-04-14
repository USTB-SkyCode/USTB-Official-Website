import type { EntityRenderGroup } from '../types'
import type { CharacterRenderState } from '@/engine/world/entity/character/renderState'
import type { CharacterModelType } from '@/engine/world/entity/character/modelType'
import type { RenderObject } from '@/engine/render/queue/RenderObject'

export type { CharacterModelType } from '@/engine/world/entity/character/modelType'
export type { CharacterRenderState } from '@/engine/world/entity/character/renderState'

export interface CharacterModelDefinition {
  id: number
  skinId: string
  skinUrl?: string
}

export type CharacterTemplateVariant = 'full-body' | 'right-arm'

export type CharacterBatchMode = 'single' | 'instanced'

export interface CharacterRenderGroupDescriptor {
  groupId: string
  objectId: number
  definition: CharacterModelDefinition
  mode: CharacterBatchMode
  templateVariant?: CharacterTemplateVariant
  modelType?: CharacterModelType
}

export interface CharacterCalibrationDebugInfo {
  skinId: string
  yawDegrees: number
  modelPosition: readonly [number, number, number]
  localBoundsSize: readonly [number, number, number]
  partCount: number
}

export type CharacterRenderGroup = EntityRenderGroup<
  CharacterRenderState,
  CharacterCalibrationDebugInfo
>

export interface CharacterRenderBridgePort {
  upsertGroup(
    descriptor: CharacterRenderGroupDescriptor,
    states: readonly CharacterRenderState[],
  ): Promise<void>
  syncGroup(groupId: string, states: readonly CharacterRenderState[]): void
  removeGroup(groupId: string): void
  getRenderObjects(): readonly RenderObject[]
  getCalibrationDebugInfo(groupId: string, index?: number): CharacterCalibrationDebugInfo | null
  dispose(): void
}
