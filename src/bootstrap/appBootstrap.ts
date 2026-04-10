import { readonly, reactive } from 'vue'

export type AppBootstrapPhase = 'loading' | 'ready' | 'error'

type AppBootstrapState = {
  phase: AppBootstrapPhase
  title: string
  message: string
}

const state = reactive<AppBootstrapState>({
  phase: 'loading',
  title: '正在准备前端运行时',
  message: '正在初始化基础运行配置与界面状态。',
})

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown bootstrap error'
}

export function useAppBootstrapState() {
  return readonly(state)
}

export function markAppBootstrapReady() {
  state.phase = 'ready'
  state.title = ''
  state.message = ''
}

export function reportAppBootstrapError(error: unknown, title = '应用启动失败') {
  state.phase = 'error'
  state.title = title
  state.message = normalizeErrorMessage(error)
}
