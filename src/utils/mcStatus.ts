import type { McStatus, MotdSegment } from '@/types/mcstatus'

/* ── Minecraft color code → CSS color ── */
const MC_COLOR_MAP: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
}

const MC_NAMED_COLOR_MAP: Record<string, string> = {
  black: '#000000',
  dark_blue: '#0000AA',
  dark_green: '#00AA00',
  dark_aqua: '#00AAAA',
  dark_red: '#AA0000',
  dark_purple: '#AA00AA',
  gold: '#FFAA00',
  gray: '#AAAAAA',
  dark_gray: '#555555',
  blue: '#5555FF',
  green: '#55FF55',
  aqua: '#55FFFF',
  red: '#FF5555',
  light_purple: '#FF55FF',
  yellow: '#FFFF55',
  white: '#FFFFFF',
}

type MotdStyleState = {
  color: string | null
  bold: boolean
  italic: boolean
  underlined: boolean
  strikethrough: boolean
  obfuscated: boolean
}

function createDefaultStyleState(): MotdStyleState {
  return {
    color: null,
    bold: false,
    italic: false,
    underlined: false,
    strikethrough: false,
    obfuscated: false,
  }
}

function pushSegment(segments: MotdSegment[], text: string, style: MotdStyleState) {
  if (!text) return
  segments.push({
    text,
    color: style.color,
    bold: style.bold,
    italic: style.italic,
    underlined: style.underlined,
    strikethrough: style.strikethrough,
    obfuscated: style.obfuscated,
  })
}

function normalizeTextComponentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.startsWith('#') && /^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  return MC_NAMED_COLOR_MAP[trimmed] ?? null
}

function extractLegacyHexColor(
  raw: string,
  index: number,
): { color: string | null; consumed: number } {
  if (raw[index + 1]?.toLowerCase() !== 'x') {
    return { color: null, consumed: 0 }
  }

  const hexParts: string[] = []
  let cursor = index + 2
  for (let count = 0; count < 6; count += 1) {
    if (raw[cursor] !== '§' || !raw[cursor + 1]) {
      return { color: null, consumed: 0 }
    }
    hexParts.push(raw[cursor + 1])
    cursor += 2
  }

  return {
    color: `#${hexParts.join('')}`,
    consumed: cursor - index - 1,
  }
}

/** Parse a motd string containing §-codes into colored segments */
export function parseMotdSegments(
  raw: string | null | undefined,
  baseState?: Partial<MotdStyleState>,
): MotdSegment[] {
  if (!raw) return []
  const segments: MotdSegment[] = []
  const state: MotdStyleState = {
    ...createDefaultStyleState(),
    ...baseState,
  }
  let buf = ''

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '§' && i + 1 < raw.length) {
      pushSegment(segments, buf, state)
      buf = ''
      const code = raw[i + 1].toLowerCase()
      if (code === 'x') {
        const { color, consumed } = extractLegacyHexColor(raw, i)
        if (color) {
          state.color = color
          state.bold = false
          state.italic = false
          state.underlined = false
          state.strikethrough = false
          state.obfuscated = false
          i += consumed
          continue
        }
      }

      if (code in MC_COLOR_MAP) {
        state.color = MC_COLOR_MAP[code] ?? null
        state.bold = false
        state.italic = false
        state.underlined = false
        state.strikethrough = false
        state.obfuscated = false
      } else if (code === 'l') {
        state.bold = true
      } else if (code === 'm') {
        state.strikethrough = true
      } else if (code === 'n') {
        state.underlined = true
      } else if (code === 'o') {
        state.italic = true
      } else if (code === 'k') {
        state.obfuscated = true
      } else if (code === 'r') {
        Object.assign(state, createDefaultStyleState())
      }
      i++
    } else {
      buf += raw[i]
    }
  }
  pushSegment(segments, buf, state)
  return segments
}

export function stripMcFormatting(value: string) {
  if (!value) return ''
  return String(value)
    .replace(/§x(§[0-9a-fA-F]){6}/g, '')
    .replace(/§./g, '')
    .trim()
}

function flattenMotdSegments(segments: MotdSegment[]) {
  return segments
    .map(segment => segment.text)
    .join('')
    .trim()
}

function parseTextComponentSegments(
  payload: unknown,
  inheritedState?: Partial<MotdStyleState>,
): MotdSegment[] {
  const baseState: MotdStyleState = {
    ...createDefaultStyleState(),
    ...inheritedState,
  }

  if (payload == null) return []
  if (typeof payload === 'string') {
    return parseMotdSegments(payload, baseState)
  }

  if (Array.isArray(payload)) {
    return payload.flatMap(item => parseTextComponentSegments(item, baseState))
  }

  if (typeof payload !== 'object') {
    return parseMotdSegments(String(payload), baseState)
  }

  const node = payload as Record<string, unknown>
  const nextState: MotdStyleState = {
    ...baseState,
    color: normalizeTextComponentColor(node.color) ?? baseState.color,
    bold: typeof node.bold === 'boolean' ? node.bold : baseState.bold,
    italic: typeof node.italic === 'boolean' ? node.italic : baseState.italic,
    underlined: typeof node.underlined === 'boolean' ? node.underlined : baseState.underlined,
    strikethrough:
      typeof node.strikethrough === 'boolean' ? node.strikethrough : baseState.strikethrough,
    obfuscated: typeof node.obfuscated === 'boolean' ? node.obfuscated : baseState.obfuscated,
  }

  const segments: MotdSegment[] = []

  if (Array.isArray(node.rawtext)) {
    segments.push(...node.rawtext.flatMap(item => parseTextComponentSegments(item, nextState)))
  }

  if (typeof node.text === 'string') {
    segments.push(...parseMotdSegments(node.text, nextState))
  }

  if (typeof node.translate === 'string' && !segments.length) {
    const fallbackText = typeof node.fallback === 'string' ? node.fallback : node.translate
    segments.push(...parseMotdSegments(fallbackText, nextState))
  }

  if (Array.isArray(node.extra)) {
    segments.push(...node.extra.flatMap(item => parseTextComponentSegments(item, nextState)))
  }

  return segments
}

function parseMotdPayload(payload: unknown): MotdSegment[] {
  return parseTextComponentSegments(payload)
}

type PythonLiteralParseResult = {
  value: unknown
  index: number
}

function skipPythonWhitespace(source: string, index: number) {
  let cursor = index
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  return cursor
}

function parsePythonString(source: string, index: number): PythonLiteralParseResult {
  const quote = source[index]
  let cursor = index + 1
  let out = ''

  while (cursor < source.length) {
    const ch = source[cursor]
    if (ch === '\\') {
      const next = source[cursor + 1]
      if (next === 'n') out += '\n'
      else if (next === 'r') out += '\r'
      else if (next === 't') out += '\t'
      else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(source.slice(cursor + 2, cursor + 6))) {
        out += String.fromCharCode(Number.parseInt(source.slice(cursor + 2, cursor + 6), 16))
        cursor += 4
      } else if (next) out += next
      cursor += 2
      continue
    }
    if (ch === quote) {
      return { value: out, index: cursor + 1 }
    }
    out += ch
    cursor += 1
  }

  throw new Error('Unterminated Python string literal')
}

function parsePythonNumber(source: string, index: number): PythonLiteralParseResult {
  let cursor = index
  while (cursor < source.length && /[0-9+\-.eE]/.test(source[cursor])) {
    cursor += 1
  }
  const raw = source.slice(index, cursor)
  return { value: Number(raw), index: cursor }
}

function parsePythonIdentifier(source: string, index: number): PythonLiteralParseResult {
  let cursor = index
  while (cursor < source.length && /[A-Za-z_]/.test(source[cursor])) {
    cursor += 1
  }
  const token = source.slice(index, cursor)
  if (token === 'True') return { value: true, index: cursor }
  if (token === 'False') return { value: false, index: cursor }
  if (token === 'None') return { value: null, index: cursor }
  return { value: token, index: cursor }
}

function parsePythonList(source: string, index: number): PythonLiteralParseResult {
  const out: unknown[] = []
  let cursor = index + 1

  while (cursor < source.length) {
    cursor = skipPythonWhitespace(source, cursor)
    if (source[cursor] === ']') {
      return { value: out, index: cursor + 1 }
    }

    const parsed = parsePythonLiteral(source, cursor)
    out.push(parsed.value)
    cursor = skipPythonWhitespace(source, parsed.index)

    if (source[cursor] === ',') {
      cursor += 1
      continue
    }
    if (source[cursor] === ']') {
      return { value: out, index: cursor + 1 }
    }
  }

  throw new Error('Unterminated Python list literal')
}

function parsePythonDict(source: string, index: number): PythonLiteralParseResult {
  const out: Record<string, unknown> = {}
  let cursor = index + 1

  while (cursor < source.length) {
    cursor = skipPythonWhitespace(source, cursor)
    if (source[cursor] === '}') {
      return { value: out, index: cursor + 1 }
    }

    const keyParsed = parsePythonLiteral(source, cursor)
    const key = String(keyParsed.value)
    cursor = skipPythonWhitespace(source, keyParsed.index)
    if (source[cursor] !== ':') {
      throw new Error('Invalid Python dict literal')
    }
    cursor = skipPythonWhitespace(source, cursor + 1)

    const valueParsed = parsePythonLiteral(source, cursor)
    out[key] = valueParsed.value
    cursor = skipPythonWhitespace(source, valueParsed.index)

    if (source[cursor] === ',') {
      cursor += 1
      continue
    }
    if (source[cursor] === '}') {
      return { value: out, index: cursor + 1 }
    }
  }

  throw new Error('Unterminated Python dict literal')
}

function parsePythonLiteral(source: string, index = 0): PythonLiteralParseResult {
  const cursor = skipPythonWhitespace(source, index)
  const ch = source[cursor]

  if (ch === '{') return parsePythonDict(source, cursor)
  if (ch === '[') return parsePythonList(source, cursor)
  if (ch === "'" || ch === '"') return parsePythonString(source, cursor)
  if (/[0-9-]/.test(ch)) return parsePythonNumber(source, cursor)
  if (/[A-Za-z_]/.test(ch)) return parsePythonIdentifier(source, cursor)

  throw new Error(`Unsupported Python literal token: ${ch}`)
}

function extractPythonField(raw: string, fieldName: string) {
  const marker = `'${fieldName}':`
  const start = raw.indexOf(marker)
  if (start === -1) return undefined

  try {
    const parsed = parsePythonLiteral(raw, start + marker.length)
    return parsed.value
  } catch {
    return undefined
  }
}

/* ── Legacy: parse Python-stringified status ── */
function tryParseLegacyStatus(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = parsePythonLiteral(raw)
    if (parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) {
      return parsed.value as Record<string, unknown>
    }
    return null
  } catch {
    const out: Record<string, unknown> = {}
    const type = extractPythonField(raw, 'type')
    if (typeof type === 'string') out.type = type
    const status = extractPythonField(raw, 'status')
    if (typeof status === 'string') out.status = status
    const motd = extractPythonField(raw, 'motd')
    if (motd !== undefined) out.motd = motd
    const pureMotd = extractPythonField(raw, 'pureMotd')
    if (typeof pureMotd === 'string') out.pureMotd = pureMotd
    const version = extractPythonField(raw, 'version')
    if (typeof version === 'string') out.version = version
    const protocol = extractPythonField(raw, 'protocol')
    if (typeof protocol === 'number') out.protocol = protocol
    const players = extractPythonField(raw, 'players')
    if (players && typeof players === 'object' && !Array.isArray(players)) out.players = players
    const icon = extractPythonField(raw, 'icon')
    if (typeof icon === 'string') out.icon = icon
    return out
  }
}

/**
 * Map a raw API row into McStatus.
 * Supports both:
 *  - New structured JSON (status is an object with icon, type, status, motd, …)
 *  - Legacy stringified Python dict (status is a string)
 */
export function mapMcStatusRow(item: unknown): McStatus {
  const it = item as Record<string, unknown>

  // Determine if `status` is already a structured object or a legacy string
  const rawStatus = it.status
  const parsed: Record<string, unknown> | null =
    typeof rawStatus === 'object' && rawStatus !== null
      ? (rawStatus as Record<string, unknown>)
      : typeof rawStatus === 'string'
        ? tryParseLegacyStatus(rawStatus)
        : null

  const timings = (parsed?.timings ?? {}) as Record<string, unknown>
  const proto = (timings.protocol ?? {}) as Record<string, unknown>
  const connectMs =
    typeof parsed?.connect_ms === 'number'
      ? (parsed.connect_ms as number)
      : typeof proto.connect_ms === 'number'
        ? (proto.connect_ms as number)
        : typeof timings.connect_ms === 'number'
          ? (timings.connect_ms as number)
          : null
  const players = (parsed?.players ?? {}) as Record<string, unknown>
  const motdPayload = parsed?.motd
  const motdSegments = parseMotdPayload(motdPayload)
  const motdPlain =
    typeof parsed?.pureMotd === 'string' && (parsed.pureMotd as string).trim()
      ? String(parsed.pureMotd)
      : flattenMotdSegments(motdSegments)
  const ipValue = it.ip != null ? String(it.ip) : null

  return {
    ip: ipValue,
    icon: typeof parsed?.icon === 'string' ? (parsed.icon as string) : null,
    connect_ms: connectMs,
    type: typeof parsed?.type === 'string' ? (parsed.type as string) : null,
    server_status: typeof parsed?.status === 'string' ? (parsed.status as string) : null,
    name: typeof it.name === 'string' ? (it.name as string) : (ipValue ?? ''),
    motd: motdPlain || '',
    motdSegments,
    version: typeof parsed?.version === 'string' ? (parsed.version as string) : null,
    protocol: typeof parsed?.protocol === 'number' ? (parsed.protocol as number) : null,
    players_online: typeof players.online === 'number' ? (players.online as number) : null,
    players_max: typeof players.max === 'number' ? (players.max as number) : null,
    last_update: typeof it.last_update === 'string' ? (it.last_update as string) : null,
    expose_ip: it.expose_ip === true || (it.expose_ip as unknown) === 1,
  }
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '未记录'

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return '未记录'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return `${diffSeconds} 秒前`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} 分钟前`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} 小时前`
  return `${Math.floor(diffSeconds / 86400)} 天前`
}
