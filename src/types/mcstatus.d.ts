export type MotdSegment = {
  text: string
  color: string | null
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
}

export type McStatus = {
  ip: string | null
  icon: string | null
  connect_ms: number | null
  type: string | null
  server_status: string | null
  name: string
  motd: string
  motdSegments: MotdSegment[]
  version: string | null
  protocol: number | null
  players_online: number | null
  players_max: number | null
  last_update: string | null
  expose_ip: boolean
}
