import type {
  CharacterCalibrationDebugInfo,
  CharacterRenderBridgePort,
  CharacterRenderGroupDescriptor,
  CharacterRenderState,
} from '@/engine/render/entity/runtime/character/types'
import type { RenderObject } from '@/engine/render/queue/RenderObject'

const EMPTY_RENDER_OBJECTS: readonly RenderObject[] = []

export class WebGPUCharacterRenderBridge implements CharacterRenderBridgePort {
  public async upsertGroup(
    _descriptor: CharacterRenderGroupDescriptor,
    _states: readonly CharacterRenderState[],
  ) {}

  public syncGroup(_groupId: string, _states: readonly CharacterRenderState[]) {}

  public removeGroup(_groupId: string) {}

  public getRenderObjects(): readonly RenderObject[] {
    return EMPTY_RENDER_OBJECTS
  }

  public getCalibrationDebugInfo(
    _groupId: string,
    _index: number = 0,
  ): CharacterCalibrationDebugInfo | null {
    return null
  }

  public dispose() {}
}
