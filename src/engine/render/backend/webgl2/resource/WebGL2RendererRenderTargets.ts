import { FrameBuffer } from '@render/backend/webgl2/buffer/FrameBuffer'
import { GBuffer } from '@render/backend/webgl2/buffer/GBuffer'
import { GL } from '@render/backend/webgl2/utils/gl'

export class WebGL2RendererRenderTargets {
  private readonly gl: WebGL2RenderingContext

  public readonly gBuffer: GBuffer
  public readonly compositionFrameBuffer: FrameBuffer
  public readonly lightingFrameBuffer: FrameBuffer
  public readonly compositionTexture: WebGLTexture
  public readonly postProcessFrameBuffer: FrameBuffer
  public readonly postProcessTexture: WebGLTexture
  public readonly wboitFrameBuffer: FrameBuffer
  public readonly accumTexture: WebGLTexture
  public readonly revealTexture: WebGLTexture
  public readonly historyTexture: WebGLTexture

  constructor(gl: WebGL2RenderingContext, width: number, height: number, isMobile: boolean) {
    this.gl = gl
    this.gBuffer = new GBuffer(gl, width, height, isMobile)

    this.compositionFrameBuffer = new FrameBuffer(gl, width, height)
    this.compositionTexture = GL.createTexture(gl, width, height, {
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    })
    this.compositionFrameBuffer.attachTexture(this.compositionTexture, gl.COLOR_ATTACHMENT0)
    this.compositionFrameBuffer.attachTexture(this.gBuffer.depth, gl.DEPTH_ATTACHMENT)
    this.compositionFrameBuffer.setDrawBuffers([gl.COLOR_ATTACHMENT0])
    this.compositionFrameBuffer.checkStatus()
    this.compositionFrameBuffer.unbind()

    this.lightingFrameBuffer = new FrameBuffer(gl, width, height)
    this.lightingFrameBuffer.attachTexture(this.compositionTexture, gl.COLOR_ATTACHMENT0)
    this.lightingFrameBuffer.setDrawBuffers([gl.COLOR_ATTACHMENT0])
    this.lightingFrameBuffer.checkStatus()
    this.lightingFrameBuffer.unbind()

    this.postProcessFrameBuffer = new FrameBuffer(gl, width, height)
    this.postProcessTexture = GL.createTexture(gl, width, height, {
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    })
    this.postProcessFrameBuffer.attachTexture(this.postProcessTexture, gl.COLOR_ATTACHMENT0)
    this.postProcessFrameBuffer.setDrawBuffers([gl.COLOR_ATTACHMENT0])
    this.postProcessFrameBuffer.checkStatus()
    this.postProcessFrameBuffer.unbind()

    this.wboitFrameBuffer = new FrameBuffer(gl, width, height)
    this.accumTexture = GL.createTexture(gl, width, height, {
      internalFormat: gl.RGBA16F,
      format: gl.RGBA,
      type: gl.HALF_FLOAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    })
    this.revealTexture = GL.createTexture(gl, width, height, {
      internalFormat: gl.R8,
      format: gl.RED,
      type: gl.UNSIGNED_BYTE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    })
    this.historyTexture = GL.createTexture(gl, width, height, {
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    })

    this.wboitFrameBuffer.attachTexture(this.accumTexture, gl.COLOR_ATTACHMENT0)
    this.wboitFrameBuffer.attachTexture(this.revealTexture, gl.COLOR_ATTACHMENT1)
    this.wboitFrameBuffer.attachTexture(this.gBuffer.depth, gl.DEPTH_ATTACHMENT)
    this.wboitFrameBuffer.setDrawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
    this.wboitFrameBuffer.checkStatus()
    this.wboitFrameBuffer.unbind()
  }

  public resize(width: number, height: number) {
    this.gBuffer.resize(this.gl, width, height)
    this.compositionFrameBuffer.resize(width, height)
    this.lightingFrameBuffer.resize(width, height)
    this.postProcessFrameBuffer.resize(width, height)
    this.wboitFrameBuffer.resize(width, height)

    GL.resizeTexture(
      this.gl,
      this.compositionTexture,
      width,
      height,
      this.gl.RGBA8,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
    )
    GL.resizeTexture(
      this.gl,
      this.accumTexture,
      width,
      height,
      this.gl.RGBA16F,
      this.gl.RGBA,
      this.gl.HALF_FLOAT,
    )
    GL.resizeTexture(
      this.gl,
      this.revealTexture,
      width,
      height,
      this.gl.R8,
      this.gl.RED,
      this.gl.UNSIGNED_BYTE,
    )
    GL.resizeTexture(
      this.gl,
      this.postProcessTexture,
      width,
      height,
      this.gl.RGBA8,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
    )
    GL.resizeTexture(
      this.gl,
      this.historyTexture,
      width,
      height,
      this.gl.RGBA8,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
    )
  }

  public dispose() {
    this.gBuffer.dispose(this.gl)
    this.compositionFrameBuffer.dispose()
    this.lightingFrameBuffer.dispose()
    this.postProcessFrameBuffer.dispose()
    this.wboitFrameBuffer.dispose()
    this.gl.deleteTexture(this.compositionTexture)
    this.gl.deleteTexture(this.postProcessTexture)
    this.gl.deleteTexture(this.accumTexture)
    this.gl.deleteTexture(this.revealTexture)
    this.gl.deleteTexture(this.historyTexture)
  }
}
