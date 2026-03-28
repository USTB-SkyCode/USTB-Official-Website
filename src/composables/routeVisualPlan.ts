import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  resolveRouteVisualProfile,
  type RouteVisualPlanId,
  type RouteVisualPlanMode,
} from '@/config/routeVisual'

export function useRouteVisualPlan() {
  const route = useRoute()
  const routeProfile = computed(() => resolveRouteVisualProfile(route.path))

  const routeId = computed<RouteVisualPlanId>(() => routeProfile.value.routeId)

  const sceneKey = computed<string | null>(() => routeProfile.value.sceneKey)

  const visualMode = computed<RouteVisualPlanMode>(() => routeProfile.value.visualMode)

  const shouldReservePersistentHost = computed(() => routeProfile.value.persistentHost)

  return {
    routeProfile,
    routeId,
    sceneKey,
    visualMode,
    shouldReservePersistentHost,
  }
}
