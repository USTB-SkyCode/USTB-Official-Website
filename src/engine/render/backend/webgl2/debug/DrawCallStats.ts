import {
  createEmptyEngineDrawCallStats,
  type EngineDrawCallPassName,
  type EngineDrawCallStatsSnapshot,
} from '@render/EngineRenderer'

class DrawCallStatsCollector {
  private currentPass: EngineDrawCallPassName = 'unknown'
  private currentFrame: EngineDrawCallStatsSnapshot = createEmptyEngineDrawCallStats()
  private lastFrame: EngineDrawCallStatsSnapshot = createEmptyEngineDrawCallStats()

  public beginFrame(): void {
    this.currentPass = 'unknown'
    this.currentFrame = createEmptyEngineDrawCallStats()
  }

  public endFrame(): void {
    this.lastFrame = {
      total: this.currentFrame.total,
      drawArrays: this.currentFrame.drawArrays,
      drawElements: this.currentFrame.drawElements,
      byPass: { ...this.currentFrame.byPass },
    }
    this.currentPass = 'unknown'
  }

  public setCurrentPass(passName: EngineDrawCallPassName): void {
    this.currentPass = passName
  }

  public clearCurrentPass(): void {
    this.currentPass = 'unknown'
  }

  public recordDrawCall(kind: 'arrays' | 'elements'): void {
    this.currentFrame.total += 1
    if (kind === 'arrays') {
      this.currentFrame.drawArrays += 1
    } else {
      this.currentFrame.drawElements += 1
    }
    this.currentFrame.byPass[this.currentPass] += 1
  }

  public getLastFrameStats(): EngineDrawCallStatsSnapshot {
    return {
      total: this.lastFrame.total,
      drawArrays: this.lastFrame.drawArrays,
      drawElements: this.lastFrame.drawElements,
      byPass: { ...this.lastFrame.byPass },
    }
  }
}

export const drawCallStats = new DrawCallStatsCollector()
