import type { FrameMode } from '@/composables/frameMode'
import {
  buildUniformSurfaceActivationPlan,
  type SurfaceActivationPlan,
} from '@/composables/surfaceActivation'
import type { TabKey } from '@/constants/tabs'

export type RouteVisualPlanMode = 'plain' | 'takeover-ready' | 'debug'
export type RouteVisualPlanId = 'login' | 'home' | 'self' | 'admin' | 'render' | 'unknown'

type RoutePageFramePolicy = 'dom' | 'engine-when-ready'
type RouteSurfaceActivationPolicy = 'dom-all' | 'engine-when-ready-all'

export type RouteVisualProfile = {
  path: string
  routeId: RouteVisualPlanId
  visualMode: RouteVisualPlanMode
  sceneKey: string | null
  persistentHost: boolean
  pageFramePolicy: RoutePageFramePolicy
  surfaceActivationPolicy: RouteSurfaceActivationPolicy
}

const ROUTE_VISUAL_PROFILES: readonly RouteVisualProfile[] = [
  {
    path: '/',
    routeId: 'login',
    visualMode: 'takeover-ready',
    sceneKey: 'campus-home',
    persistentHost: true,
    pageFramePolicy: 'dom',
    surfaceActivationPolicy: 'dom-all',
  },
  {
    path: '/home',
    routeId: 'home',
    visualMode: 'takeover-ready',
    sceneKey: 'campus-home',
    persistentHost: true,
    pageFramePolicy: 'dom',
    surfaceActivationPolicy: 'engine-when-ready-all',
  },
  {
    path: '/me',
    routeId: 'self',
    visualMode: 'takeover-ready',
    sceneKey: 'campus-home',
    persistentHost: true,
    pageFramePolicy: 'engine-when-ready',
    surfaceActivationPolicy: 'dom-all',
  },
  {
    path: '/admin',
    routeId: 'admin',
    visualMode: 'plain',
    sceneKey: 'campus-home',
    persistentHost: true,
    pageFramePolicy: 'dom',
    surfaceActivationPolicy: 'dom-all',
  },
  {
    path: '/render',
    routeId: 'render',
    visualMode: 'debug',
    sceneKey: null,
    persistentHost: false,
    pageFramePolicy: 'dom',
    surfaceActivationPolicy: 'dom-all',
  },
] as const

const UNKNOWN_ROUTE_VISUAL_PROFILE: RouteVisualProfile = {
  path: '*',
  routeId: 'unknown',
  visualMode: 'plain',
  sceneKey: null,
  persistentHost: false,
  pageFramePolicy: 'dom',
  surfaceActivationPolicy: 'dom-all',
}

const routeVisualProfileByPath = new Map(
  ROUTE_VISUAL_PROFILES.map(profile => [profile.path, profile]),
)

export function resolveRouteVisualProfile(path: string): RouteVisualProfile {
  return routeVisualProfileByPath.get(path) ?? UNKNOWN_ROUTE_VISUAL_PROFILE
}

export function resolveRouteVisualPageFrameMode(
  profile: RouteVisualProfile,
  canUseEngineFrame: boolean,
): FrameMode {
  if (profile.visualMode !== 'takeover-ready') {
    return 'dom'
  }

  if (profile.pageFramePolicy === 'engine-when-ready') {
    return canUseEngineFrame ? 'engine' : 'dom'
  }

  return 'dom'
}

export function resolveRouteSurfaceActivationPlan(
  profile: RouteVisualProfile,
  canUseEngineFrame: boolean,
): SurfaceActivationPlan {
  if (profile.surfaceActivationPolicy === 'engine-when-ready-all') {
    return buildUniformSurfaceActivationPlan(canUseEngineFrame ? 'engine' : 'dom')
  }

  return buildUniformSurfaceActivationPlan('dom')
}

export function resolveRouteCameraPresetKey(
  routeId: RouteVisualPlanId,
  homeActiveTab: TabKey,
): string | null {
  if (routeId === 'home') return homeActiveTab
  if (routeId === 'login') return 'login'
  if (routeId === 'self') return 'self'
  return null
}
