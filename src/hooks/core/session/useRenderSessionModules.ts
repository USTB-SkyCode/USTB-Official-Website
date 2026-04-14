import type { IRenderBackend } from '@/engine/render/backend/shared/contracts/IRenderBackend'
import type { RenderBackendKind } from '@/engine/render/backend/shared/runtime/RenderBackendCapabilities'
import type { CharacterRenderBridgePort } from '@/engine/render/entity/runtime/character/types'

export type RenderSessionBackendKind = RenderBackendKind

type CharacterRenderBridgeFactory = (
  renderBackend: IRenderBackend | null,
) => CharacterRenderBridgePort

type CommonRenderSessionModules = {
  Player: typeof import('@/engine/world/entity/character/Player').Player
  FirstPersonHand: typeof import('@/engine/world/entity/character/firstPerson/FirstPersonHand').FirstPersonHand
  resolveCharacterSkinById: typeof import('@/engine/world/entity/character/CharacterSkinCatalog').resolveCharacterSkinById
  createCharacterRenderBridge: CharacterRenderBridgeFactory
}

export type WebGL2RenderSessionModules = CommonRenderSessionModules & {
  kind: 'webgl2'
  TextureManager: typeof import('@/engine/render/backend/webgl2/texture/TextureManager').TextureManager
  WebGL2RenderBackend: typeof import('@/engine/render/backend/webgl2/device/WebGL2RenderBackend').WebGL2RenderBackend
  ChunkArtifactRenderBridge: typeof import('@/engine/render/backend/webgl2/terrain/runtime/ChunkArtifactRenderBridge').ChunkArtifactRenderBridge
  WebGL2TerrainResidentUploadExecutionBackend: typeof import('@/engine/render/backend/webgl2/terrain/WebGL2TerrainResidentUploadExecutionBackend').WebGL2TerrainResidentUploadExecutionBackend
  TerrainClusterArena: typeof import('@/engine/render/backend/webgl2/terrain/runtime/TerrainClusterArena').TerrainClusterArena
  mainThreadBlockStateBridge: typeof import('@/engine/world/chunk/compute/MainThreadBlockStateBridge').mainThreadBlockStateBridge
  layouts: typeof import('@/engine/render/layout/BuiltinLayouts')
}

export type WebGPURenderSessionModules = CommonRenderSessionModules & {
  kind: 'webgpu'
}

export type RenderSessionModules = WebGL2RenderSessionModules | WebGPURenderSessionModules

let webgl2RenderSessionModulesPromise: Promise<WebGL2RenderSessionModules> | null = null
let webgpuRenderSessionModulesPromise: Promise<WebGPURenderSessionModules> | null = null

export function loadRenderSessionModules(kind: 'webgl2'): Promise<WebGL2RenderSessionModules>
export function loadRenderSessionModules(kind: 'webgpu'): Promise<WebGPURenderSessionModules>
export function loadRenderSessionModules(
  kind: RenderSessionBackendKind,
): Promise<RenderSessionModules>
export function loadRenderSessionModules(
  kind: RenderSessionBackendKind = 'webgl2',
): Promise<RenderSessionModules> {
  if (kind === 'webgpu') {
    if (!webgpuRenderSessionModulesPromise) {
      webgpuRenderSessionModulesPromise = Promise.all([
        import('@/engine/render/backend/webgpu/entity/WebGPUCharacterRenderBridge'),
        import('@/engine/world/entity/character/Player'),
        import('@/engine/world/entity/character/firstPerson/FirstPersonHand'),
        import('@/engine/world/entity/character/CharacterSkinCatalog'),
      ]).then(([entityBridgeModule, playerModule, firstPersonHandModule, skinCatalogModule]) => ({
        kind: 'webgpu' as const,
        Player: playerModule.Player,
        FirstPersonHand: firstPersonHandModule.FirstPersonHand,
        resolveCharacterSkinById: skinCatalogModule.resolveCharacterSkinById,
        createCharacterRenderBridge: () => new entityBridgeModule.WebGPUCharacterRenderBridge(),
      }))
    }

    return webgpuRenderSessionModulesPromise
  }

  if (!webgl2RenderSessionModulesPromise) {
    webgl2RenderSessionModulesPromise = Promise.all([
      import('@/engine/render/backend/webgl2/texture/TextureManager'),
      import('@/engine/render/backend/webgl2/device/WebGL2RenderBackend'),
      import('@/engine/render/backend/webgl2/terrain/runtime/ChunkArtifactRenderBridge'),
      import('@/engine/render/backend/webgl2/terrain/WebGL2TerrainResidentUploadExecutionBackend'),
      import('@/engine/render/backend/webgl2/terrain/runtime/TerrainClusterArena'),
      import('@/engine/render/backend/webgl2/entity/character/CharacterRenderBridge'),
      import('@/engine/world/entity/character/Player'),
      import('@/engine/world/entity/character/firstPerson/FirstPersonHand'),
      import('@/engine/world/entity/character/CharacterSkinCatalog'),
      import('@/engine/world/chunk/compute/MainThreadBlockStateBridge'),
      import('@/engine/render/layout/BuiltinLayouts'),
    ]).then(
      ([
        textureManagerModule,
        renderBackendModule,
        artifactBridgeModule,
        terrainUploadBackendModule,
        terrainArenaModule,
        entityBridgeModule,
        playerModule,
        firstPersonHandModule,
        skinCatalogModule,
        blockStateBridgeModule,
        layoutModule,
      ]) => ({
        kind: 'webgl2' as const,
        TextureManager: textureManagerModule.TextureManager,
        WebGL2RenderBackend: renderBackendModule.WebGL2RenderBackend,
        ChunkArtifactRenderBridge: artifactBridgeModule.ChunkArtifactRenderBridge,
        WebGL2TerrainResidentUploadExecutionBackend:
          terrainUploadBackendModule.WebGL2TerrainResidentUploadExecutionBackend,
        TerrainClusterArena: terrainArenaModule.TerrainClusterArena,
        Player: playerModule.Player,
        FirstPersonHand: firstPersonHandModule.FirstPersonHand,
        resolveCharacterSkinById: skinCatalogModule.resolveCharacterSkinById,
        createCharacterRenderBridge: renderBackend => {
          if (!(renderBackend instanceof renderBackendModule.WebGL2RenderBackend)) {
            throw new Error('WebGL2 character render bridge requires a WebGL2 render backend')
          }

          return new entityBridgeModule.CharacterRenderBridge(renderBackend)
        },
        mainThreadBlockStateBridge: blockStateBridgeModule.mainThreadBlockStateBridge,
        layouts: layoutModule,
      }),
    )
  }

  return webgl2RenderSessionModulesPromise
}
