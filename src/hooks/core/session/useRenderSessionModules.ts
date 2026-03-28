export type RenderSessionModules = {
  TextureManager: typeof import('@/engine/render/texture/TextureManager').TextureManager
  WebGL2RenderBackend: typeof import('@/engine/render/backend/webgl2/WebGL2RenderBackend').WebGL2RenderBackend
  ChunkArtifactRenderBridge: typeof import('@/engine/render/terrain/runtime/ChunkArtifactRenderBridge').ChunkArtifactRenderBridge
  WebGL2TerrainResidentUploadExecutionBackend: typeof import('@/engine/render/terrain/webgl2/WebGL2TerrainResidentUploadExecutionBackend').WebGL2TerrainResidentUploadExecutionBackend
  TerrainClusterArena: typeof import('@/engine/render/terrain/TerrainClusterArena').TerrainClusterArena
  CharacterRenderBridge: typeof import('@/engine/render/entity/character/CharacterRenderBridge').CharacterRenderBridge
  Player: typeof import('@/engine/world/entity/character/Player').Player
  FirstPersonHand: typeof import('@/engine/world/entity/character/firstPerson/FirstPersonHand').FirstPersonHand
  resolveCharacterSkinById: typeof import('@/engine/world/entity/character/CharacterSkinCatalog').resolveCharacterSkinById
  mainThreadBlockStateBridge: typeof import('@/engine/world/chunk/compute/MainThreadBlockStateBridge').mainThreadBlockStateBridge
  layouts: typeof import('@/engine/render/layout/BuiltinLayouts')
}

let renderSessionModulesPromise: Promise<RenderSessionModules> | null = null

export function loadRenderSessionModules(): Promise<RenderSessionModules> {
  if (!renderSessionModulesPromise) {
    renderSessionModulesPromise = Promise.all([
      import('@/engine/render/texture/TextureManager'),
      import('@/engine/render/backend/webgl2/WebGL2RenderBackend'),
      import('@/engine/render/terrain/runtime/ChunkArtifactRenderBridge'),
      import('@/engine/render/terrain/webgl2/WebGL2TerrainResidentUploadExecutionBackend'),
      import('@/engine/render/terrain/TerrainClusterArena'),
      import('@/engine/render/entity/character/CharacterRenderBridge'),
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
        TextureManager: textureManagerModule.TextureManager,
        WebGL2RenderBackend: renderBackendModule.WebGL2RenderBackend,
        ChunkArtifactRenderBridge: artifactBridgeModule.ChunkArtifactRenderBridge,
        WebGL2TerrainResidentUploadExecutionBackend:
          terrainUploadBackendModule.WebGL2TerrainResidentUploadExecutionBackend,
        TerrainClusterArena: terrainArenaModule.TerrainClusterArena,
        CharacterRenderBridge: entityBridgeModule.CharacterRenderBridge,
        Player: playerModule.Player,
        FirstPersonHand: firstPersonHandModule.FirstPersonHand,
        resolveCharacterSkinById: skinCatalogModule.resolveCharacterSkinById,
        mainThreadBlockStateBridge: blockStateBridgeModule.mainThreadBlockStateBridge,
        layouts: layoutModule,
      }),
    )
  }

  return renderSessionModulesPromise
}
