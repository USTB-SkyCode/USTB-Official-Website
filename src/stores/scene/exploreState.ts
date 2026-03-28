import { ref } from 'vue'
import type { TabKey } from '@/constants/tabs'

export type HomeExploreMobileBlockAction = 'pick'

export function createSceneExploreState() {
  const homeActiveTab = ref<TabKey>('schedule')
  const homeExploreInteractionActive = ref(false)
  const homeExploreUiReveal = ref(false)
  const homeExploreEngineSettingsOpen = ref(false)
  const homeExploreMobileBlockAction = ref<HomeExploreMobileBlockAction | null>(null)
  const homeExploreMobileBlockActionSerial = ref(0)

  function resetHomeExploreUi(reveal: boolean) {
    homeExploreInteractionActive.value = false
    homeExploreUiReveal.value = reveal
    homeExploreEngineSettingsOpen.value = false
  }

  function setHomeActiveTab(tab: TabKey) {
    homeActiveTab.value = tab
    if (tab !== 'explore') {
      resetHomeExploreUi(false)
    }
  }

  function setHomeExploreInteractionActive(active: boolean) {
    homeExploreInteractionActive.value = active
    if (active) {
      homeExploreEngineSettingsOpen.value = false
      return
    }

    homeExploreUiReveal.value = false
  }

  function setHomeExploreUiReveal(reveal: boolean) {
    homeExploreUiReveal.value = reveal
  }

  function setHomeExploreEngineSettingsOpen(open: boolean) {
    homeExploreEngineSettingsOpen.value = open
  }

  function requestHomeExploreMobileBlockAction(action: HomeExploreMobileBlockAction) {
    homeExploreMobileBlockAction.value = action
    homeExploreMobileBlockActionSerial.value += 1
  }

  return {
    homeActiveTab,
    homeExploreInteractionActive,
    homeExploreUiReveal,
    homeExploreEngineSettingsOpen,
    homeExploreMobileBlockAction,
    homeExploreMobileBlockActionSerial,
    resetHomeExploreUi,
    setHomeActiveTab,
    setHomeExploreInteractionActive,
    setHomeExploreUiReveal,
    setHomeExploreEngineSettingsOpen,
    requestHomeExploreMobileBlockAction,
  }
}
