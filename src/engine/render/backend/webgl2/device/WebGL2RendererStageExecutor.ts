import { GAME_CONFIG } from '@/engine/config'
import { runtimeDebug } from '@/engine/debug/runtimeDebug'
import type { EngineDrawCallPassName, EngineSelectionOutline } from '@render/EngineRenderer'
import { GL } from '@render/backend/webgl2/utils/gl'
import type { IRenderBackend, RenderQueue } from '@render/backend/shared/contracts/IRenderBackend'
import type { FrameBuffer } from '@render/backend/webgl2/buffer/FrameBuffer'
import type { FrameUniforms } from '@render/backend/webgl2/buffer/FrameUniforms'
import type { GBuffer } from '@render/backend/webgl2/buffer/GBuffer'
import type { UniformBuffer } from '@render/backend/webgl2/buffer/UniformBuffer'
import type { LightCuller } from '@render/backend/webgl2/lighting/LightCuller'
import type { LightManager } from '@render/backend/webgl2/lighting/LightManager'
import type { DepthPrePass } from '@render/backend/webgl2/passes/DepthPrePass'
import type {
  ForwardPass,
  ForwardPassRenderParams,
} from '@render/backend/webgl2/passes/ForwardPass'
import type { GeometryPass } from '@render/backend/webgl2/passes/GeometryPass'
import type {
  LightingPass,
  LightingPassRenderParams,
} from '@render/backend/webgl2/passes/LightingPass'
import type { PointShadowPass } from '@render/backend/webgl2/passes/PointShadowPass'
import type { PostProcessPass } from '@render/backend/webgl2/passes/PostProcessPass'
import type { SSAOPass } from '@render/backend/webgl2/passes/SSAOPass'
import type { SelectionOutlinePass } from '@render/backend/webgl2/passes/SelectionOutlinePass'
import type { ShadowPass } from '@render/backend/webgl2/passes/ShadowPass'
import type { ScreenEffectComposer } from '@render/backend/webgl2/ui3d/ScreenEffectComposer'
import type { Camera } from '@render/scene/camera/Camera'

export type DepthPrePassStageParams = {
  textureArray: WebGLTexture | null
  terrainGeometryQueue: RenderQueue | null
  renderBackend: IRenderBackend | null
}

export type GeometryStageParams = {
  textureArray: WebGLTexture | null
  normalArray: WebGLTexture | null
  specularArray: WebGLTexture | null
  variantLUT: WebGLTexture | null
  useZPrepass: boolean
  terrainGeometryQueue: RenderQueue | null
  renderBackend: IRenderBackend | null
}

export type ShadowStageParams = {
  lightSpaceMatrices: Float32Array[]
  textureArray: WebGLTexture | null
  terrainGeometryQueue: RenderQueue | null
  terrainForwardQueue: RenderQueue | null
  renderBackend: IRenderBackend | null
}

export type LightingStageParams = {
  usePointLights: boolean
  useSSAO: boolean
  useClustered: boolean
  usePointShadows: boolean
}

export type ForwardStageParams = {
  terrainForwardQueue: RenderQueue | null
  renderBackend: IRenderBackend | null
  textureArray: WebGLTexture | null
  normalArray: WebGLTexture | null
  specularArray: WebGLTexture | null
  usePointLights: boolean
}

export type ClusteredLightStageParams = {
  selectedLights: Float32Array
  dimX: number
  dimY: number
  dimZ: number
  maxLights: number
}

export type PointShadowStageParams = {
  textureArray: WebGLTexture | null
  selectedLights: Float32Array
  terrainGeometryQueue: RenderQueue | null
  renderBackend: IRenderBackend | null
  pointShadowMapSize: number
  pointShadowMaxLights: number
}

export type WebGL2RendererStageResources = {
  gBuffer: GBuffer
  compositionFrameBuffer: FrameBuffer
  lightingFrameBuffer: FrameBuffer
  postProcessFrameBuffer: FrameBuffer
  wboitFrameBuffer: FrameBuffer
  compositionTexture: WebGLTexture
  postProcessTexture: WebGLTexture
  accumTexture: WebGLTexture
  revealTexture: WebGLTexture
  historyTexture: WebGLTexture
  camera: Camera
  cameraUBO: UniformBuffer
  sceneUBO: UniformBuffer
  frameUniforms: FrameUniforms
  lightManager: LightManager
  shadowPass: ShadowPass
  pointShadowPass: PointShadowPass
  lightCuller: LightCuller
  depthPrePass: DepthPrePass
  geometryPass: GeometryPass
  ssaoPass: SSAOPass
  lightingPass: LightingPass
  forwardPass: ForwardPass
  selectionOutlinePass: SelectionOutlinePass
  postProcessPass: PostProcessPass
  screenEffectComposer: ScreenEffectComposer
  shadowMapOverride: WebGLTexture | null
  shadowColorOverride: WebGLTexture | null
  isMobile: boolean
  backendFrameId: number
  hasHistory: boolean
  prevViewProjMatrix: Float32Array
}

type ExecuteTrackedPass = (passName: EngineDrawCallPassName, action: () => void) => void

export class WebGL2RendererStageExecutor {
  private readonly gl: WebGL2RenderingContext

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
  }

  public renderShadowPass(resources: WebGL2RendererStageResources, params: ShadowStageParams) {
    resources.shadowPass.render(
      params.lightSpaceMatrices,
      params.textureArray,
      params.terrainGeometryQueue,
      params.terrainForwardQueue,
      params.renderBackend,
      resources.backendFrameId,
    )
  }

  public renderDepthPrePass(
    resources: WebGL2RendererStageResources,
    params: DepthPrePassStageParams,
  ) {
    const { textureArray, terrainGeometryQueue, renderBackend } = params

    resources.gBuffer.frameBuffer.bind()
    this.gl.viewport(0, 0, resources.gBuffer.width, resources.gBuffer.height)
    this.gl.clearDepth(resources.camera.getReverseZ() ? 0.0 : 1.0)
    this.gl.depthMask(true)
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT)

    for (const program of resources.depthPrePass.programs) {
      resources.cameraUBO.bindToProgram(program, 'CameraUniforms')
    }

    resources.depthPrePass.render(
      resources.gBuffer.frameBuffer,
      textureArray,
      resources.camera.getReverseZ(),
      terrainGeometryQueue,
      renderBackend,
      resources.backendFrameId,
    )
  }

  public renderGeometryPass(resources: WebGL2RendererStageResources, params: GeometryStageParams) {
    const {
      textureArray,
      normalArray,
      specularArray,
      variantLUT,
      useZPrepass,
      terrainGeometryQueue,
      renderBackend,
    } = params

    for (const program of resources.geometryPass.programs) {
      resources.cameraUBO.bindToProgram(program, 'CameraUniforms')
    }

    resources.geometryPass.render(
      resources.gBuffer,
      textureArray,
      normalArray,
      specularArray,
      GAME_CONFIG.RENDER.NORMAL_SCALE,
      0.0,
      resources.camera.getFar(),
      runtimeDebug,
      variantLUT,
      resources.camera.getReverseZ(),
      useZPrepass,
      terrainGeometryQueue,
      renderBackend,
      resources.backendFrameId,
    )
  }

  public renderLightingPass(resources: WebGL2RendererStageResources, params: LightingStageParams) {
    const { usePointLights, useSSAO, useClustered, usePointShadows } = params

    resources.cameraUBO.bindToProgram(resources.lightingPass.program, 'CameraUniforms')
    resources.sceneUBO.bindToProgram(resources.lightingPass.program, 'SceneUniforms')
    resources.frameUniforms.bindToProgram(resources.lightingPass.program)

    resources.lightingFrameBuffer.bind()
    this.gl.drawBuffers([this.gl.COLOR_ATTACHMENT0])
    this.validateDepthBuffer(resources.gBuffer, 'LightingPass')
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    const lightingParams: LightingPassRenderParams = {
      gBuffer: resources.gBuffer,
      shadowMap: resources.shadowMapOverride || resources.shadowPass.shadowMap,
      shadowColorMap: resources.shadowColorOverride || resources.shadowPass.shadowColorMap,
      lightManager: resources.lightManager,
      lightCount: usePointLights ? resources.lightManager.numLights : 0,
      cameraNear: resources.camera.getNear(),
      cameraFar: resources.camera.getFar(),
      useLinearDepth: resources.isMobile && !!resources.gBuffer.linearDepth,
      ssaoTexture: useSSAO ? resources.ssaoPass.ssaoTexture : null,
      lightCuller: useClustered ? resources.lightCuller : null,
      pointShadowMap: usePointShadows ? resources.pointShadowPass.shadowMap : null,
      shadowedLightIndices: usePointShadows ? resources.pointShadowPass.shadowedLightIndices : null,
      shadowedLightCount: usePointShadows ? resources.pointShadowPass.shadowedLightCount : 0,
    }

    resources.lightingPass.render(lightingParams)
  }

  public renderSsao(resources: WebGL2RendererStageResources) {
    resources.ssaoPass.render(
      resources.gBuffer.RT1,
      resources.gBuffer.depth,
      resources.camera.projectionMatrix,
      resources.camera.getNear(),
      resources.camera.getFar(),
      resources.camera.inverseProjectionMatrix,
      resources.camera.viewMatrix,
    )
  }

  public buildClusteredLights(
    resources: WebGL2RendererStageResources,
    params: ClusteredLightStageParams,
  ) {
    resources.lightCuller.updateConfig({
      dimX: params.dimX,
      dimY: params.dimY,
      dimZ: params.dimZ,
      maxLights: params.maxLights,
    })
    resources.lightCuller.build(
      params.selectedLights,
      resources.lightManager.numLights,
      resources.camera.viewMatrix,
      resources.camera.projectionMatrix,
      resources.camera.getNear(),
      resources.camera.getFar(),
    )
  }

  public renderPointShadows(
    resources: WebGL2RendererStageResources,
    params: PointShadowStageParams,
  ) {
    resources.pointShadowPass.updateConfig(params.pointShadowMapSize, params.pointShadowMaxLights)
    resources.pointShadowPass.render(
      params.textureArray,
      params.selectedLights,
      resources.lightManager.numLights,
      resources.camera.positionArray,
      params.terrainGeometryQueue,
      params.renderBackend,
      resources.backendFrameId,
    )
  }

  public renderForwardPass(
    resources: WebGL2RendererStageResources,
    params: ForwardStageParams,
    executeTrackedPass: ExecuteTrackedPass,
  ) {
    const {
      terrainForwardQueue,
      renderBackend,
      textureArray,
      normalArray,
      specularArray,
      usePointLights,
    } = params

    resources.cameraUBO.bindToProgram(resources.forwardPass.program, 'CameraUniforms')
    resources.sceneUBO.bindToProgram(resources.forwardPass.program, 'SceneUniforms')
    resources.frameUniforms.bindToProgram(resources.forwardPass.program)

    const forwardParams: ForwardPassRenderParams = {
      textureArray,
      normalArray,
      specularArray,
      shadowMap: resources.shadowMapOverride || resources.shadowPass.shadowMap,
      shadowColorMap: resources.shadowColorOverride || resources.shadowPass.shadowColorMap,
      normalScale: GAME_CONFIG.RENDER.NORMAL_SCALE,
      lightManager: resources.lightManager,
      usePointLights,
      lightCount: usePointLights ? resources.lightManager.numLights : 0,
      useReverseZ: resources.camera.getReverseZ(),
      terrainForwardQueue,
      backend: renderBackend,
      backendFrameId: resources.backendFrameId,
    }

    if (resources.forwardPass.isWBOITSupported) {
      this.validateDepthBuffer(resources.gBuffer, 'ForwardPass (WBOIT)')
      resources.wboitFrameBuffer.bind()
      this.gl.clearBufferfv(this.gl.COLOR, 0, [0.0, 0.0, 0.0, 0.0])
      this.gl.clearBufferfv(this.gl.COLOR, 1, [1.0, 0.0, 0.0, 0.0])
      resources.forwardPass.render(forwardParams)

      resources.compositionFrameBuffer.bind()
      executeTrackedPass('forward-composite', () => {
        resources.forwardPass.composite(resources.accumTexture, resources.revealTexture)
      })
    } else {
      resources.compositionFrameBuffer.bind()
      resources.forwardPass.render(forwardParams)
    }

    this.gl.depthMask(true)
    this.gl.disable(this.gl.BLEND)
  }

  public renderSelectionOutline(
    resources: WebGL2RendererStageResources,
    selectionOutline: EngineSelectionOutline,
  ) {
    resources.compositionFrameBuffer.bind()
    resources.selectionOutlinePass.render(
      resources.cameraUBO,
      selectionOutline,
      resources.camera.getReverseZ(),
    )
  }

  public renderPostProcessPass(
    resources: WebGL2RendererStageResources,
    width: number,
    height: number,
    executeTrackedPass: ExecuteTrackedPass,
  ) {
    const taaEnabled = GAME_CONFIG.RENDER.TAA.ENABLED

    resources.postProcessFrameBuffer.bind()
    this.gl.viewport(0, 0, width, height)
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0)
    resources.postProcessPass.render(
      this.gl,
      resources.compositionTexture,
      taaEnabled && resources.hasHistory ? resources.historyTexture : resources.compositionTexture,
      resources.gBuffer.depth,
      resources.camera.inverseViewProjMatrix,
      taaEnabled ? resources.prevViewProjMatrix : resources.camera.viewProjectionMatrix,
    )

    if (taaEnabled) {
      GL.bindTextureUnit(this.gl, 0, this.gl.TEXTURE_2D, resources.historyTexture)
      this.gl.copyTexSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height)
    }

    executeTrackedPass('ui', () => {
      resources.screenEffectComposer.render(resources.postProcessTexture, performance.now() / 1000)
    })
  }

  private validateDepthBuffer(gBuffer: GBuffer, stage: string) {
    if (!gBuffer.depth) {
      console.error(`[Renderer] Critical: G-Buffer depth texture is missing at ${stage}!`)
      return false
    }
    return true
  }
}
