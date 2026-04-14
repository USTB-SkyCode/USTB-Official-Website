import { GAME_CONFIG } from '@/engine/config'
import { FrameUniforms } from '@render/backend/webgl2/buffer/FrameUniforms'
import { UniformBuffer } from '@render/backend/webgl2/buffer/UniformBuffer'
import type { Camera } from '@render/scene/camera/Camera'
import { mat4 } from '@render/utils/math'

function halton(index: number, base: number) {
  let result = 0
  let factor = 1 / base
  let current = index
  while (current > 0) {
    result += factor * (current % base)
    current = Math.floor(current / base)
    factor /= base
  }
  return result
}

type SceneUniformParams = {
  sunDirection: Float32Array
  sunColor: Float32Array
  ambientSkyColor: Float32Array
  ambientGroundColor: Float32Array
  ambientIntensity: number
  iblIntensity: number
  lightSpaceMatrices: Float32Array[]
  cascadeSplits: Float32Array
}

type FrameUniformParams = {
  camera: Camera
  width: number
  height: number
  fogStart: number
  fogEnd: number
  fogColor: Float32Array
  usePBR: boolean
  useShadows: boolean
  usePointLights: boolean
  useVertexLighting: boolean
  shadowBiasScale: number
  depthFilterMode: number
  useLinearDepth: boolean
  pointShadowBias: number
  cloudCover: number
  useWboit: boolean
}

export class WebGL2RendererFrameState {
  public readonly cameraUBO: UniformBuffer
  public readonly sceneUBO: UniformBuffer
  public readonly frameUniforms: FrameUniforms

  private frameIndex = 0
  private readonly prevViewProjMatrix = new Float32Array(16)
  private readonly jitteredVP = new Float32Array(16)
  private readonly jitteredInverseVP = new Float32Array(16)
  private hasHistory = false

  constructor(gl: WebGL2RenderingContext) {
    this.cameraUBO = new UniformBuffer(gl, 272, 0)
    this.sceneUBO = new UniformBuffer(gl, 352, 1)
    this.frameUniforms = new FrameUniforms(gl)
  }

  public get previousViewProjectionMatrix(): Float32Array {
    return this.prevViewProjMatrix
  }

  public get historyAvailable(): boolean {
    return this.hasHistory
  }

  public invalidateHistory() {
    this.hasHistory = false
  }

  public updateSceneUniforms(params: SceneUniformParams) {
    this.sceneUBO.writeVec4(0, [
      params.sunDirection[0],
      params.sunDirection[1],
      params.sunDirection[2],
      0,
    ])
    this.sceneUBO.writeVec4(16, [params.sunColor[0], params.sunColor[1], params.sunColor[2], 0])
    this.sceneUBO.writeVec4(32, [
      params.ambientSkyColor[0],
      params.ambientSkyColor[1],
      params.ambientSkyColor[2],
      0,
    ])
    this.sceneUBO.writeVec4(48, [
      params.ambientGroundColor[0],
      params.ambientGroundColor[1],
      params.ambientGroundColor[2],
      0,
    ])
    const timeSeconds = performance.now() / 1000.0
    this.sceneUBO.writeVec4(64, [params.ambientIntensity, params.iblIntensity, timeSeconds, 0])

    for (let index = 0; index < Math.min(params.lightSpaceMatrices.length, 4); index += 1) {
      this.sceneUBO.writeMat4(80 + index * 64, params.lightSpaceMatrices[index])
    }
    this.sceneUBO.writeVec4(336, params.cascadeSplits)
    this.sceneUBO.flush()
  }

  public updateCameraUniforms(camera: Camera, width: number, height: number) {
    const taaEnabled = GAME_CONFIG.RENDER.TAA.ENABLED
    if (!taaEnabled) {
      this.jitteredVP.set(camera.viewProjectionMatrix)
      this.jitteredInverseVP.set(camera.inverseViewProjMatrix)

      this.cameraUBO.writeMat4(0, camera.viewMatrix)
      this.cameraUBO.writeMat4(64, camera.projectionMatrix)
      this.cameraUBO.writeMat4(128, camera.viewProjectionMatrix)
      this.cameraUBO.writeMat4(192, camera.inverseViewProjMatrix)
      this.cameraUBO.writeVec4(256, [
        camera.positionArray[0],
        camera.positionArray[1],
        camera.positionArray[2],
        1.0,
      ])
      this.cameraUBO.flush()
      return
    }

    const jitterIndex = this.frameIndex % 16
    const jitterScale = Math.max(1.0, 480.0 / height) * Math.min(1.0, 60.0 / 60.0)
    const baseJitter = 0.5 * jitterScale
    const jitterX = ((halton(jitterIndex + 1, 2) - 0.5) * baseJitter) / width
    const jitterY = ((halton(jitterIndex + 1, 3) - 0.5) * baseJitter) / height

    const jitteredProjection = new Float32Array(camera.projectionMatrix)
    jitteredProjection[8] += jitterX
    jitteredProjection[9] += jitterY

    mat4.multiply(this.jitteredVP as mat4, jitteredProjection as mat4, camera.viewMatrix as mat4)
    mat4.invert(this.jitteredInverseVP as mat4, this.jitteredVP as mat4)

    this.cameraUBO.writeMat4(0, camera.viewMatrix)
    this.cameraUBO.writeMat4(64, jitteredProjection)
    this.cameraUBO.writeMat4(128, camera.viewProjectionMatrix)
    this.cameraUBO.writeMat4(192, this.jitteredInverseVP)
    this.cameraUBO.writeVec4(256, [
      camera.positionArray[0],
      camera.positionArray[1],
      camera.positionArray[2],
      1.0,
    ])
    this.cameraUBO.flush()
  }

  public updateFrameUniforms(params: FrameUniformParams) {
    this.frameUniforms.update({
      fogStart: params.fogStart,
      fogEnd: params.fogEnd,
      fogColor: params.fogColor,
      cameraNear: params.camera.getNear(),
      cameraFar: params.camera.getFar(),
      inverseWidth: params.width > 0 ? 1 / params.width : 0,
      inverseHeight: params.height > 0 ? 1 / params.height : 0,
      useReverseZ: params.camera.getReverseZ(),
      useLinearDepth: params.useLinearDepth,
      depthFilterMode: params.depthFilterMode,
      shadowBiasScale: params.shadowBiasScale,
      usePBR: params.usePBR,
      useShadows: params.useShadows,
      usePointLights: params.usePointLights,
      useVertexLighting: params.useVertexLighting,
      pointShadowBias: params.pointShadowBias,
      useWboit: params.useWboit,
      cloudCover: params.cloudCover,
    })
  }

  public advanceFrame(camera: Camera) {
    const taaEnabled = GAME_CONFIG.RENDER.TAA.ENABLED
    this.hasHistory = taaEnabled
    if (taaEnabled) {
      this.prevViewProjMatrix.set(this.jitteredVP)
      this.frameIndex = (this.frameIndex + 1) % 16
    } else {
      this.prevViewProjMatrix.set(camera.viewProjectionMatrix)
    }
  }

  public dispose() {
    this.cameraUBO.dispose()
    this.sceneUBO.dispose()
    this.frameUniforms.dispose()
  }
}
