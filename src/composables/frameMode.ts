import { inject, provide, readonly, ref, type InjectionKey, type Ref } from 'vue'

export type FrameMode = 'dom' | 'engine'

const FRAME_MODE_KEY: InjectionKey<Ref<FrameMode>> = Symbol('frame-mode')
const defaultFrameMode = ref<FrameMode>('dom')

export function provideFrameMode(mode: Ref<FrameMode>) {
  provide(FRAME_MODE_KEY, mode)
}

export function useFrameMode() {
  const mode = inject(FRAME_MODE_KEY, defaultFrameMode)
  return readonly(mode)
}
