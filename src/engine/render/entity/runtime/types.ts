import type { RenderObject } from '../../queue/RenderObject'
import type { EntityRenderState } from '@/engine/world/entity/renderState'

export type { EntityRenderState } from '@/engine/world/entity/renderState'

/**
 * 所有实体域共享的渲染状态契约。
 * 由 world 层实体类的 `getRenderState()` 组装，render 层 bridge/batch 消费。
 */
export interface EntityRenderGroup<State, DebugInfo = unknown> {
  getRenderObjects(): readonly RenderObject[]
  sync(states: readonly State[]): void
  getCalibrationDebugInfo(index?: number): DebugInfo | null
  dispose(): void
}
