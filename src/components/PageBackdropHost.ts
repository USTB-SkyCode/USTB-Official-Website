import { defineComponent, h } from 'vue'
import type { FrameMode } from '@/composables/frameMode'
import { useRouteVisualPlan } from '@/composables/routeVisualPlan'
import { useSceneController } from '@/composables/scene/useSceneController'
import TechBackdrop from '@/components/TechBackdrop.vue'

export default defineComponent({
  name: 'PageBackdropHost',
  props: {
    frameMode: {
      type: String as () => FrameMode,
      default: 'dom',
    },
  },
  setup(props, { slots }) {
    const { shouldReservePersistentHost } = useRouteVisualPlan()
    const { takeoverEnabled, displayModePreference } = useSceneController()

    return () => {
      const content = slots.default?.() ?? []
      if (
        props.frameMode === 'engine' ||
        (takeoverEnabled.value &&
          displayModePreference.value === 'engine' &&
          shouldReservePersistentHost.value)
      ) {
        return content
      }

      return h(TechBackdrop, null, {
        default: () => content,
      })
    }
  },
})
