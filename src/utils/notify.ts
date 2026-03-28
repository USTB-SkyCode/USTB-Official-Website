type NotifyTone = 'info' | 'success' | 'warning' | 'error'

type NotifyOptions = {
  duration?: number
}

type ToastRecord = {
  element: HTMLDivElement
  dismissTimer: number | null
  removeTimer: number | null
}

const DEFAULT_DURATION = 2200
const EXIT_DELAY_MS = 220
const MAX_TOASTS = 4
const STYLE_ID = 'app-notify-style'
const HOST_ID = 'app-notify-host'

let host: HTMLDivElement | null = null
let seed = 0
const toasts = new Map<number, ToastRecord>()

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${HOST_ID} {
      position: fixed;
      z-index: 3000;
      top: 18px;
      right: 18px;
      display: grid;
      width: min(360px, calc(100vw - 24px));
      gap: 10px;
      pointer-events: none;
    }

    .app-toast {
      display: flex;
      align-items: center;
      min-height: 48px;
      padding: 12px 14px;
      transform: translate3d(0, -8px, 0);
      transition: opacity 220ms ease, transform 220ms ease;
      border: 1px solid transparent;
      border-radius: 14px;
      background: rgb(244 248 255 / 90%);
      box-shadow: 0 14px 30px rgb(15 23 42 / 12%);
      color: rgb(15 23 42 / 92%);
      opacity: 0;
      backdrop-filter: blur(18px) saturate(140%);
    }

    .app-toast.is-visible {
      transform: translate3d(0, 0, 0);
      opacity: 1;
    }

    .app-toast--info {
      border-color: rgb(59 130 246 / 20%);
    }

    .app-toast--success {
      border-color: rgb(34 197 94 / 20%);
    }

    .app-toast--warning {
      border-color: rgb(245 158 11 / 22%);
    }

    .app-toast--error {
      border-color: rgb(239 68 68 / 24%);
    }

    .app-toast__bar {
      width: 4px;
      align-self: stretch;
      margin-right: 10px;
      border-radius: 999px;
      background: currentcolor;
      opacity: 0.68;
    }

    .app-toast--info .app-toast__bar {
      color: rgb(59 130 246);
    }

    .app-toast--success .app-toast__bar {
      color: rgb(22 163 74);
    }

    .app-toast--warning .app-toast__bar {
      color: rgb(217 119 6);
    }

    .app-toast--error .app-toast__bar {
      color: rgb(220 38 38);
    }

    .app-toast__text {
      flex: 1;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    html.dark .app-toast {
      background: rgb(12 20 34 / 88%);
      box-shadow: 0 18px 36px rgb(0 0 0 / 28%);
      color: rgb(239 246 255 / 94%);
    }

    @media (width <= 640px) {
      #${HOST_ID} {
        top: 12px;
        right: 12px;
        left: 12px;
        width: auto;
      }
    }
  `
  document.head.append(style)
}

function ensureHost() {
  ensureStyle()

  if (host && document.body.contains(host)) {
    return host
  }

  host = document.createElement('div')
  host.id = HOST_ID
  document.body.append(host)
  return host
}

function destroyToast(id: number) {
  const record = toasts.get(id)
  if (!record) {
    return
  }

  if (record.dismissTimer !== null) {
    window.clearTimeout(record.dismissTimer)
  }
  if (record.removeTimer !== null) {
    window.clearTimeout(record.removeTimer)
  }

  record.element.remove()
  toasts.delete(id)
}

function dismissToast(id: number) {
  const record = toasts.get(id)
  if (!record) {
    return
  }

  record.element.classList.remove('is-visible')
  record.removeTimer = window.setTimeout(() => destroyToast(id), EXIT_DELAY_MS)
}

function showToast(message: string, tone: NotifyTone, options: NotifyOptions = {}) {
  if (typeof document === 'undefined') {
    return
  }

  const targetHost = ensureHost()
  const id = ++seed
  const element = document.createElement('div')
  element.className = `app-toast app-toast--${tone}`

  const bar = document.createElement('span')
  bar.className = 'app-toast__bar'
  element.append(bar)

  const text = document.createElement('span')
  text.className = 'app-toast__text'
  text.textContent = message
  element.append(text)

  targetHost.prepend(element)
  toasts.set(id, {
    element,
    dismissTimer: null,
    removeTimer: null,
  })

  while (toasts.size > MAX_TOASTS) {
    const oldestId = toasts.keys().next().value as number | undefined
    if (oldestId === undefined) {
      break
    }
    destroyToast(oldestId)
  }

  window.requestAnimationFrame(() => {
    element.classList.add('is-visible')
  })

  const duration = Math.max(900, options.duration ?? DEFAULT_DURATION)
  const record = toasts.get(id)
  if (!record) {
    return
  }
  record.dismissTimer = window.setTimeout(() => dismissToast(id), duration)
}

export const notify = {
  info(message: string, options?: NotifyOptions) {
    showToast(message, 'info', options)
  },
  success(message: string, options?: NotifyOptions) {
    showToast(message, 'success', options)
  },
  warning(message: string, options?: NotifyOptions) {
    showToast(message, 'warning', options)
  },
  error(message: string, options?: NotifyOptions) {
    showToast(message, 'error', options)
  },
}
