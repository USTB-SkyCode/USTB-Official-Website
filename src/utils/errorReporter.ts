import { reactive, readonly } from 'vue'
import type { App as VueApp, ComponentPublicInstance } from 'vue'

type ErrorSource = 'console' | 'window' | 'promise' | 'vue'
type CopyState = 'idle' | 'pending' | 'success' | 'failed'

export type ErrorIssue = {
  id: number
  source: ErrorSource
  title: string
  detail: string
  timestampLabel: string
}

type ErrorReporterState = {
  visible: boolean
  issues: ErrorIssue[]
  copiedReport: string
  copyState: CopyState
  copyMessage: string
}

const MAX_ISSUES = 40

const state = reactive<ErrorReporterState>({
  visible: false,
  issues: [],
  copiedReport: '',
  copyState: 'idle',
  copyMessage: '等待错误上报。',
})

let issueSeed = 0
let installed = false
let latestCopyJobId = 0
let originalConsoleError: typeof console.error | null = null

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function serializeUnknown(value: unknown, seen = new WeakSet<object>()): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }
  if (typeof value === 'string') {
    return value
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'undefined') {
    return 'undefined'
  }
  if (Array.isArray(value)) {
    return value.map(item => serializeUnknown(item, seen)).join('\n')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(
        value,
        (_key, nestedValue) => {
          if (nestedValue instanceof Error) {
            return {
              name: nestedValue.name,
              message: nestedValue.message,
              stack: nestedValue.stack,
            }
          }
          if (typeof nestedValue === 'object' && nestedValue !== null) {
            if (seen.has(nestedValue)) {
              return '[Circular]'
            }
            seen.add(nestedValue)
          }
          return nestedValue
        },
        2,
      )
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  return String(value)
}

function formatConsolePayload(args: unknown[]): string {
  if (args.length === 0) {
    return 'console.error called without arguments'
  }
  return args.map(arg => serializeUnknown(arg)).join('\n')
}

function formatVueInstance(instance: ComponentPublicInstance | null): string {
  if (!instance) {
    return 'unknown'
  }

  const type = instance.$.type
  if (typeof type === 'object' && type && 'name' in type && typeof type.name === 'string') {
    return type.name
  }
  if (typeof type === 'object' && type && '__name' in type && typeof type.__name === 'string') {
    return type.__name
  }
  return 'anonymous-component'
}

function buildReport(): string {
  if (state.issues.length === 0) {
    return 'No issues captured.'
  }

  return [
    '[Auto Copied Error Report]',
    `Count: ${state.issues.length}`,
    '',
    ...state.issues.flatMap(issue => [
      `#${issue.id} [${issue.source}] ${issue.title}`,
      `Time: ${issue.timestampLabel}`,
      issue.detail,
      '',
    ]),
  ].join('\n')
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.append(textarea)
  textarea.select()
  const success = document.execCommand('copy')
  textarea.remove()

  if (!success) {
    throw new Error('document.execCommand(copy) returned false')
  }
}

function syncCopiedReport() {
  state.copiedReport = buildReport()
}

async function copyReportToClipboard(): Promise<void> {
  const nextReport = buildReport()
  state.copiedReport = nextReport
  state.copyState = 'pending'
  state.copyMessage = '正在复制错误报告...'

  const copyJobId = ++latestCopyJobId
  try {
    await writeClipboard(nextReport)
    if (copyJobId !== latestCopyJobId) {
      return
    }
    state.copyState = 'success'
    state.copyMessage = '错误报告已复制到剪贴板。'
  } catch (error) {
    if (copyJobId !== latestCopyJobId) {
      return
    }
    state.copyState = 'failed'
    state.copyMessage = `复制失败：${serializeUnknown(error)}`
  }
}

function recordIssue(source: ErrorSource, title: string, detail: string) {
  const timestampLabel = formatTimestamp(new Date())
  state.issues.push({
    id: ++issueSeed,
    source,
    title,
    detail: detail.trim() || '(empty error payload)',
    timestampLabel,
  })
  if (state.issues.length > MAX_ISSUES) {
    state.issues.splice(0, state.issues.length - MAX_ISSUES)
  }
  state.visible = false
  syncCopiedReport()
  state.copyState = 'idle'
  state.copyMessage = '检测到错误，可在问号弹窗中复制报错信息。'
}

function installConsoleReporter() {
  if (originalConsoleError) {
    return
  }

  originalConsoleError = console.error.bind(console)
  console.error = (...args: Parameters<typeof console.error>) => {
    try {
      recordIssue('console', 'Console Error', formatConsolePayload(args))
    } catch {
      // Intentionally swallow reporter failures to avoid recursive console errors.
    }
    originalConsoleError?.(...args)
  }
}

export function installGlobalErrorReporter(app: VueApp) {
  if (installed || typeof window === 'undefined') {
    return
  }

  installed = true
  installConsoleReporter()

  const previousWindowError = window.onerror
  window.onerror = (message, source, lineno, colno, error) => {
    recordIssue(
      'window',
      'Unhandled Window Error',
      [
        `Message: ${serializeUnknown(message)}`,
        `Location: ${source ?? 'unknown'}:${lineno}:${colno}`,
        `Detail: ${error ? serializeUnknown(error) : 'No error object received'}`,
      ].join('\n'),
    )

    if (typeof previousWindowError === 'function') {
      return previousWindowError(message, source, lineno, colno, error)
    }
    return false
  }

  const previousUnhandledRejection = window.onunhandledrejection
  window.onunhandledrejection = event => {
    recordIssue(
      'promise',
      'Unhandled Promise Rejection',
      `Reason: ${serializeUnknown(event.reason)}`,
    )

    if (typeof previousUnhandledRejection === 'function') {
      return previousUnhandledRejection.call(window, event)
    }
    return undefined
  }

  const previousVueErrorHandler = app.config.errorHandler
  app.config.errorHandler = (err, instance, info) => {
    recordIssue(
      'vue',
      'Vue Runtime Error',
      [
        `Component: ${formatVueInstance(instance)}`,
        `Info: ${info}`,
        `Detail: ${serializeUnknown(err)}`,
      ].join('\n'),
    )

    originalConsoleError?.('Vue Error:', err, info)
    previousVueErrorHandler?.(err, instance, info)
  }
}

export function useGlobalErrorReporterState() {
  return readonly(state)
}

export function dismissGlobalErrorReporter() {
  state.visible = false
}

export function clearGlobalErrorReporterIssues() {
  state.issues.splice(0, state.issues.length)
  state.copiedReport = ''
  state.copyState = 'idle'
  state.copyMessage = '等待错误上报。'
  state.visible = false
}

export function copyGlobalErrorReporterReport() {
  if (state.issues.length === 0) {
    return
  }
  void copyReportToClipboard()
}
