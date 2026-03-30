// Example runtime config payload for environments that render `/config.js`.
// Vite dev/preview generates the same shape from the shared `.env` file.
// Flask should render the same `window.APP_CONFIG` object from that same frontend `.env` source.

window.APP_CONFIG = {
  API_BASE_URL: '${API_BASE_URL}',
  AUTH_BASE_URL: '${AUTH_BASE_URL}',
  APP_BASE_URL: '${APP_BASE_URL}',
  SKIN_API_BASE_URL: '${SKIN_API_BASE_URL}',
  MCA_BASE_URL: '${MCA_BASE_URL}',
  SKIN_BASE_URL: '${SKIN_BASE_URL}',
  DEV_BACKEND_PROXY_ENABLED: false,
}
