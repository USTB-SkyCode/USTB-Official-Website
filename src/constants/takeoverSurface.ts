export type TakeoverSurfaceKind =
  | 'section'
  | 'article'
  | 'headerbar'
  | 'indicator'
  | 'card'
  | 'action-panel'

export type TakeoverSurfaceLayer = 'section' | 'article' | 'headerbar' | 'indicator'

export function normalizeTakeoverSurfaceKind(
  kind: string | null | undefined,
): TakeoverSurfaceKind | string {
  switch (kind) {
    case 'frame':
      return 'headerbar'
    case undefined:
    case null:
    case '':
      return 'section'
    default:
      return kind
  }
}

export function resolveTakeoverSurfaceLayer(kind: string): TakeoverSurfaceLayer {
  switch (kind) {
    case 'indicator':
      return 'indicator'
    case 'headerbar':
      return 'headerbar'
    case 'article':
    case 'card':
    case 'action-panel':
      return 'article'
    case 'section':
    default:
      return 'section'
  }
}
