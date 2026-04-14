import { shallowRef, onUnmounted } from 'vue'
import type { EngineRenderer, EngineRendererKind } from '@/engine/render/EngineRenderer'

/**
 * @file useRenderer.ts
 * @brief 渲染器管理 Hook
 * @description 负责 Renderer 实例的生命周期管理，以及 Canvas 尺寸调整。
 */
export function useRenderer() {
  const renderer = shallowRef<EngineRenderer | null>(null)
  const canvasRef = shallowRef<HTMLCanvasElement | null>(null)
  let initToken = 0

  /**
   * 初始化渲染器
   */
  async function init(canvas: HTMLCanvasElement, kind: EngineRendererKind = 'webgl2') {
    const token = ++initToken
    canvasRef.value = canvas

    // 设置初始尺寸
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    let nextRenderer: EngineRenderer

    if (kind === 'webgpu') {
      const { WebGPURenderer } = await import(
        '@/engine/render/backend/webgpu/device/WebGPURenderer'
      )
      nextRenderer = await WebGPURenderer.create(canvas)
    } else {
      const { Renderer: RendererClass } = await import('@/engine/render/Renderer')
      nextRenderer = new RendererClass(canvas) as EngineRenderer
    }

    if (token !== initToken || canvasRef.value !== canvas) {
      nextRenderer.dispose()
      return
    }

    renderer.value = nextRenderer

    // 监听 Resize
    window.addEventListener('resize', handleResize)
  }

  /**
   * 处理窗口大小调整
   */
  function handleResize() {
    if (renderer.value && canvasRef.value) {
      const canvas = canvasRef.value
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      renderer.value.resize(window.innerWidth, window.innerHeight)
    }
  }

  /**
   * 销毁渲染器
   */
  function dispose() {
    initToken += 1
    window.removeEventListener('resize', handleResize)
    if (renderer.value) {
      renderer.value.dispose()
      renderer.value = null
    }
    canvasRef.value = null
  }

  onUnmounted(() => {
    dispose()
  })

  return {
    renderer,
    init,
    dispose,
    resize: handleResize,
  }
}
