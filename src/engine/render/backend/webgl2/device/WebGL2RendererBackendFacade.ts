import type { GBuffer } from '@render/backend/webgl2/buffer/GBuffer'
import type { LightManager } from '@render/backend/webgl2/lighting/LightManager'
import type { ShadowPass } from '@render/backend/webgl2/passes/ShadowPass'
import type { Ui3dComponentInstance } from '@render/backend/webgl2/ui3d/Ui3dComponent'
import type { Camera } from '@render/scene/camera/Camera'
import { WebGL2RendererRenderTargets } from '@render/backend/webgl2/resource/WebGL2RendererRenderTargets'
import { WebGL2RendererBackendSystems } from './WebGL2RendererBackendSystems'
import { WebGL2RendererFrameState } from './WebGL2RendererFrameState'
import type { WebGL2RendererStageResources } from './WebGL2RendererStageExecutor'

type BuildStageResourcesParams = {
  camera: Camera
  shadowMapOverride: WebGLTexture | null
  shadowColorOverride: WebGLTexture | null
  backendFrameId: number
}

export class WebGL2RendererBackendFacade {
  private readonly renderTargets: WebGL2RendererRenderTargets
  private readonly backendSystems: WebGL2RendererBackendSystems
  private readonly frameState: WebGL2RendererFrameState
  private readonly isMobile: boolean

  constructor(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    shadowMapResolution: number,
    isMobile: boolean,
  ) {
    this.renderTargets = new WebGL2RendererRenderTargets(gl, width, height, isMobile)
    this.backendSystems = new WebGL2RendererBackendSystems(gl, width, height, shadowMapResolution)
    this.frameState = new WebGL2RendererFrameState(gl)
    this.isMobile = isMobile
  }

  public get gBuffer(): GBuffer {
    return this.renderTargets.gBuffer
  }

  public get lightManager(): LightManager {
    return this.backendSystems.lightManager
  }

  public get shadowPass(): ShadowPass {
    return this.backendSystems.shadowPass
  }

  public get lightingFrameBuffer() {
    return this.renderTargets.lightingFrameBuffer
  }

  public get cameraUBO() {
    return this.frameState.cameraUBO
  }

  public get sceneUBO() {
    return this.frameState.sceneUBO
  }

  public get frameUniforms() {
    return this.frameState.frameUniforms
  }

  public get isWboitSupported() {
    return this.backendSystems.forwardPass.isWBOITSupported
  }

  public setUi3dComponents(components: readonly Ui3dComponentInstance[]) {
    this.backendSystems.setUi3dComponents(components)
  }

  public setUi3dTransparentBackground(enabled: boolean) {
    this.backendSystems.setUi3dTransparentBackground(enabled)
  }

  public resize(width: number, height: number) {
    this.renderTargets.resize(width, height)
    this.backendSystems.resize(width, height)
    this.frameState.invalidateHistory()
  }

  public updateSceneUniforms(
    params: Parameters<WebGL2RendererFrameState['updateSceneUniforms']>[0],
  ) {
    this.frameState.updateSceneUniforms(params)
  }

  public updateCameraUniforms(camera: Camera, width: number, height: number) {
    this.frameState.updateCameraUniforms(camera, width, height)
  }

  public updateFrameUniforms(
    params: Parameters<WebGL2RendererFrameState['updateFrameUniforms']>[0],
  ) {
    this.frameState.updateFrameUniforms(params)
  }

  public advanceFrame(camera: Camera) {
    this.frameState.advanceFrame(camera)
  }

  public buildStageResources(params: BuildStageResourcesParams): WebGL2RendererStageResources {
    return {
      gBuffer: this.renderTargets.gBuffer,
      compositionFrameBuffer: this.renderTargets.compositionFrameBuffer,
      lightingFrameBuffer: this.renderTargets.lightingFrameBuffer,
      postProcessFrameBuffer: this.renderTargets.postProcessFrameBuffer,
      wboitFrameBuffer: this.renderTargets.wboitFrameBuffer,
      compositionTexture: this.renderTargets.compositionTexture,
      postProcessTexture: this.renderTargets.postProcessTexture,
      accumTexture: this.renderTargets.accumTexture,
      revealTexture: this.renderTargets.revealTexture,
      historyTexture: this.renderTargets.historyTexture,
      camera: params.camera,
      cameraUBO: this.frameState.cameraUBO,
      sceneUBO: this.frameState.sceneUBO,
      frameUniforms: this.frameState.frameUniforms,
      lightManager: this.backendSystems.lightManager,
      shadowPass: this.backendSystems.shadowPass,
      pointShadowPass: this.backendSystems.pointShadowPass,
      lightCuller: this.backendSystems.lightCuller,
      depthPrePass: this.backendSystems.depthPrePass,
      geometryPass: this.backendSystems.geometryPass,
      ssaoPass: this.backendSystems.ssaoPass,
      lightingPass: this.backendSystems.lightingPass,
      forwardPass: this.backendSystems.forwardPass,
      selectionOutlinePass: this.backendSystems.selectionOutlinePass,
      postProcessPass: this.backendSystems.postProcessPass,
      screenEffectComposer: this.backendSystems.screenEffectComposer,
      shadowMapOverride: params.shadowMapOverride,
      shadowColorOverride: params.shadowColorOverride,
      isMobile: this.isMobile,
      backendFrameId: params.backendFrameId,
      hasHistory: this.frameState.historyAvailable,
      prevViewProjMatrix: this.frameState.previousViewProjectionMatrix,
    }
  }

  public dispose() {
    this.renderTargets.dispose()
    this.backendSystems.dispose()
    this.frameState.dispose()
  }
}
