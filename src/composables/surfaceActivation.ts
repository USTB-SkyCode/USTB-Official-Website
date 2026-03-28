import {
  computed,
  inject,
  provide,
  readonly,
  ref,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue'

export type SurfaceActivationMode = 'dom' | 'engine'
export type SurfaceActivationSlot =
  | 'section-frame'
  | 'article-frame'
  | 'header-frame'
  | 'header-indicator'

export type SurfaceActivationPlan = {
  slots: Record<SurfaceActivationSlot, SurfaceActivationMode>
}

export const SURFACE_ACTIVATION_SLOTS: readonly SurfaceActivationSlot[] = [
  'section-frame',
  'article-frame',
  'header-frame',
  'header-indicator',
] as const

export function buildUniformSurfaceActivationPlan(
  mode: SurfaceActivationMode,
): SurfaceActivationPlan {
  return {
    slots: Object.fromEntries(SURFACE_ACTIVATION_SLOTS.map(slot => [slot, mode])) as Record<
      SurfaceActivationSlot,
      SurfaceActivationMode
    >,
  }
}

export const DOM_SURFACE_ACTIVATION_PLAN = buildUniformSurfaceActivationPlan('dom')

export function resolveContentSurfaceMode(plan: SurfaceActivationPlan): SurfaceActivationMode {
  return plan.slots['section-frame'] === 'engine' || plan.slots['article-frame'] === 'engine'
    ? 'engine'
    : 'dom'
}

const SURFACE_ACTIVATION_PLAN_KEY: InjectionKey<Ref<SurfaceActivationPlan>> =
  Symbol('surface-activation-plan')
const defaultSurfaceActivationPlan = ref<SurfaceActivationPlan>(DOM_SURFACE_ACTIVATION_PLAN)

export function provideSurfaceActivationPlan(plan: Ref<SurfaceActivationPlan>) {
  provide(SURFACE_ACTIVATION_PLAN_KEY, plan)
}

export function useSurfaceActivationPlan() {
  const plan = inject(SURFACE_ACTIVATION_PLAN_KEY, defaultSurfaceActivationPlan)
  return readonly(plan)
}

export function useSurfaceActivationSlot(
  slot: SurfaceActivationSlot,
): ComputedRef<SurfaceActivationMode> {
  const plan = useSurfaceActivationPlan()
  return computed(() => plan.value.slots[slot])
}
