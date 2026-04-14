import type { LightManager } from '@render/backend/webgl2/lighting/LightManager'
import type { GBuffer } from '@render/backend/webgl2/buffer/GBuffer'
import type { ShadowPass } from '@render/backend/webgl2/passes/ShadowPass'
import type {
  EngineDrawCallPassName,
  EngineDrawCallStatsSnapshot,
  EngineRendererFrameInput,
  EngineUi3dComponent,
} from '@render/EngineRenderer'
import { Camera } from './scene/camera/Camera'
import { WebGL2RendererRenderTargets } from '@render/backend/webgl2/resource/WebGL2RendererRenderTargets'
import { GAME_CONFIG } from '@/engine/config'
import type { EngineRuntimeLightingConfig } from '@/config/runtime'
import { drawCallStats } from '@render/backend/webgl2/debug/DrawCallStats'
import { WebGL2RendererBackendFacade } from '@render/backend/webgl2/device/WebGL2RendererBackendFacade'
import { WebGL2RendererDebugTools } from '@render/backend/webgl2/debug/WebGL2RendererDebugTools'
import {
  type ClusteredLightStageParams,
  type PointShadowStageParams,
  type ShadowStageParams,
  WebGL2RendererStageExecutor,
  type WebGL2RendererStageResources,
} from '@render/backend/webgl2/device/WebGL2RendererStageExecutor'
import type { IRenderBackend, RenderQueue } from './backend/shared/contracts/IRenderBackend'

/**
 * @file Renderer.ts
 * @brief 渲染器主控类
 *
 * 说明：
 *  - 管理完整渲染流水线的初始化、策略选择与阶段调度
 *  - 将 WebGL2 资源、阶段执行与帧状态委托给 backend/webgl2/** 辅助层
 *  - 对外保留共享相机、环境光照与调试入口等稳定表面
 */
export class Renderer {
  private gl: WebGL2RenderingContext
  public readonly kind = 'webgl2' as const
  public canvas: HTMLCanvasElement
  private lightingConfig: EngineRuntimeLightingConfig = {
    enablePointLights: GAME_CONFIG.RENDER.LIGHTING.ENABLE_POINT_LIGHTS,
    enableVertexLighting: GAME_CONFIG.RENDER.LIGHTING.ENABLE_VERTEX_LIGHTING,
    enableSmoothLighting: GAME_CONFIG.RENDER.LIGHTING.ENABLE_SMOOTH_LIGHTING,
  }
  private debugTools: WebGL2RendererDebugTools
  private backendFacade: WebGL2RendererBackendFacade
  private stageExecutor: WebGL2RendererStageExecutor

  // 阴影资源覆写，供移动端或自定义管线使用。
  private shadowMapOverride: WebGLTexture | null = null
  private shadowColorOverride: WebGLTexture | null = null
  private shadowBiasScaleOverride: number | null = null

  // 平台标记，仅用于相机与性能策略。
  public readonly isMobile: boolean
  public readonly shadowMapResolution: number

  // 场景级共享状态。
  public camera: Camera
  public sunDirection: Float32Array = new Float32Array(GAME_CONFIG.RENDER.LIGHTING.SUN_DIRECTION)
  public sunColor: Float32Array = new Float32Array(GAME_CONFIG.RENDER.LIGHTING.SUN_COLOR)
  public lights: Float32Array = new Float32Array(0)

  // 环境光参数。
  public ambientSkyColor: Float32Array = new Float32Array([0.2, 0.3, 0.5])
  public ambientGroundColor: Float32Array = new Float32Array([0.08, 0.07, 0.06])
  public ambientIntensity: number = 0.6
  public iblIntensity: number = 0.3
  private backendFrameId = 1

  /**
   * 随机云层覆盖率, 每次创建 Renderer 时随机生成。
   * 权重: 晴天薄云 0.30, 少云 0.30, 多云 0.30, 阴天 0.10。
   * 数值本身也刻意拉开，避免视觉上塌成只有“厚云/稍薄”两档。
   */
  public cloudCover: number

  public get gBuffer(): GBuffer {
    return this.backendFacade.gBuffer
  }

  public get lightManager(): LightManager {
    return this.backendFacade.lightManager
  }

  public get shadowPass(): ShadowPass {
    return this.backendFacade.shadowPass
  }

  public get cameraUBO() {
    return this.backendFacade.cameraUBO
  }

  public get sceneUBO() {
    return this.backendFacade.sceneUBO
  }

  public get frameUniforms() {
    return this.backendFacade.frameUniforms
  }

  public getLastFrameDrawCallStats(): EngineDrawCallStatsSnapshot {
    return drawCallStats.getLastFrameStats()
  }

  public setUi3dComponents(components: readonly EngineUi3dComponent[]) {
    this.backendFacade.setUi3dComponents(components)
  }

  public setUi3dTransparentBackground(enabled: boolean) {
    this.backendFacade.setUi3dTransparentBackground(enabled)
  }

  private executeTrackedPass(passName: EngineDrawCallPassName, action: () => void) {
    drawCallStats.setCurrentPass(passName)
    try {
      action()
    } finally {
      drawCallStats.clearCurrentPass()
    }
  }

  /**
   * 设置阴影纹理覆盖，用于移动端或自定义阴影管线。
   * 传入 `null` 可恢复默认的 ShadowPass 输出。
   */
  public setShadowOverride(
    shadowMap: WebGLTexture | null,
    shadowColorMap: WebGLTexture | null = null,
  ) {
    this.shadowMapOverride = shadowMap
    this.shadowColorOverride = shadowColorMap
  }

  /**
   * 设置阴影 bias 缩放覆盖，主要用于移动端放大阴影偏移。
   * 传入 `null` 时恢复默认缩放 1.0。
   */
  public setShadowBiasScaleOverride(scale: number | null) {
    this.shadowBiasScaleOverride = scale
  }

  /** 清除阴影覆盖，恢复默认 ShadowPass 输出与 bias 缩放。 */
  public clearShadowOverride() {
    this.shadowMapOverride = null
    this.shadowColorOverride = null
    this.shadowBiasScaleOverride = null
  }

  /**
   * Debug: read one GBuffer color attachment (downsampled to outW/outH).
   */
  public debugReadGBufferRGBA8(attachmentIndex: 0 | 1 | 2, outW: number, outH: number) {
    return this.debugTools.readGBufferRGBA8(this.gBuffer, attachmentIndex, outW, outH)
  }

  /**
   * Debug: read the current lighting output (compositionTexture) from lightingFrameBuffer.
   */
  public debugReadFinalRGBA8(outW: number, outH: number) {
    return this.debugTools.readFinalRGBA8(
      this.backendFacade.lightingFrameBuffer,
      this.canvas.width,
      this.canvas.height,
      outW,
      outH,
    )
  }

  /**
   * 构造渲染器并初始化全部核心渲染资源。
   * @param canvas 目标画布
   * @throws Error 当浏览器不支持 WebGL2 时抛出
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL2 not supported')
    this.gl = gl
    this.debugTools = new WebGL2RendererDebugTools(gl)
    this.stageExecutor = new WebGL2RendererStageExecutor(gl)

    this.ensureExtensions()

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    this.isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)

    // Core setup
    this.shadowMapResolution = GAME_CONFIG.RENDER.SHADOW.MAP_SIZE

    const width = canvas.width
    const height = canvas.height
    this.backendFacade = new WebGL2RendererBackendFacade(
      gl,
      width,
      height,
      this.shadowMapResolution,
      this.isMobile,
    )

    const near = GAME_CONFIG.RENDER.NEAR_PLANE
    const far = GAME_CONFIG.RENDER.FAR_PLANE
    this.camera = new Camera(
      GAME_CONFIG.RENDER.FOV,
      width / height,
      near,
      far,
      GAME_CONFIG.RENDER.REVERSE_Z,
    )
    this.camera.update() // Ensure matrices are initialized

    // 随机云层覆盖率: 晴天薄云 30%, 少云 30%, 多云 30%, 阴天 10%
    // 这里不再等概率抽档，否则厚云会明显过多。
    const cloudRoll = Math.random()
    if (cloudRoll < 0.3) {
      this.cloudCover = 0.08
    } else if (cloudRoll < 0.6) {
      this.cloudCover = 0.2
    } else if (cloudRoll < 0.9) {
      this.cloudCover = 0.42
    } else {
      this.cloudCover = 0.65
    }
  }

  /**
   * 启用渲染管线依赖的 WebGL 扩展。
   */
  private ensureExtensions() {
    this.gl.getExtension('EXT_color_buffer_float')
    this.gl.getExtension('OES_texture_float_linear')
    this.gl.getExtension('OES_draw_buffers_indexed')
  }

  /**
   * 响应窗口尺寸变化，同步更新所有 FBO 与纹理资源。
   * @param width 新宽度
   * @param height 新高度
   */
  resize(width: number, height: number) {
    this.canvas.width = width
    this.canvas.height = height
    this.backendFacade.resize(width, height)
  }

  /**
   * 调试工具：导出当前帧的 G-Buffer 与最终光照结果。
   */
  public captureDebugSnapshots() {
    this.debugTools.captureDebugSnapshots(
      this.gBuffer,
      this.backendFacade.lightingFrameBuffer,
      this.canvas.width,
      this.canvas.height,
    )
  }

  /**
   * 执行完整渲染流水线。
   *
   * 流程概览：
   * 1. Shadow Pass：生成级联阴影贴图
   * 2. Depth Pre-Pass：预写深度
   * 3. Geometry Pass：填充 G-Buffer
   * 4. Lighting Pass：执行延迟光照
   * 5. Forward Pass：渲染半透明与前向内容
   * 6. Post-Process Pass：执行 TAA、Tone Mapping 与屏幕合成
   *
   * @param textureArray 纹理数组 (Texture2DArray)
   * @param normalArray 法线纹理数组
   * @param specularArray 高光/PBR 纹理数组
   * @param lightSpaceMatrices 光空间矩阵数组 (CSM)
   * @param cascadeSplits 级联分割距离数组
   * @param fogStart 雾效起始距离
   * @param fogEnd 雾效结束距离
   * @param fogColor 雾效颜色
   */
  render(frame: EngineRendererFrameInput = {}) {
    const {
      textureArray = null,
      normalArray = null,
      specularArray = null,
      variantLUT = null,
      lightSpaceMatrices = null,
      cascadeSplits = null,
      fogStart = GAME_CONFIG.RENDER.FOG.START,
      fogEnd = GAME_CONFIG.RENDER.FOG.END,
      fogColor = new Float32Array(GAME_CONFIG.RENDER.FOG.COLOR),
      terrainQueues = null,
      renderBackend = null,
      selectionOutline = null,
    } = frame

    drawCallStats.beginFrame()
    const terrainGeometryQueue = terrainQueues?.find(queue => queue.stage === 'geometry') ?? null
    const terrainForwardQueue = terrainQueues?.find(queue => queue.stage === 'forward') ?? null

    if (renderBackend) {
      renderBackend.beginFrame()
    }

    const width = this.canvas.width
    const height = this.canvas.height

    // Read graphics settings
    const useShadows = GAME_CONFIG.RENDER.SHADOW.ENABLED
    const usePBR = GAME_CONFIG.RENDER.LIGHTING.ENABLE_PBR
    const lightingCfg = {
      ...GAME_CONFIG.RENDER.LIGHTING,
      ENABLE_POINT_LIGHTS: this.lightingConfig.enablePointLights,
      ENABLE_VERTEX_LIGHTING: this.lightingConfig.enableVertexLighting,
      ENABLE_SMOOTH_LIGHTING:
        this.lightingConfig.enableVertexLighting && this.lightingConfig.enableSmoothLighting,
    }
    const usePointLights = lightingCfg.ENABLE_POINT_LIGHTS
    const useVertexLighting = lightingCfg.ENABLE_VERTEX_LIGHTING
    const useSSAO = lightingCfg.ENABLE_SSAO
    const useClustered = lightingCfg.ENABLE_CLUSTERED_LIGHTS
    const usePointShadows = lightingCfg.ENABLE_POINT_SHADOWS
    // Prepare lighting matrices
    const finalLightSpaceMatrices =
      lightSpaceMatrices || GAME_CONFIG.RENDER.SHADOW.DEFAULT_LIGHT_MATRICES
    const finalCascadeSplits =
      cascadeSplits || new Float32Array(GAME_CONFIG.RENDER.SHADOW.CASCADE_SPLITS)

    const shadowBiasScale = this.shadowBiasScaleOverride ?? 1.0

    // =========================================================================
    // Update Uniform Buffers (Scene & Camera)
    // =========================================================================
    this.updateSceneUniforms(finalLightSpaceMatrices, finalCascadeSplits)
    this.updateCameraUniforms(width, height)
    this.updateFrameUniforms(
      width,
      height,
      fogStart,
      fogEnd,
      fogColor,
      usePBR,
      useShadows,
      usePointLights,
      useVertexLighting,
      shadowBiasScale,
      this.isMobile ? 1 : 0,
      this.isMobile && !!this.gBuffer.linearDepth,
      lightingCfg.POINT_SHADOW_BIAS,
      this.cloudCover,
    )

    const stageResources: WebGL2RendererStageResources = this.backendFacade.buildStageResources({
      camera: this.camera,
      shadowMapOverride: this.shadowMapOverride,
      shadowColorOverride: this.shadowColorOverride,
      backendFrameId: this.backendFrameId,
    })
    const executeTrackedPass = this.executeTrackedPass.bind(this)

    // =========================================================================
    // PASS 1: Shadow Pass - 生成级联阴影贴图 (CSM)
    // =========================================================================
    if (useShadows && !this.shadowMapOverride) {
      const shadowStageParams: ShadowStageParams = {
        lightSpaceMatrices: finalLightSpaceMatrices,
        textureArray,
        terrainGeometryQueue,
        terrainForwardQueue,
        renderBackend,
      }
      this.executeTrackedPass('shadow', () => {
        this.stageExecutor.renderShadowPass(stageResources, shadowStageParams)
      })
    }

    // =========================================================================
    // PASS 1.5: Depth Pre-Pass (Z-Prepass)
    // =========================================================================
    const useZPrepass = true
    if (useZPrepass) {
      this.executeTrackedPass('depth-prepass', () => {
        this.stageExecutor.renderDepthPrePass(stageResources, {
          textureArray,
          terrainGeometryQueue,
          renderBackend,
        })
      })
    }

    // =========================================================================
    // PASS 2: Geometry Pass - 执行几何阶段并填充 G-Buffer
    // =========================================================================
    this.executeTrackedPass('geometry', () => {
      this.stageExecutor.renderGeometryPass(stageResources, {
        textureArray,
        normalArray,
        specularArray,
        variantLUT,
        useZPrepass,
        terrainGeometryQueue,
        renderBackend,
      })
    })

    // =========================================================================
    // PASS 2.5: SSAO Pass
    // =========================================================================
    if (useSSAO) {
      this.executeTrackedPass('ssao', () => {
        this.stageExecutor.renderSsao(stageResources)
      })
    }

    const selectedLights = this.lightManager.getSelectedLights()
    const hasPointLights = usePointLights && this.lightManager.numLights > 0

    if (useClustered && hasPointLights) {
      const clusteredLightParams: ClusteredLightStageParams = {
        selectedLights,
        dimX: lightingCfg.CLUSTER_DIM_X,
        dimY: lightingCfg.CLUSTER_DIM_Y,
        dimZ: lightingCfg.CLUSTER_DIM_Z,
        maxLights: lightingCfg.CLUSTER_MAX_LIGHTS,
      }
      this.stageExecutor.buildClusteredLights(stageResources, clusteredLightParams)
    }

    if (usePointShadows && hasPointLights) {
      const pointShadowParams: PointShadowStageParams = {
        textureArray,
        selectedLights,
        terrainGeometryQueue,
        renderBackend,
        pointShadowMapSize: lightingCfg.POINT_SHADOW_MAP_SIZE,
        pointShadowMaxLights: lightingCfg.POINT_SHADOW_MAX_LIGHTS,
      }
      this.executeTrackedPass('point-shadow', () => {
        this.stageExecutor.renderPointShadows(stageResources, pointShadowParams)
      })
    }

    // =========================================================================
    // PASS 3: Lighting Pass - 执行 PBR 延迟光照计算
    // =========================================================================
    this.executeTrackedPass('lighting', () => {
      this.stageExecutor.renderLightingPass(stageResources, {
        usePointLights,
        useSSAO,
        useClustered: useClustered && hasPointLights,
        usePointShadows: usePointShadows && hasPointLights,
      })
    })

    // =========================================================================
    // PASS 4: Forward Pass - 处理 WBOIT 半透明渲染
    // =========================================================================
    this.executeTrackedPass('forward', () => {
      this.stageExecutor.renderForwardPass(
        stageResources,
        {
          terrainForwardQueue,
          renderBackend,
          textureArray,
          normalArray,
          specularArray,
          usePointLights,
        },
        executeTrackedPass,
      )
    })

    if (selectionOutline) {
      this.executeTrackedPass('forward', () => {
        this.stageExecutor.renderSelectionOutline(stageResources, selectionOutline)
      })
    }

    // =========================================================================
    // PASS 5: Post-Process Pass - TAA + Tone Mapping
    // =========================================================================
    this.executeTrackedPass('postprocess', () => {
      this.stageExecutor.renderPostProcessPass(stageResources, width, height, executeTrackedPass)
    })

    // Update frame state
    this.updateFrameState()
    if (renderBackend) {
      renderBackend.endFrame()
      this.backendFrameId += 1
    }
    drawCallStats.endFrame()
  }

  public setLightingConfig(config: EngineRuntimeLightingConfig) {
    this.lightingConfig = {
      enablePointLights: config.enablePointLights,
      enableVertexLighting: config.enableVertexLighting,
      enableSmoothLighting: config.enableVertexLighting && config.enableSmoothLighting,
    }
  }

  /**
   * 更新场景 Uniform Buffer，包括光照、环境光与阴影矩阵。
   */
  private updateSceneUniforms(lightSpaceMatrices: Float32Array[], cascadeSplits: Float32Array) {
    this.backendFacade.updateSceneUniforms({
      sunDirection: this.sunDirection,
      sunColor: this.sunColor,
      ambientSkyColor: this.ambientSkyColor,
      ambientGroundColor: this.ambientGroundColor,
      ambientIntensity: this.ambientIntensity,
      iblIntensity: this.iblIntensity,
      lightSpaceMatrices,
      cascadeSplits,
    })
  }

  /**
   * 更新相机 Uniform Buffer，并在启用 TAA 时写入抖动投影。
   */
  private updateCameraUniforms(width: number, height: number) {
    this.backendFacade.updateCameraUniforms(this.camera, width, height)
  }

  private updateFrameUniforms(
    width: number,
    height: number,
    fogStart: number,
    fogEnd: number,
    fogColor: Float32Array,
    usePBR: boolean,
    useShadows: boolean,
    usePointLights: boolean,
    useVertexLighting: boolean,
    shadowBiasScale: number,
    depthFilterMode: number,
    useLinearDepth: boolean,
    pointShadowBias: number,
    cloudCover: number,
  ) {
    this.backendFacade.updateFrameUniforms({
      camera: this.camera,
      width,
      height,
      fogStart,
      fogEnd,
      fogColor,
      usePBR,
      useShadows,
      usePointLights,
      useVertexLighting,
      shadowBiasScale,
      depthFilterMode,
      useLinearDepth,
      pointShadowBias,
      cloudCover,
      useWboit: this.backendFacade.isWboitSupported,
    })
  }

  /**
   * 更新逐帧状态，主要维护 TAA 历史数据。
   */
  private updateFrameState() {
    this.backendFacade.advanceFrame(this.camera)
  }

  /**
   * 释放全部 GPU 侧资源。
   */
  dispose() {
    this.debugTools.dispose()
    this.backendFacade.dispose()
  }
}
