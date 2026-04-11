import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'

function loadEnvFile(filePath) {
  const values = {}
  if (!fs.existsSync(filePath)) {
    return values
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) {
      continue
    }

    const index = line.indexOf('=')
    if (index <= 0) {
      continue
    }

    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    values[key] = value
  }

  return values
}

const projectRoot = process.cwd()
const fileEnv = loadEnvFile(path.join(projectRoot, '.env.local'))
const env = { ...fileEnv, ...process.env }
const runtimeEnv = loadEnvFile(path.join(projectRoot, '.env'))

const domain = env.LOCAL_APP_DEV_DOMAIN || 'local-app.example.test'
const proxyPort = Number(env.LOCAL_APP_DEV_PROXY_PORT || 443)
const viteOrigin = new URL(env.LOCAL_APP_DEV_PROXY_VITE_ORIGIN || 'https://[::1]:5175')
const backendOrigin = new URL(env.LOCAL_APP_DEV_PROXY_REMOTE_ORIGIN || 'https://api.example.test')
const mcaBaseUrl = (runtimeEnv.MCA_BASE_URL || '/resource/mca').trim() || '/resource/mca'
const backendHostHeader = env.LOCAL_APP_DEV_PROXY_BACKEND_HOST_HEADER?.trim() || ''
const backendServerName = env.LOCAL_APP_DEV_PROXY_BACKEND_SERVERNAME?.trim() || ''
const defaultPfxPath = path.join(
  os.homedir(),
  '.config',
  'world-local-app-dev',
  'app-dev-local.pfx',
)
const pfxPath = env.LOCAL_APP_DEV_PROXY_CERT_PFX || defaultPfxPath
const pfxPassphrase = env.LOCAL_APP_DEV_PROXY_CERT_PASSPHRASE || 'world-local-dev'

if (!fs.existsSync(pfxPath)) {
  throw new Error(
    `Missing local proxy certificate at ${pfxPath}. Run npm run setup:local-app first or set LOCAL_APP_DEV_PROXY_CERT_PFX.`,
  )
}

function pickTarget(requestPath) {
  if (
    /^\/(api|auth)(\/|$)/.test(requestPath) ||
    /^\/skin-origin-proxy(\/|$)/.test(requestPath) ||
    /^\/downloads(\/|$)/.test(requestPath) ||
    /^\/diagnostics(\/|$)/.test(requestPath) ||
    requestPath.startsWith(`${mcaBaseUrl}/`)
  ) {
    return backendOrigin
  }

  return viteOrigin
}

function isBackendTarget(requestPath) {
  return pickTarget(requestPath) === backendOrigin
}

function isMcaRequest(requestPath) {
  return requestPath.startsWith(`${mcaBaseUrl}/`)
}

function stripPort(hostHeader) {
  if (!hostHeader) {
    return ''
  }

  if (hostHeader.startsWith('[')) {
    const closing = hostHeader.indexOf(']')
    return closing >= 0 ? hostHeader.slice(1, closing) : hostHeader
  }

  return hostHeader.split(':', 1)[0]
}

function proxyRequest(clientRequest, clientResponse) {
  const target = pickTarget(clientRequest.url || '/')
  const transport = target.protocol === 'https:' ? https : http
  const backendRequest = isBackendTarget(clientRequest.url || '/')
  const hostHeader = backendRequest
    ? backendHostHeader || clientRequest.headers.host || target.host
    : target.host
  const headers = { ...clientRequest.headers, host: hostHeader }
  const servername = backendRequest
    ? backendServerName || stripPort(hostHeader)
    : target.hostname

  const upstreamRequest = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: clientRequest.method,
      path: clientRequest.url,
      headers,
      rejectUnauthorized: false,
      servername,
    },
    upstreamResponse => {
      const requestPath = clientRequest.url || '/'
      if (backendRequest && (isMcaRequest(requestPath) || (upstreamResponse.statusCode || 0) >= 400)) {
        console.log(
          `[local-app-proxy] ${clientRequest.method || 'GET'} ${requestPath} -> backend ${upstreamResponse.statusCode || 502}`,
        )
      }
      clientResponse.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
      upstreamResponse.pipe(clientResponse)
    },
  )

  upstreamRequest.on('error', error => {
    if (backendRequest) {
      console.warn(
        `[local-app-proxy] ${clientRequest.method || 'GET'} ${clientRequest.url || '/'} upstream error: ${error.message}`,
      )
    }
    clientResponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    clientResponse.end(`Local app-dev proxy upstream error: ${error.message}`)
  })

  clientRequest.pipe(upstreamRequest)
}

function createUpgradeHead(request, target) {
  const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`]
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`${key}: ${item}`)
      }
      continue
    }

    if (key.toLowerCase() === 'host') {
      lines.push(`host: ${target.host}`)
      continue
    }

    lines.push(`${key}: ${value}`)
  }

  return `${lines.join('\r\n')}\r\n\r\n`
}

function proxyUpgrade(request, socket, head) {
  const target = pickTarget(request.url || '/')
  const backendRequest = isBackendTarget(request.url || '/')
  const targetPort = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
  const hostHeader = backendRequest
    ? backendHostHeader || request.headers.host || target.host
    : target.host
  const servername = backendRequest
    ? backendServerName || stripPort(hostHeader)
    : target.hostname

  request.headers.host = hostHeader

  const upstream =
    target.protocol === 'https:'
      ? tls.connect({
          host: target.hostname,
          port: targetPort,
          rejectUnauthorized: false,
          servername,
        })
      : net.connect({ host: target.hostname, port: targetPort })

  upstream.on('connect', () => {
    upstream.write(createUpgradeHead(request, target))
    if (head.length > 0) {
      upstream.write(head)
    }
    socket.pipe(upstream).pipe(socket)
  })

  upstream.on('error', () => {
    socket.destroy()
  })

  socket.on('error', () => {
    upstream.destroy()
  })
}

const server = https.createServer(
  {
    pfx: fs.readFileSync(pfxPath),
    passphrase: pfxPassphrase,
  },
  proxyRequest,
)

server.on('upgrade', proxyUpgrade)

server.listen(proxyPort, '0.0.0.0', () => {
  console.log(
    `[local-app-proxy] https://${domain}:${proxyPort} -> vite ${viteOrigin.origin}, backend ${backendOrigin.origin}, mca ${mcaBaseUrl}`,
  )
})
