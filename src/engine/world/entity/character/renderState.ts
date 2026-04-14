import type { EntityRenderState } from '../renderState'

export interface CharacterRenderState extends EntityRenderState {
  skinId: string
  yawRadians: number
  animation: Float32Array
}
