export {}

declare global {
  interface Window {
    APP_CONFIG?: {
      API_BASE_URL?: string
      AUTH_BASE_URL?: string
      APP_BASE_URL?: string
      SKIN_API_BASE_URL?: string
      MCA_BASE_URL?: string
      MODEL_BASE_URL?: string
      MODEL_COMPILED_BASE_URL?: string
      MODEL_ASSET_BASE_URL?: string
      BASIC_BASE_URL?: string
      BASIC_COMPILED_BASE_URL?: string
      BASIC_ASSET_BASE_URL?: string
      SKIN_BASE_URL?: string
      DEV_BACKEND_PROXY_ENABLED?: boolean | string
    }
  }
}
