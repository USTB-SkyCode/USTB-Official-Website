<template>
  <div
    class="persistent-engine-host"
    :class="{
      'persistent-engine-host--active': hostCanvasVisible,
      'persistent-engine-host--interactive': exploreInteractionActive || loginInteractionActive,
      'persistent-engine-host--immersive-top': exploreInteractionActive && !homeExploreUiReveal,
    }"
    :data-host-ready="hostReady ? 'true' : 'false'"
    :data-camera-settled="cameraSettled ? 'true' : 'false'"
    :data-camera-settled-stable="cameraSettledStable ? 'true' : 'false'"
    :data-takeover-ready="takeoverReady ? 'true' : 'false'"
    :data-takeover-ready-at="takeoverReadyAt"
    :data-camera-settled-at="cameraSettledAt"
    :data-engine-status="engineStatus"
    :data-route-id="routeId"
    :data-scene-key="sceneKey ?? ''"
    :data-visual-mode="visualMode"
    :data-frame-mode="pageFrameMode"
    :data-camera-preset-key="cameraPresetKey ?? ''"
    :data-resource-key="resourceActiveKey"
    aria-hidden="true"
  >
    <canvas ref="canvasRef" class="persistent-engine-host__canvas"></canvas>
  </div>

  <div
    v-if="exploreSettingsVisible"
    class="persistent-engine-host__explore-settings-overlay"
    data-explore-ui-control="true"
  >
    <EngineSettingsPanel
      class="persistent-engine-host__explore-settings"
      title="Explore Engine Settings"
      kicker="Immersive Roam"
      @close="setHomeExploreEngineSettingsOpen(false)"
    />
  </div>

  <section
    v-if="showBootOverlay"
    class="persistent-engine-host__boot-overlay"
    aria-live="polite"
    data-explore-ui-control="true"
  >
    <p class="persistent-engine-host__boot-kicker">{{ bootOverlayKicker }}</p>
    <strong>{{ bootOverlayTitle }}</strong>
    <span>{{ bootOverlayCopy }}</span>
  </section>

  <EngineHostInspector
    :visible="showInspector"
    :route-id="routeId"
    :scene-key="sceneKey"
    :engine-status="engineStatus"
    :debug-status="debugStatus"
    :loaded-chunk-count="loadedChunkCount"
    :takeover-ready="takeoverReady"
    :surface-count="surfaceCount"
    :consumable-surface-count="consumableSurfaceCount"
    :render-adapter-snapshot="takeoverSurfaceRenderAdapterSnapshot"
    :ui3d-staging-snapshot="takeoverSurfaceUi3dStagingSnapshot"
    :ui3d-submission-state="takeoverUi3dSubmissionState"
  />

  <TakeoverLiquidGlassEditor v-if="shouldReservePersistentHost" />
</template>

<script setup lang="ts">
import EngineSettingsPanel from '@/components/EngineSettingsPanel.vue'
import EngineHostInspector from '@/components/EngineHostInspector.vue'
import TakeoverLiquidGlassEditor from '@/components/TakeoverLiquidGlassEditor.vue'
import { usePersistentEngineHostController } from '@/composables/engineHost/runtime/usePersistentEngineHostController'

const {
  canvasRef,
  routeId,
  sceneKey,
  visualMode,
  shouldReservePersistentHost,
  pageFrameMode,
  cameraPresetKey,
  takeoverReady,
  takeoverReadyAt,
  cameraSettled,
  cameraSettledStable,
  cameraSettledAt,
  hostReady,
  engineStatus,
  resourceActiveKey,
  setHomeExploreEngineSettingsOpen,
  exploreInteractionActive,
  loginInteractionActive,
  exploreSettingsVisible,
  homeExploreUiReveal,
  showInspector,
  debugStatus,
  loadedChunkCount,
  surfaceCount,
  consumableSurfaceCount,
  takeoverSurfaceRenderAdapterSnapshot,
  takeoverSurfaceUi3dStagingSnapshot,
  takeoverUi3dSubmissionState,
  showBootOverlay,
  bootOverlayKicker,
  bootOverlayTitle,
  bootOverlayCopy,
  hostCanvasVisible,
} = usePersistentEngineHostController()
</script>

<style scoped>
:global([data-liquid-glass-editor-selected='true']) {
  outline: 2px solid rgba(159, 208, 255, 0.9);
  outline-offset: 3px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.22),
    0 0 24px rgba(120, 190, 255, 0.28);
}

.persistent-engine-host {
  position: fixed;
  z-index: 0;
  inset: 0;
  visibility: hidden;
  pointer-events: none;
}

.persistent-engine-host--active {
  visibility: visible;
}

.persistent-engine-host--interactive {
  pointer-events: auto;
}

.persistent-engine-host--immersive-top {
  z-index: 1000;
}

.persistent-engine-host__canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
  touch-action: none;
  overscroll-behavior: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.persistent-engine-host__explore-settings-overlay {
  position: fixed;
  z-index: 1700;
  top: 88px;
  left: 24px;
  pointer-events: none;
}

.persistent-engine-host__explore-settings {
  pointer-events: auto;
}

.persistent-engine-host__boot-overlay {
  position: fixed;
  z-index: 1680;
  top: 96px;
  left: 24px;
  display: grid;
  gap: 6px;
  width: min(420px, calc(100vw - 48px));
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 76%, transparent);
  border-radius: 24px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg) 88%, transparent), transparent),
    color-mix(in srgb, var(--theme-card-bg) 76%, white 10%);
  box-shadow: var(--theme-shadow-hero);
  backdrop-filter: blur(18px);
  pointer-events: none;
}

.persistent-engine-host__boot-kicker {
  margin: 0;
  color: var(--theme-accent);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.persistent-engine-host__boot-overlay strong {
  color: var(--theme-text-strong);
  font-size: 1.05rem;
}

.persistent-engine-host__boot-overlay span {
  color: var(--theme-text-muted);
  line-height: 1.55;
}

.persistent-engine-host--interactive .persistent-engine-host__canvas {
  pointer-events: auto;
}

@media (width <= 720px) {
  .persistent-engine-host__boot-overlay {
    top: auto;
    right: 16px;
    bottom: 16px;
    left: 16px;
    width: auto;
    border-radius: 20px;
  }

  .persistent-engine-host__explore-settings-overlay {
    top: auto;
    right: 16px;
    bottom: 16px;
    left: 16px;
  }
}
</style>
