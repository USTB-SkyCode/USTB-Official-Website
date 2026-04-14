import { GAME_CONFIG } from '@/engine/config'
import { LightManager } from '@render/backend/webgl2/lighting/LightManager'
import { LightCuller } from '@render/backend/webgl2/lighting/LightCuller'
import { DepthPrePass } from '@render/backend/webgl2/passes/DepthPrePass'
import { ForwardPass } from '@render/backend/webgl2/passes/ForwardPass'
import { GeometryPass } from '@render/backend/webgl2/passes/GeometryPass'
import { LightingPass } from '@render/backend/webgl2/passes/LightingPass'
import { PointShadowPass } from '@render/backend/webgl2/passes/PointShadowPass'
import { PostProcessPass } from '@render/backend/webgl2/passes/PostProcessPass'
import { SSAOPass } from '@render/backend/webgl2/passes/SSAOPass'
import { SelectionOutlinePass } from '@render/backend/webgl2/passes/SelectionOutlinePass'
import { ShadowPass } from '@render/backend/webgl2/passes/ShadowPass'
import { ScreenEffectComposer } from '@render/backend/webgl2/ui3d/ScreenEffectComposer'
import type { Ui3dComponentInstance } from '@render/backend/webgl2/ui3d/Ui3dComponent'

export class WebGL2RendererBackendSystems {
  private readonly gl: WebGL2RenderingContext

  public readonly lightManager: LightManager
  public readonly depthPrePass: DepthPrePass
  public readonly geometryPass: GeometryPass
  public readonly ssaoPass: SSAOPass
  public readonly lightingPass: LightingPass
  public readonly shadowPass: ShadowPass
  public readonly pointShadowPass: PointShadowPass
  public readonly lightCuller: LightCuller
  public readonly forwardPass: ForwardPass
  public readonly selectionOutlinePass: SelectionOutlinePass
  public readonly postProcessPass: PostProcessPass
  public readonly screenEffectComposer: ScreenEffectComposer

  constructor(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    shadowMapResolution: number,
  ) {
    this.gl = gl
    this.lightManager = new LightManager(gl)
    this.depthPrePass = new DepthPrePass(gl)
    this.geometryPass = new GeometryPass(gl)
    this.ssaoPass = new SSAOPass(gl, width, height)
    this.lightingPass = new LightingPass(gl)
    this.shadowPass = new ShadowPass(
      gl,
      shadowMapResolution,
      GAME_CONFIG.RENDER.SHADOW.CASCADE_SPLITS.length,
    )

    const lightingCfg = GAME_CONFIG.RENDER.LIGHTING
    this.pointShadowPass = new PointShadowPass(
      gl,
      lightingCfg.POINT_SHADOW_MAP_SIZE,
      lightingCfg.POINT_SHADOW_MAX_LIGHTS,
    )
    this.lightCuller = new LightCuller(gl, width, height, {
      dimX: lightingCfg.CLUSTER_DIM_X,
      dimY: lightingCfg.CLUSTER_DIM_Y,
      dimZ: lightingCfg.CLUSTER_DIM_Z,
      maxLights: lightingCfg.CLUSTER_MAX_LIGHTS,
    })
    this.forwardPass = new ForwardPass(gl)
    this.selectionOutlinePass = new SelectionOutlinePass(gl)
    this.postProcessPass = new PostProcessPass(gl)
    this.screenEffectComposer = new ScreenEffectComposer(gl, width, height)
  }

  public setUi3dComponents(components: readonly Ui3dComponentInstance[]) {
    this.screenEffectComposer.setUi3dComponents(components)
  }

  public setUi3dTransparentBackground(enabled: boolean) {
    this.screenEffectComposer.setTransparentBackground(enabled)
  }

  public resize(width: number, height: number) {
    this.ssaoPass.resize(width, height)
    this.lightCuller.resize(width, height)
    this.screenEffectComposer.resize(width, height)
  }

  public dispose() {
    this.depthPrePass.dispose()
    this.geometryPass.dispose()
    this.ssaoPass.dispose()
    this.lightingPass.dispose()
    this.shadowPass.dispose()
    this.pointShadowPass.dispose()
    this.lightCuller.dispose()
    this.forwardPass.dispose()
    this.selectionOutlinePass.dispose()
    this.postProcessPass.dispose(this.gl)
    this.screenEffectComposer.dispose()
    this.lightManager.dispose()
  }
}
