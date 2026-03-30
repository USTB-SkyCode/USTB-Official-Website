export {}

declare global {
  interface Window {
    APP_CONFIG?: {
      API_BASE_URL?: string
      AUTH_BASE_URL?: string
      APP_BASE_URL?: string
      SKIN_API_BASE_URL?: string
      MCA_BASE_URL?: string
      SKIN_BASE_URL?: string
      DEV_BACKEND_PROXY_ENABLED?: boolean | string
    }
  }
}
