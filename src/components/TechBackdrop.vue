<template>
  <div ref="rootRef" class="tech-bg">
    <div class="tech-bg__inner">
      <div class="tech-bg__layer" aria-hidden="true">
        <template v-if="isDarkMode">
          <div
            v-for="meteor in meteors"
            :key="meteor.id"
            class="tech-meteor"
            :style="meteorStyle(meteor)"
          >
            <span class="tech-meteor__core"></span>
          </div>
        </template>
        <template v-else>
          <div
            v-for="segment in trailSegments"
            :key="segment.id"
            class="tech-trail"
            :style="trailStyle(segment)"
          >
            <span class="tech-trail__line"></span>
          </div>
          <div
            v-for="walker in walkers"
            :key="walker.id"
            class="tech-walker"
            :style="walkerStyle(walker)"
          >
            <span class="tech-walker__dot"></span>
          </div>
        </template>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

type Direction = {
  x: number
  y: number
}

type Walker = {
  id: number
  cellX: number
  cellY: number
  x: number
  y: number
  durationMs: number
  lastDirection: Direction | null
}

type TrailSegment = {
  id: number
  x: number
  y: number
  angle: number
  length: number
  durationMs: number
}

type Meteor = {
  id: number
  startX: number
  startY: number
  travelX: number
  travelY: number
  angle: number
  durationMs: number
  delayMs: number
  size: number
  tailLength: number
  opacity: number
}

const DEFAULT_GRID_STEP = 42
const HEADER_BAR_HEIGHT = 64
const HERO_TITLE_BAND_HEIGHT = 132
const WALKER_DOT_SIZE = 4
const WALKER_MOVE_MIN_MS = 760
const WALKER_MOVE_MAX_MS = 1140
const TRAIL_FADE_MS = 920
const METEOR_SPAWN_MIN_MS = 320
const METEOR_SPAWN_MAX_MS = 560
const METEOR_MOBILE_SPAWN_MIN_MS = 520
const METEOR_MOBILE_SPAWN_MAX_MS = 860

const rootRef = ref<HTMLDivElement | null>(null)
const isDarkMode = ref(false)
const walkers = ref<Walker[]>([])
const trailSegments = ref<TrailSegment[]>([])
const meteors = ref<Meteor[]>([])

let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let motionQuery: MediaQueryList | null = null
let motionChangeHandler: ((event: MediaQueryListEvent) => void) | null = null
let reducedMotion = false
let width = 1
let height = 1
let gridStep = DEFAULT_GRID_STEP
let walkerIdCounter = 1
let trailIdCounter = 1
let meteorIdCounter = 1
let meteorSpawnTimer: number | null = null

const walkerTimers = new Map<number, number>()
const trailTimers = new Map<number, number>()
const meteorTimers = new Map<number, number>()

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1))
}

function readGridStep() {
  const root = rootRef.value
  if (!root) {
    gridStep = DEFAULT_GRID_STEP
    return
  }

  const value = Number.parseFloat(getComputedStyle(root).getPropertyValue('--tech-grid-step'))
  gridStep = Number.isFinite(value) && value > 0 ? value : DEFAULT_GRID_STEP
}

function refreshGeometry() {
  const root = rootRef.value
  if (!root) {
    width = 1
    height = 1
    gridStep = DEFAULT_GRID_STEP
    return
  }

  width = Math.max(1, Math.floor(root.clientWidth))
  height = Math.max(1, Math.floor(root.clientHeight))
  readGridStep()
}

function maxCellX() {
  return Math.max(1, Math.floor((width - 1) / gridStep))
}

function maxCellY() {
  return Math.max(1, Math.floor((height - 1) / gridStep))
}

function gridPoint(cellX: number, cellY: number) {
  return {
    x: Math.min(width - 1, cellX * gridStep + 0.5),
    y: Math.min(height - 1, cellY * gridStep + 0.5),
  }
}

function isReverseDirection(first: Direction | null, second: Direction) {
  if (!first) {
    return false
  }

  return first.x === -second.x && first.y === -second.y
}

function clearTimerMap(timerMap: Map<number, number>) {
  for (const timerId of timerMap.values()) {
    window.clearTimeout(timerId)
  }
  timerMap.clear()
}

function clearAllTimers() {
  clearTimerMap(walkerTimers)
  clearTimerMap(trailTimers)
  clearTimerMap(meteorTimers)

  if (meteorSpawnTimer !== null) {
    window.clearTimeout(meteorSpawnTimer)
    meteorSpawnTimer = null
  }
}

function clearWalkerTimer(walkerId: number) {
  const timerId = walkerTimers.get(walkerId)
  if (timerId === undefined) {
    return
  }

  window.clearTimeout(timerId)
  walkerTimers.delete(walkerId)
}

function removeTrailSegment(segmentId: number) {
  trailSegments.value = trailSegments.value.filter(segment => segment.id !== segmentId)
  const timerId = trailTimers.get(segmentId)
  if (timerId !== undefined) {
    window.clearTimeout(timerId)
    trailTimers.delete(segmentId)
  }
}

function removeMeteor(meteorId: number) {
  meteors.value = meteors.value.filter(meteor => meteor.id !== meteorId)
  const timerId = meteorTimers.get(meteorId)
  if (timerId !== undefined) {
    window.clearTimeout(timerId)
    meteorTimers.delete(meteorId)
  }
}

function walkerStyle(walker: Walker) {
  return {
    transform: `translate3d(${walker.x}px, ${walker.y}px, 0)`,
    transitionDuration: `${walker.durationMs}ms`,
  }
}

function trailStyle(segment: TrailSegment) {
  return {
    transform: `translate3d(${segment.x}px, ${segment.y}px, 0) translateY(-50%) rotate(${segment.angle}deg)`,
    '--trail-length': `${segment.length}px`,
    '--trail-head-size': `${WALKER_DOT_SIZE + 2}px`,
    '--trail-grow-duration': `${segment.durationMs}ms`,
    '--trail-fade-delay': `${segment.durationMs}ms`,
    '--trail-fade-duration': `${TRAIL_FADE_MS}ms`,
  }
}

function meteorStyle(meteor: Meteor) {
  return {
    '--meteor-start-x': `${meteor.startX}px`,
    '--meteor-start-y': `${meteor.startY}px`,
    '--meteor-travel-x': `${meteor.travelX}px`,
    '--meteor-travel-y': `${meteor.travelY}px`,
    '--meteor-angle': `${meteor.angle}deg`,
    animationDuration: `${meteor.durationMs}ms`,
    animationDelay: `${meteor.delayMs}ms`,
    '--meteor-size': `${meteor.size}px`,
    '--meteor-tail-length': `${meteor.tailLength}px`,
    '--meteor-opacity': `${meteor.opacity}`,
  }
}

function createWalker() {
  const cellX = randomInt(0, maxCellX())
  const cellY = randomInt(0, maxCellY())
  const point = gridPoint(cellX, cellY)

  return {
    id: walkerIdCounter++,
    cellX,
    cellY,
    x: point.x,
    y: point.y,
    durationMs: randomInt(WALKER_MOVE_MIN_MS, WALKER_MOVE_MAX_MS),
    lastDirection: null,
  } satisfies Walker
}

function chooseWalkerDirection(walker: Walker) {
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ] satisfies Direction[]

  const validDirections = directions.filter(direction => {
    const nextX = walker.cellX + direction.x
    const nextY = walker.cellY + direction.y

    return nextX >= 0 && nextX <= maxCellX() && nextY >= 0 && nextY <= maxCellY()
  })

  const preferredDirections = validDirections.filter(direction => {
    return !isReverseDirection(walker.lastDirection, direction)
  })

  const pool = preferredDirections.length > 0 ? preferredDirections : validDirections
  return pool[randomInt(0, pool.length - 1)]
}

function spawnTrailSegment(walker: Walker, direction: Direction, durationMs: number) {
  const angle = direction.x > 0 ? 0 : direction.x < 0 ? 180 : direction.y > 0 ? 90 : -90
  const segment: TrailSegment = {
    id: trailIdCounter++,
    x: walker.x,
    y: walker.y,
    angle,
    length: gridStep,
    durationMs,
  }

  trailSegments.value = [...trailSegments.value, segment]

  const timerId = window.setTimeout(() => {
    removeTrailSegment(segment.id)
  }, durationMs + TRAIL_FADE_MS)

  trailTimers.set(segment.id, timerId)
}

function scheduleWalkerAdvance(walker: Walker, delayMs: number) {
  clearWalkerTimer(walker.id)

  const timerId = window.setTimeout(() => {
    walkerTimers.delete(walker.id)
    advanceWalker(walker.id)
  }, delayMs)

  walkerTimers.set(walker.id, timerId)
}

function advanceWalker(walkerId: number) {
  if (isDarkMode.value || reducedMotion) {
    return
  }

  const walker = walkers.value.find(entry => entry.id === walkerId)
  if (!walker) {
    return
  }

  const direction = chooseWalkerDirection(walker)
  const nextDuration = randomInt(WALKER_MOVE_MIN_MS, WALKER_MOVE_MAX_MS)
  spawnTrailSegment(walker, direction, nextDuration)

  walker.cellX += direction.x
  walker.cellY += direction.y
  walker.lastDirection = direction
  walker.durationMs = nextDuration

  const nextPoint = gridPoint(walker.cellX, walker.cellY)
  walker.x = nextPoint.x
  walker.y = nextPoint.y

  scheduleWalkerAdvance(walker, walker.durationMs)
}

function startLightMode() {
  walkers.value = []
  trailSegments.value = []
  meteors.value = []

  if (reducedMotion) {
    return
  }

  const walkerCount = width <= 768 ? 3 : 4
  walkers.value = Array.from({ length: walkerCount }, () => createWalker())

  for (const walker of walkers.value) {
    scheduleWalkerAdvance(walker, randomInt(120, 420))
  }
}

function spawnMeteor(delayMs = 0) {
  if (!isDarkMode.value || reducedMotion) {
    return
  }

  const launchZoneRight = Math.min(Math.max(width * 0.18, 140), 260)
  const launchZoneTop = HEADER_BAR_HEIGHT + 6
  const launchZoneBottom = Math.min(height * 0.17, HEADER_BAR_HEIGHT + HERO_TITLE_BAND_HEIGHT - 12)
  const startX = randomBetween(18, launchZoneRight)
  const startY = randomBetween(launchZoneTop, Math.max(launchZoneTop + 16, launchZoneBottom))
  const targetY = randomBetween(height * 0.12, Math.max(height * 0.16, height * 0.3))
  const travelX = width - startX + randomBetween(80, 180)
  const travelY = targetY - startY + randomBetween(120, 220)
  const angle = (Math.atan2(travelY, travelX) * 180) / Math.PI

  const meteor: Meteor = {
    id: meteorIdCounter++,
    startX,
    startY,
    travelX,
    travelY,
    angle,
    durationMs: randomInt(1180, 1880),
    delayMs,
    size: randomBetween(2.2, 3.8),
    tailLength: randomBetween(180, 320),
    opacity: randomBetween(0.82, 1),
  }

  meteors.value = [...meteors.value, meteor]

  const timerId = window.setTimeout(
    () => {
      removeMeteor(meteor.id)
    },
    meteor.durationMs + meteor.delayMs + 120,
  )

  meteorTimers.set(meteor.id, timerId)
}

function scheduleMeteorSpawnLoop() {
  if (!isDarkMode.value || reducedMotion) {
    return
  }

  const isMobile = width <= 768
  const delayMs = isMobile
    ? randomInt(METEOR_MOBILE_SPAWN_MIN_MS, METEOR_MOBILE_SPAWN_MAX_MS)
    : randomInt(METEOR_SPAWN_MIN_MS, METEOR_SPAWN_MAX_MS)

  meteorSpawnTimer = window.setTimeout(() => {
    meteorSpawnTimer = null
    const burstCount = isMobile ? 1 : randomInt(1, 2)
    for (let index = 0; index < burstCount; index += 1) {
      spawnMeteor(index * randomInt(70, 130))
    }
    scheduleMeteorSpawnLoop()
  }, delayMs)
}

function startDarkMode() {
  walkers.value = []
  trailSegments.value = []
  meteors.value = []

  if (reducedMotion) {
    return
  }

  spawnMeteor(0)
  spawnMeteor(120)
  spawnMeteor(240)
  spawnMeteor(360)
  scheduleMeteorSpawnLoop()
}

function rebuildDynamicLayer() {
  clearAllTimers()
  refreshGeometry()
  isDarkMode.value = document.documentElement.classList.contains('dark')

  if (isDarkMode.value) {
    startDarkMode()
    return
  }

  startLightMode()
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionQuery.matches
  motionChangeHandler = event => {
    reducedMotion = event.matches
    rebuildDynamicLayer()
  }
  motionQuery.addEventListener('change', motionChangeHandler)

  themeObserver = new MutationObserver(() => {
    rebuildDynamicLayer()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  const root = rootRef.value
  if (root) {
    resizeObserver = new ResizeObserver(() => {
      rebuildDynamicLayer()
    })
    resizeObserver.observe(root)
  }

  rebuildDynamicLayer()
})

onBeforeUnmount(() => {
  clearAllTimers()
  if (motionQuery && motionChangeHandler) {
    motionQuery.removeEventListener('change', motionChangeHandler)
  }
  themeObserver?.disconnect()
  resizeObserver?.disconnect()
})
</script>

<style scoped lang="css">
.tech-bg {
  --tech-grid-step: 42px;

  position: relative;
  min-height: 100vh;
  isolation: isolate;
  overflow: hidden;
  background: var(--theme-page-bg);
}

.tech-bg__layer {
  position: absolute;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
  inset: 0;
}

.tech-walker {
  position: absolute;
  top: 0;
  left: 0;
  transition-property: transform;
  transition-timing-function: linear;
  will-change: transform;
}

.tech-walker__dot {
  display: block;
  width: 4px;
  height: 4px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: rgb(65 138 255 / 96%);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 18%),
    0 0 10px rgb(63 134 255 / 24%),
    0 0 18px rgb(63 134 255 / 22%);
}

.tech-trail {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--trail-length);
  height: 16px;
  transform-origin: 0 50%;
  animation: tech-trail-fade var(--trail-fade-duration) ease-out forwards;
  animation-delay: var(--trail-fade-delay);
  will-change: transform, opacity;
}

.tech-trail__line {
  position: absolute;
  top: 50%;
  left: 0;
  width: var(--trail-length);
  height: 2px;
  transform: translateY(-50%) scaleX(0);
  transform-origin: 0 50%;
  animation: tech-trail-grow var(--trail-grow-duration) linear forwards;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgb(63 134 255 / 4%) 0%,
    rgb(63 134 255 / 16%) 42%,
    rgb(63 134 255 / 74%) 86%,
    rgb(63 134 255 / 96%) 100%
  );
  box-shadow: 0 0 12px rgb(63 134 255 / 22%);
}

.tech-trail__line::before {
  content: '';
  position: absolute;
  top: 50%;
  right: calc(var(--trail-head-size) * -0.5);
  width: var(--trail-head-size);
  height: var(--trail-head-size);
  transform: translateY(-50%);
  border-radius: 999px;
  background: radial-gradient(
    circle,
    rgb(83 151 255 / 92%) 0 34%,
    rgb(83 151 255 / 32%) 62%,
    rgb(83 151 255 / 0%) 100%
  );
  filter: blur(0.4px);
}

.tech-trail__line::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 8px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgb(63 134 255 / 0%) 0%,
    rgb(63 134 255 / 8%) 48%,
    rgb(63 134 255 / 20%) 100%
  );
  filter: blur(4px);
}

.tech-meteor {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform: translate3d(var(--meteor-start-x), var(--meteor-start-y), 0)
    rotate(var(--meteor-angle));
  animation-name: tech-meteor-flight;
  animation-timing-function: linear;
  opacity: 0;
  animation-fill-mode: forwards;
  will-change: transform, opacity;
}

.tech-meteor__core {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--meteor-size);
  height: var(--meteor-size);
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: rgb(214 245 255 / 98%);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 20%),
    0 0 12px rgb(120 208 255 / 32%),
    0 0 30px rgb(120 208 255 / 28%);
  filter: drop-shadow(0 0 12px rgb(130 214 255 / 44%));
}

.tech-meteor__core::before {
  content: '';
  position: absolute;
  top: 50%;
  right: calc(100% - 1px);
  width: var(--meteor-tail-length);
  height: 2.5px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgb(120 208 255 / 0%) 0%,
    rgb(120 208 255 / 24%) 42%,
    rgb(163 228 255 / 72%) 82%,
    rgb(255 255 255 / 95%) 100%
  );
  box-shadow: 0 0 18px rgb(120 208 255 / 34%);
}

.tech-meteor__core::after {
  content: '';
  position: absolute;
  top: 50%;
  right: calc(100% - 10px);
  width: calc(var(--meteor-tail-length) * 0.84);
  height: 10px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgb(120 208 255 / 0%) 0%,
    rgb(120 208 255 / 8%) 46%,
    rgb(191 236 255 / 20%) 100%
  );
  filter: blur(7px);
}

.tech-bg__inner {
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

.tech-bg__inner::before {
  content: '';
  position: absolute;
  z-index: 0;
  opacity: 0.34;
  background:
    radial-gradient(
      circle at 14% 18%,
      color-mix(in srgb, var(--theme-accent) 8%, transparent),
      transparent 28%
    ),
    radial-gradient(
      circle at 82% 12%,
      color-mix(in srgb, var(--theme-accent) 6%, transparent),
      transparent 22%
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--theme-accent) 5%, transparent) 0 1px,
      transparent 1px var(--tech-grid-step)
    ),
    repeating-linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-accent) 4%, transparent) 0 1px,
      transparent 1px var(--tech-grid-step)
    );
  pointer-events: none;
  inset: 0;
}

.tech-bg__inner::after {
  content: '';
  position: absolute;
  z-index: 0;
  opacity: 0.22;
  background:
    radial-gradient(
      circle at 18% 30%,
      color-mix(in srgb, var(--theme-accent) 14%, transparent) 0 2px,
      transparent 3px
    ),
    radial-gradient(
      circle at 72% 24%,
      color-mix(in srgb, var(--theme-accent) 11%, transparent) 0 1.5px,
      transparent 2.5px
    ),
    radial-gradient(
      circle at 64% 68%,
      color-mix(in srgb, var(--theme-accent) 9%, transparent) 0 2px,
      transparent 3px
    ),
    repeating-linear-gradient(
      180deg,
      transparent 0,
      transparent 11px,
      color-mix(in srgb, var(--theme-accent) 4%, transparent) 11px,
      color-mix(in srgb, var(--theme-accent) 4%, transparent) 12px
    );
  pointer-events: none;
  inset: 0;
  mix-blend-mode: screen;
}

.tech-bg__inner > :not(.tech-bg__layer) {
  position: relative;
  z-index: 2;
}

:global(html:not(.dark)) .tech-bg__inner::before {
  content: none;
}

:global(html:not(.dark)) .tech-bg__inner::after {
  content: none;
}

:global(html:not(.dark)) .tech-bg {
  background:
    radial-gradient(
      circle at 14% 18%,
      color-mix(in srgb, var(--theme-accent) 16%, transparent),
      transparent 28%
    ),
    radial-gradient(
      circle at 82% 12%,
      color-mix(in srgb, var(--theme-accent) 12%, transparent),
      transparent 22%
    ),
    radial-gradient(circle at 18% 30%, rgb(63 134 255 / 15%) 0 2px, transparent 3px),
    radial-gradient(circle at 72% 24%, rgb(63 134 255 / 12%) 0 1.5px, transparent 2.5px),
    radial-gradient(circle at 64% 68%, rgb(63 134 255 / 10%) 0 2px, transparent 3px),
    repeating-linear-gradient(
      90deg,
      rgb(63 134 255 / 14%) 0 1px,
      transparent 1px var(--tech-grid-step)
    ),
    repeating-linear-gradient(
      180deg,
      rgb(63 134 255 / 10%) 0 1px,
      transparent 1px var(--tech-grid-step)
    ),
    var(--theme-page-bg);
}

@keyframes tech-trail-fade {
  0% {
    opacity: 0.92;
  }

  100% {
    opacity: 0;
  }
}

@keyframes tech-trail-grow {
  0% {
    transform: translateY(-50%) scaleX(0);
  }

  100% {
    transform: translateY(-50%) scaleX(1);
  }
}

@keyframes tech-meteor-flight {
  0% {
    transform: translate3d(var(--meteor-start-x), var(--meteor-start-y), 0)
      rotate(var(--meteor-angle)) scale(0.92);
    opacity: 0;
  }

  10% {
    opacity: var(--meteor-opacity);
  }

  88% {
    opacity: var(--meteor-opacity);
  }

  100% {
    transform: translate3d(
        calc(var(--meteor-start-x) + var(--meteor-travel-x)),
        calc(var(--meteor-start-y) + var(--meteor-travel-y)),
        0
      )
      rotate(var(--meteor-angle)) scale(1);
    opacity: 0;
  }
}
</style>
