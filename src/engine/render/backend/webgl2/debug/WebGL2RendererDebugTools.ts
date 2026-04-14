import { FrameBuffer } from '@render/backend/webgl2/buffer/FrameBuffer'
import { GBuffer } from '@render/backend/webgl2/buffer/GBuffer'

export class WebGL2RendererDebugTools {
  private readonly gl: WebGL2RenderingContext
  private readbackFbo: WebGLFramebuffer | null = null
  private readbackTex: WebGLTexture | null = null
  private readbackWidth = 0
  private readbackHeight = 0

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
  }

  public dispose() {
    if (this.readbackFbo) {
      this.gl.deleteFramebuffer(this.readbackFbo)
      this.readbackFbo = null
    }
    if (this.readbackTex) {
      this.gl.deleteTexture(this.readbackTex)
      this.readbackTex = null
    }
    this.readbackWidth = 0
    this.readbackHeight = 0
  }

  public readGBufferRGBA8(
    gBuffer: GBuffer,
    attachmentIndex: 0 | 1 | 2,
    outW: number,
    outH: number,
  ) {
    const attachment = (this.gl.COLOR_ATTACHMENT0 + attachmentIndex) as number
    return this.blitAndReadRGBA8(
      gBuffer.frameBuffer.fbo,
      gBuffer.width,
      gBuffer.height,
      attachment,
      outW,
      outH,
    )
  }

  public readFinalRGBA8(
    frameBuffer: FrameBuffer,
    sourceWidth: number,
    sourceHeight: number,
    outW: number,
    outH: number,
  ) {
    return this.blitAndReadRGBA8(
      frameBuffer.fbo,
      sourceWidth,
      sourceHeight,
      this.gl.COLOR_ATTACHMENT0,
      outW,
      outH,
    )
  }

  public captureDebugSnapshots(
    gBuffer: GBuffer,
    frameBuffer: FrameBuffer,
    width: number,
    height: number,
  ) {
    const pixels = new Uint8Array(width * height * 4)

    gBuffer.frameBuffer.bind()
    this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0)
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
    this.downloadPng(pixels, width, height, 'debug_frame_rt0_albedo.png')

    this.gl.readBuffer(this.gl.COLOR_ATTACHMENT1)
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
    this.downloadPng(pixels, width, height, 'debug_frame_rt1_normal.png')

    this.gl.readBuffer(this.gl.COLOR_ATTACHMENT2)
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
    this.downloadPng(pixels, width, height, 'debug_frame_rt2_pbr.png')

    frameBuffer.bind()
    this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0)
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
    this.downloadPng(pixels, width, height, 'debug_frame_final.png')

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    console.log('[Renderer] Debug snapshots captured (Check Downloads)')
  }

  private ensureReadbackTarget(width: number, height: number) {
    if (
      this.readbackFbo &&
      this.readbackTex &&
      this.readbackWidth === width &&
      this.readbackHeight === height
    ) {
      return
    }

    if (!this.readbackFbo) {
      this.readbackFbo = this.gl.createFramebuffer()
    }
    if (!this.readbackTex) {
      this.readbackTex = this.gl.createTexture()
    }
    if (!this.readbackFbo || !this.readbackTex) {
      throw new Error('[Renderer] Failed to create debug readback target')
    }

    this.readbackWidth = width
    this.readbackHeight = height

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.readbackTex)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA8,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null,
    )
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.readbackFbo)
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      this.readbackTex,
      0,
    )
    this.gl.drawBuffers([this.gl.COLOR_ATTACHMENT0])
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)
  }

  private blitAndReadRGBA8(
    srcFbo: WebGLFramebuffer,
    srcW: number,
    srcH: number,
    readAttachment: number,
    outW: number,
    outH: number,
  ) {
    this.ensureReadbackTarget(outW, outH)
    if (!this.readbackFbo) {
      throw new Error('[Renderer] Debug readback FBO missing')
    }

    const prevReadFb = this.gl.getParameter(
      this.gl.READ_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null
    const prevDrawFb = this.gl.getParameter(
      this.gl.DRAW_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null
    const prevViewport = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array

    try {
      this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, srcFbo)
      this.gl.readBuffer(readAttachment)

      this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, this.readbackFbo)
      this.gl.drawBuffers([this.gl.COLOR_ATTACHMENT0])
      this.gl.blitFramebuffer(
        0,
        0,
        srcW,
        srcH,
        0,
        0,
        outW,
        outH,
        this.gl.COLOR_BUFFER_BIT,
        this.gl.NEAREST,
      )

      this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, this.readbackFbo)
      this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0)
      const pixels = new Uint8Array(outW * outH * 4)
      this.gl.readPixels(0, 0, outW, outH, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
      return pixels
    } finally {
      this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, prevReadFb)
      this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, prevDrawFb)
      this.gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3])
    }
  }

  private downloadPng(data: Uint8Array, width: number, height: number, filename: string) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    const imageData = ctx.createImageData(width, height)

    const stride = width * 4
    for (let y = 0; y < height; y += 1) {
      const srcRow = (height - 1 - y) * stride
      const dstRow = y * stride
      for (let index = 0; index < stride; index += 1) {
        imageData.data[dstRow + index] = data[srcRow + index]
      }
    }

    ctx.putImageData(imageData, 0, 0)
    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  }
}
