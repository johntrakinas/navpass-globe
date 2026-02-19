import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

import { createDepthMaskSphere } from './globe/depthMask'
import { createLanguagePoints } from './globe/languagePoints'
import { createCountries } from './globe/countries'
import { createAtmosphere } from './globe/atmosphere'
import { createInnerSphere } from './globe/innerSphere'
import { createLightingShell } from './globe/lighting'
import { latLongToVector3 } from './globe/latLongtoVector3'
import { createFlightRoutes } from './globe/flights'
import { getSunDirectionUTC } from './globe/solar'
import { loadGeoJSON } from './loaders/loadGeoJSON'

import { highlightCountryFromFeature, clearHighlight, updateCountryHighlight } from './globe/countryHighlight'
import { vector3ToLatLon } from './globe/math'
import { findCountryFeature } from './globe/countryLookUp'
import { showCountryPanel, hideCountryPanel, showFocusDim, hideFocusDim, setFocusDimOpacity } from './scene/camera'
import { createAdaptiveLatLonGrid } from './globe/grid'
import { createAdaptiveTriGrid } from './globe/tridGrid'
import { createNightLights } from './globe/nightLights'
import { createLandWaterLayer } from './globe/landWater'

import { createStarfieldShader } from './background/starfieldShaders'
import { createTooltip } from './ui/tooltip'
import { setHoverHighlight, clearHoverHighlight, updateHoverHighlight, fadeOutHover } from './globe/hoverHighlight'
import { VignetteGrainShader } from './postprocess/vignetteGrain'
import { createStoryHighlight } from './globe/storyHighlight'
import { scaleThickness } from './globe/thicknessScale'
import { inflateAirportsDataset } from './globe/syntheticAirports'

export type GlobeOptions = {
  mountTarget?: HTMLElement
  overlayTarget?: HTMLElement
  assetBaseUrl?: string
  injectDefaultUI?: boolean
  initialHeatmapEnabled?: boolean
}

export type GlobeInstance = {
  ready: Promise<void>
}

export default function globe(options: GlobeOptions = {}): GlobeInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('The globe package must be instantiated in a browser environment.')
  }

  const mountTarget = options.mountTarget ?? document.body
  const overlayTarget = options.overlayTarget ?? document.body
  const assetBaseUrl = (options.assetBaseUrl ?? '').replace(/\/+$/, '')
  const resolveAssetPath = (assetPath: string) => {
    const normalizedAssetPath = assetPath.replace(/^\/+/, '')
    return assetBaseUrl ? `${assetBaseUrl}/${normalizedAssetPath}` : `/${normalizedAssetPath}`
  }
  ;(globalThis as any).__NAVPASS_GLOBE_ASSET_BASE_URL = assetBaseUrl

  function ensureDefaultUiScaffold() {
    if ((options.injectDefaultUI ?? true) === false) return

    let createdScaffold = false
    let createdHeatmapToggle = false

    let uiToggle = document.getElementById('ui-toggle') as HTMLDivElement | null
    if (!uiToggle) {
      uiToggle = document.createElement('div')
      uiToggle.id = 'ui-toggle'
      overlayTarget.appendChild(uiToggle)
      createdHeatmapToggle = true
    }

    if (!document.getElementById('heatmap-toggle')) {
      uiToggle.innerHTML = `
        <div class="toggle-group">
          <span class="toggle-label">Heatmap</span>
          <label class="toggle-switch">
            <input id="heatmap-toggle" type="checkbox" />
            <span class="toggle-track"></span>
            <span id="heatmap-thumb" class="toggle-thumb"></span>
          </label>
        </div>
      `
      createdHeatmapToggle = true
    }

    if (!document.getElementById('globe-ui')) {
      const globeUi = document.createElement('div')
      globeUi.id = 'globe-ui'
      const story = document.createElement('div')
      story.className = 'ui-story is-collapsed'
      const storyRow = document.createElement('div')
      storyRow.className = 'ui-story-row'
      const storyCaption = document.createElement('div')
      storyCaption.id = 'story-caption'
      story.appendChild(storyRow)
      story.appendChild(storyCaption)
      globeUi.appendChild(story)
      overlayTarget.appendChild(globeUi)
      createdScaffold = true
    }

    if (!document.getElementById('country-panel')) {
      const panel = document.createElement('div')
      panel.id = 'country-panel'
      overlayTarget.appendChild(panel)
      createdScaffold = true
    }

    if (!document.getElementById('focus-dim')) {
      const focusDim = document.createElement('div')
      focusDim.id = 'focus-dim'
      overlayTarget.appendChild(focusDim)
      createdScaffold = true
    }

    const styleId = 'navpass-globe-default-ui'
    if (document.getElementById(styleId)) return

    const panelEl = document.getElementById('country-panel') as HTMLElement | null
    const panelStyle = panelEl ? getComputedStyle(panelEl) : null
    const panelLooksUnstyled = !panelStyle ||
      panelStyle.position !== 'fixed' ||
      panelStyle.right === 'auto' ||
      panelStyle.bottom === 'auto'
    if (panelEl && panelLooksUnstyled) {
      panelEl.style.position = 'fixed'
      panelEl.style.left = 'auto'
      panelEl.style.top = 'auto'
      panelEl.style.right = '24px'
      panelEl.style.bottom = '54px'
      panelEl.style.margin = '0'
      panelEl.style.zIndex = '4'
    }
    if (!createdScaffold && !createdHeatmapToggle && !panelLooksUnstyled) return

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      :root {
        --panel-bg: rgba(6, 18, 38, 0.74);
        --panel-border: rgba(255, 255, 255, 0.2);
        --panel-text: rgba(255, 255, 255, 0.94);
        --panel-shadow: rgba(0, 0, 0, 0.45);
        --panel-surface: rgba(255, 255, 255, 0.06);
        --panel-surface-border: rgba(255, 255, 255, 0.16);
        --tooltip-bg: rgba(6, 18, 38, 0.88);
        --tooltip-border: rgba(255, 255, 255, 0.22);
        --tooltip-text: rgba(255, 255, 255, 0.95);
        --ui-bg: rgba(6, 18, 38, 0.74);
        --ui-border: rgba(255, 255, 255, 0.18);
        --ui-text: rgba(255, 255, 255, 0.9);
        --ui-track: rgba(255, 255, 255, 0.24);
        --ui-thumb: #ffffff;
      }
      #ui-toggle {
        position: fixed;
        right: 24px;
        top: 58px;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--ui-bg);
        border: 1px solid var(--ui-border);
        color: var(--ui-text);
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
        pointer-events: auto;
      }
      #ui-toggle,
      #ui-toggle *,
      #ui-toggle *::before,
      #ui-toggle *::after { box-sizing: border-box; }
      .toggle-group { display: flex; align-items: center; gap: 8px; }
      .toggle-label { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
      .toggle-switch { position: relative; display: inline-flex; width: 42px; height: 22px; }
      .toggle-switch input { opacity: 0; width: 0; height: 0; }
      .toggle-track { position: absolute; inset: 0; background: var(--ui-track); border-radius: 999px; }
      .toggle-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--ui-thumb);
        transition: transform 420ms ease;
      }
      #globe-ui { position: fixed; inset: 0; z-index: 4; pointer-events: none; }
      #globe-ui .ui-story { display: none; }
      #country-panel,
      #country-panel *,
      #country-panel *::before,
      #country-panel *::after { box-sizing: border-box; }
      #country-panel {
        position: fixed !important;
        left: auto !important;
        top: auto !important;
        right: 24px !important;
        bottom: 54px !important;
        width: min(438px, calc(100vw - 36px));
        max-height: 86vh;
        overflow: hidden;
        padding: 1px;
        margin: 0;
        border: 1px solid rgba(255, 255, 255, 0.34);
        background: #0d1c30;
        color: var(--panel-text);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.42);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 460ms ease, transform 560ms ease;
        z-index: 4;
      }
      #country-panel.is-visible { opacity: 1; transform: translateY(0); }
      #focus-dim {
        position: fixed;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        opacity: 0;
        background: rgba(2, 6, 12, 0.3);
        transition: opacity 760ms ease;
      }
      .panel-tooltip,
      .panel-tooltip * { margin: 0; }
      .panel-tooltip { display: flex; flex-direction: column; width: 100%; background: #0d1c30; color: #fff; }
      .panel-tooltip-header { position: relative; display: flex; min-height: 162px; border-bottom: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden; }
      .panel-tooltip-headcopy { flex: 1; padding: 58px 20px 18px; }
      .panel-tooltip-title { font-family: "Optima","Times New Roman",serif; font-size: 42px; line-height: 1.05; letter-spacing: -0.7px; }
      .panel-tooltip-live { margin-top: 8px; display: flex; align-items: center; gap: 8px; font: 13px/1.1 "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; letter-spacing: 0.7px; text-transform: uppercase; color: rgba(255, 255, 255, 0.52); }
      .panel-tooltip-live-dot { width: 8px; height: 8px; border-radius: 999px; background: #ecb200; }
      .panel-tooltip-close { position: absolute; left: 12px; top: 12px; width: 24px; height: 24px; border: 0; background: transparent; color: rgba(255, 255, 255, 0.82); font-size: 28px; line-height: 1; cursor: pointer; padding: 0; display: grid; place-items: center; }
      .panel-tooltip-flagbox { width: 122px; border-left: 1px solid rgba(255, 255, 255, 0.1); background-image: var(--flag-bg); background-position: center; background-repeat: no-repeat; background-size: 80px auto; opacity: 0.95; }
      .panel-tooltip-flagbox--empty { background: rgba(255, 255, 255, 0.04); }
      .panel-tooltip-dual { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
      .panel-tooltip-stat { padding: 16px 18px 14px; }
      .panel-tooltip-stat:first-child { border-right: 1px solid rgba(255, 255, 255, 0.12); }
      .panel-tooltip-stat-label { font: 14px/1 "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255, 255, 255, 0.48); }
      .panel-tooltip-stat-value { margin-top: 8px; font-family: "Optima","Times New Roman",serif; font-size: 42px; line-height: 1; color: #fff; }
      .panel-tooltip-stat-sub { margin-top: 6px; font: 14px/1.2 "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; color: rgba(255, 255, 255, 0.32); }
      .panel-tooltip-aircraft { border-bottom: 1px solid rgba(255, 255, 255, 0.12); padding: 16px 20px; }
      .panel-tooltip-aircraft-label { font: 13px/1 "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; letter-spacing: 1.2px; text-transform: uppercase; color: rgba(255, 255, 255, 0.48); }
      .panel-tooltip-aircraft-value { margin-top: 8px; font: 20px/1.34 "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; color: rgba(255, 255, 255, 0.92); }
      .panel-tooltip-footer { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: rgba(255, 255, 255, 0.05); }
      .panel-tooltip-total-label { font: 13px/1 "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; letter-spacing: 1.1px; text-transform: uppercase; color: rgba(255, 255, 255, 0.42); }
      .panel-tooltip-total-value { margin-top: 6px; font-family: "Optima","Times New Roman",serif; font-size: 42px; line-height: 1; color: #fff; }
      .panel-tooltip-more { height: 50px; min-width: 120px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.08); color: #fff; font: 600 16px "Segoe UI",Tahoma,Geneva,Verdana,sans-serif; padding: 0 20px; cursor: pointer; }
      .panel-tooltip-more:hover { background: rgba(255, 255, 255, 0.16); }
      .panel-tooltip-more:active { transform: translateY(1px); }
      @media (max-width: 980px) {
        #ui-toggle { right: 12px; top: 52px; }
        #country-panel { right: 12px !important; bottom: 74px !important; width: calc(100vw - 24px); max-height: 70vh; }
      }
      @media (max-width: 700px) {
        .panel-tooltip-title, .panel-tooltip-stat-value, .panel-tooltip-total-value { font-size: 34px; }
        .panel-tooltip-aircraft-value { font-size: 16px; }
      }
    `
    document.head.appendChild(style)
  }
  ensureDefaultUiScaffold()

  /* 
   * Config
   */
  const GLOBE_RADIUS = 10
  const COUNTRIES_GEOJSON_PATH = resolveAssetPath('data/ne_110m_admin_0_countries.geojson')
  const ENABLE_STORY_HIGHLIGHT = false
  const SYNTHETIC_AIRPORT_TARGET = 5200
  const AIRPORT_MIN_SPACING_DEG = 0.5
  const SHOW_GLOBE_POINTS = false
  const MOCK_FLIGHT_ROUTE_COUNT = 700
  let countriesGeoJSON: any = null

let triGrid: ReturnType<typeof createAdaptiveTriGrid> | null = null
let latLonGrid: ReturnType<typeof createAdaptiveLatLonGrid> | null = null
let countriesLines: ReturnType<typeof createCountries> | null = null
let languagePoints: { points: THREE.Points; material: THREE.ShaderMaterial } | null = null
let lightingShell:
  | { group: THREE.Group; nightMaterial: THREE.ShaderMaterial; dayMaterial: THREE.ShaderMaterial }
  | null = null
let nightLights:
  | {
      points: THREE.Points
      material: THREE.ShaderMaterial
      update: (timeSeconds: number, cameraDistance: number, sunDirWorld: THREE.Vector3) => void
    }
  | null = null
let landWater: ReturnType<typeof createLandWaterLayer> | null = null
let atmosphere:
  | {
      group: THREE.Group
      setLightDir: (dir: THREE.Vector3) => void
      materials: {
        inner: THREE.ShaderMaterial
        outer: THREE.ShaderMaterial
        subsurface: THREE.ShaderMaterial
      }
    }
  | null = null
let storyHighlight: ReturnType<typeof createStoryHighlight> | null = null
let flightRoutes:
  | {
      group: THREE.Group
      lines: THREE.LineSegments
      planes: THREE.Points
      update: (deltaSeconds: number, timeSeconds: number, cameraDistance: number) => void
      setFocusCountry: (iso3: string | null) => void
      setHoverRoute: (routeId: number | null) => void
      setSelectedRoute: (routeId: number | null) => void
      getRouteInfo: (routeId: number) => any | null
      getCountryFlightStats: (iso3: string, timeSeconds: number) => any
      setHeatmapEnabled: (enabled: boolean) => void
    }
  | null = null
let selectedFlightRouteId: number | null = null
let isCountrySelected = false
let selectedCountryIso3: string | null = null
let innerSphereMesh: THREE.Mesh | null = null
let depthMaskMesh: THREE.Mesh | null = null

const tooltip = createTooltip(overlayTarget)
let lastHoverKey = ''

// Pinned flight label (minimal, Google-style): persists when a route is selected.
const flightRouteLabel = document.createElement('div')
flightRouteLabel.id = 'flight-route-label'
flightRouteLabel.style.position = 'fixed'
flightRouteLabel.style.left = '0px'
flightRouteLabel.style.top = '0px'
flightRouteLabel.style.display = 'flex'
flightRouteLabel.style.alignItems = 'flex-start'
flightRouteLabel.style.gap = '10px'
flightRouteLabel.style.padding = '10px 12px'
flightRouteLabel.style.borderRadius = '14px'
flightRouteLabel.style.background = 'var(--panel-bg, rgba(6, 18, 38, 0.74))'
flightRouteLabel.style.border = '1px solid var(--panel-border, rgba(255, 255, 255, 0.2))'
flightRouteLabel.style.backdropFilter = 'blur(12px)'
flightRouteLabel.style.color = 'var(--panel-text, rgba(255, 255, 255, 0.94))'
flightRouteLabel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
flightRouteLabel.style.boxShadow = '0 18px 55px var(--panel-shadow, rgba(0, 0, 0, 0.45))'
flightRouteLabel.style.opacity = '0'
flightRouteLabel.style.transform = 'translate(-50%, -100%) translateY(8px)'
flightRouteLabel.style.transition = 'opacity 460ms ease, transform 560ms ease'
flightRouteLabel.style.pointerEvents = 'none'
flightRouteLabel.style.zIndex = '5'

const flightRouteText = document.createElement('div')
flightRouteText.style.display = 'flex'
flightRouteText.style.flexDirection = 'column'
flightRouteText.style.gap = '2px'

const flightRouteTitle = document.createElement('div')
flightRouteTitle.style.fontSize = '12px'
flightRouteTitle.style.lineHeight = '1.1'
flightRouteTitle.style.letterSpacing = '0.2px'

const flightRouteMeta = document.createElement('div')
flightRouteMeta.style.fontSize = '10px'
flightRouteMeta.style.opacity = '0.7'
flightRouteMeta.style.letterSpacing = '0.6px'
flightRouteMeta.style.textTransform = 'uppercase'

const flightRouteClose = document.createElement('button')
flightRouteClose.type = 'button'
flightRouteClose.textContent = '×'
flightRouteClose.setAttribute('aria-label', 'Clear route')
flightRouteClose.style.width = '26px'
flightRouteClose.style.height = '26px'
flightRouteClose.style.borderRadius = '999px'
flightRouteClose.style.border = '1px solid var(--panel-surface-border, rgba(255, 255, 255, 0.16))'
flightRouteClose.style.background = 'var(--panel-surface, rgba(255, 255, 255, 0.06))'
flightRouteClose.style.color = 'var(--panel-text, rgba(255, 255, 255, 0.94))'
flightRouteClose.style.cursor = 'pointer'
flightRouteClose.style.display = 'grid'
flightRouteClose.style.placeItems = 'center'
flightRouteClose.style.padding = '0'
flightRouteClose.style.lineHeight = '1'

flightRouteClose.addEventListener('click', (ev) => {
  ev.stopPropagation()
  selectedFlightRouteId = null
  flightRoutes?.setSelectedRoute(null)
  setPinnedFlightRoute(null)
  if (!isCountrySelected) {
    focusDimBase = 0
    focusDimFlash = 0
    hideFocusDim()
  }
})

flightRouteText.appendChild(flightRouteTitle)
flightRouteText.appendChild(flightRouteMeta)
flightRouteLabel.appendChild(flightRouteText)
flightRouteLabel.appendChild(flightRouteClose)
overlayTarget.appendChild(flightRouteLabel)

let flightRouteLabelBaseAlpha = 0
const _routeLabelMidLocal = new THREE.Vector3()
const _routeLabelMidWorld = new THREE.Vector3()
const _routeLabelNdc = new THREE.Vector3()
const _routeLabelCamDir = new THREE.Vector3()
const _routeLabelWorldDir = new THREE.Vector3()

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function updatePinnedFlightRouteLabelPosition() {
  if (!flightRoutes || selectedFlightRouteId === null || flightRouteLabelBaseAlpha <= 0.001) {
    flightRouteLabel.style.opacity = '0'
    flightRouteLabel.style.pointerEvents = 'none'
    return
  }

  const info = flightRoutes.getRouteInfo(selectedFlightRouteId)
  if (!info) {
    flightRouteLabel.style.opacity = '0'
    flightRouteLabel.style.pointerEvents = 'none'
    return
  }

  // Midpoint is in the globe's local space.
  _routeLabelMidLocal.set(Number(info.midX), Number(info.midY), Number(info.midZ))
  globeGroup.updateMatrixWorld(true)
  _routeLabelMidWorld.copy(_routeLabelMidLocal)
  globeGroup.localToWorld(_routeLabelMidWorld)

  // Hide/fade when the pin is near/behind the horizon.
  const facing = _routeLabelWorldDir.copy(_routeLabelMidWorld).normalize().dot(_routeLabelCamDir.copy(camera.position).normalize())
  const limb = Math.pow(smoothstep(0.05, 0.18, facing), 1.35)
  const alpha = flightRouteLabelBaseAlpha * limb
  flightRouteLabel.style.opacity = alpha.toFixed(3)
  flightRouteLabel.style.pointerEvents = alpha > 0.12 ? 'auto' : 'none'

  // Screen-space position.
  _routeLabelNdc.copy(_routeLabelMidWorld).project(camera)
  const x = (_routeLabelNdc.x * 0.5 + 0.5) * window.innerWidth
  const y = (-_routeLabelNdc.y * 0.5 + 0.5) * window.innerHeight

  // Place label slightly above the pin.
  let left = x
  let top = y - 12

  // Clamp inside viewport so it never gets cut off.
  const rect = flightRouteLabel.getBoundingClientRect()
  const pad = 10
  const halfW = rect.width * 0.5
  left = THREE.MathUtils.clamp(left, pad + halfW, window.innerWidth - pad - halfW)
  top = THREE.MathUtils.clamp(top, pad + rect.height, window.innerHeight - pad)

  flightRouteLabel.style.left = `${left.toFixed(1)}px`
  flightRouteLabel.style.top = `${top.toFixed(1)}px`
}

function setPinnedFlightRoute(routeId: number | null) {
  if (routeId === null || !flightRoutes) {
    flightRouteLabelBaseAlpha = 0
    flightRouteLabel.style.transform = 'translate(-50%, -100%) translateY(8px)'
    flightRouteLabel.style.pointerEvents = 'none'
    return
  }

  const info = flightRoutes.getRouteInfo(routeId)
  if (!info) {
    flightRouteLabelBaseAlpha = 0
    flightRouteLabel.style.transform = 'translate(-50%, -100%) translateY(8px)'
    flightRouteLabel.style.pointerEvents = 'none'
    return
  }

  const isForward = Number(info.dir) >= 0
  const from = compactAirportName(isForward ? info.fromName : info.toName)
  const to = compactAirportName(isForward ? info.toName : info.fromName)

  flightRouteTitle.textContent = `${from} → ${to}`
  const distanceKm = Number(info.distanceKm)
  const kmText = Number.isFinite(distanceKm) ? `${Math.round(distanceKm).toLocaleString('en-US')} km` : '— km'
  const trafficCount = Number(info.trafficCount)
  const trafficClamped = Number.isFinite(trafficCount) ? Math.max(1, Math.min(4, Math.round(trafficCount))) : NaN
  const trafficText = Number.isFinite(trafficClamped) ? `Traffic ${trafficClamped}/4` : 'Traffic —/4'
  flightRouteMeta.textContent = `${kmText} • ${trafficText}`
  flightRouteLabelBaseAlpha = 1
  flightRouteLabel.style.transform = 'translate(-50%, -100%) translateY(0px)'
  flightRouteLabel.style.pointerEvents = 'auto'
  updatePinnedFlightRouteLabelPosition()
}

const _qYaw = new THREE.Quaternion()
const _qPitch = new THREE.Quaternion()
const _axisY = new THREE.Vector3(0, 1, 0)
const _axisX = new THREE.Vector3(1, 0, 0)

let pitchAccum = 0
let yawAccum = 0
const _tmpForward = new THREE.Vector3()
const _tmpUp = new THREE.Vector3()
const _sunLocalDir = new THREE.Vector3(1.0, 0.2, 0.35).normalize()
const _sunWorldDir = new THREE.Vector3(1.0, 0.2, 0.35).normalize()
let _lastSunUpdateMs = -Infinity

function unwrapAngleNear(angle: number, reference: number) {
  const twoPi = Math.PI * 2
  return angle + twoPi * Math.round((reference - angle) / twoPi)
}

function syncYawPitchFromGlobe() {
  // We keep roll out by extracting yaw/pitch from the current quaternion using the
  // same convention we use to apply rotation: q = pitch(X) * yaw(Y).
  _tmpForward.set(0, 0, 1).applyQuaternion(globeGroup.quaternion)
  _tmpUp.set(0, 1, 0).applyQuaternion(globeGroup.quaternion)

  const nextPitch = Math.atan2(_tmpUp.z, _tmpUp.y)
  const nextYaw = Math.atan2(_tmpForward.x * _tmpUp.y, _tmpForward.z)

  pitchAccum = THREE.MathUtils.clamp(nextPitch, -maxPitch, maxPitch)
  yawAccum = unwrapAngleNear(nextYaw, yawAccum)
}

function applyYawPitchToGlobe() {
  _qYaw.setFromAxisAngle(_axisY, yawAccum)
  _qPitch.setFromAxisAngle(_axisX, pitchAccum)
  globeGroup.quaternion.copy(_qPitch).multiply(_qYaw)
}

const maxPitch = Math.PI / 2.2

/**
 * Scene / Camera / Renderer
 */
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x07090d)

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000)
camera.up.set(0, 1, 0)
camera.position.set(0, 0, 50)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.debug.checkShaderErrors = true
mountTarget.appendChild(renderer.domElement)

/**
 * Postprocessing (subtle Google-Research polish)
 */
// IMPORTANT:
// We tried a postprocess chain (bloom + FXAA + vignette/grain), but it can easily
// make thin country borders look "washed"/grainy depending on display/pixel ratio.
// Keeping it OFF for now preserves the crisp Google-Research look we had before.
const ENABLE_POSTPROCESS = false

let composer: EffectComposer | null = null
let bloomPass: UnrealBloomPass | null = null
let fxaaPass: ShaderPass | null = null
let vignettePass: ShaderPass | null = null

if (ENABLE_POSTPROCESS) {
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.85, 0.92)
  bloomPass.strength = 0.16
  bloomPass.radius = 0.78
  bloomPass.threshold = 0.82
  composer.addPass(bloomPass)

  fxaaPass = new ShaderPass(FXAAShader)
  composer.addPass(fxaaPass)

  vignettePass = new ShaderPass(VignetteGrainShader as any)
  vignettePass.material.uniforms.uVignette.value = 0.16
  vignettePass.material.uniforms.uVignetteSoftness.value = 0.66
  vignettePass.material.uniforms.uGrain.value = 0.0
  composer.addPass(vignettePass)
}

function updatePostprocessSize() {
  if (!composer || !fxaaPass || !bloomPass) return
  const pr = renderer.getPixelRatio()
  composer.setPixelRatio(pr)
  if (fxaaPass.material.uniforms?.resolution) {
    fxaaPass.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr))
  }
  composer.setSize(innerWidth, innerHeight)
  // bloom pass size is handled via composer.setSize(effectiveWidth/effectiveHeight)
}
updatePostprocessSize()

const heatmapToggle = document.getElementById('heatmap-toggle') as HTMLInputElement | null
const heatmapThumb = document.getElementById('heatmap-thumb') as HTMLSpanElement | null
const initialHeatmapEnabled = options.initialHeatmapEnabled ?? (heatmapToggle ? heatmapToggle.checked : true)
if (heatmapToggle) {
  heatmapToggle.checked = initialHeatmapEnabled
}
type VisualPreset = {
  sceneBg: number
  innerSphere: number
  landAlpha: number
  coastAlpha: number
  borderCoreOpacity: number
  borderLineWidth: number
  triGridOpacityMul: number
  triGridShimmerMul: number
  latLonGridOpacityMul: number
  latLonGridShimmerMul: number
  atmoInner: number
  atmoOuter: number
  atmoSubsurface: number
  dotAlpha: number
  dotSizeMul: number
  planeAlpha: number
  planeSizeMul: number
  routeLineBaseAlpha: number
  routeLineGlowAlpha: number
  nightLightsAlpha: number
  shadowMul: number
  dayMul: number
}

const DRAMATIC_VISUAL_PRESET: VisualPreset = {
  sceneBg: 0x07090d,
  innerSphere: 0x07090d,
  // Keep country fill identical to globe body; only borders should distinguish countries.
  landAlpha: 0.0,
  coastAlpha: 0.0,
  borderCoreOpacity: 0.24,
  borderLineWidth: 1.8,
  triGridOpacityMul: 1.0,
  triGridShimmerMul: 0.0,
  latLonGridOpacityMul: 0.8,
  latLonGridShimmerMul: 0.0,
  atmoInner: 0.0,
  atmoOuter: 0.0,
  atmoSubsurface: 0.0,
  dotAlpha: 1.08,
  dotSizeMul: 1.36,
  planeAlpha: 0.64,
  planeSizeMul: 0.84,
  routeLineBaseAlpha: 0.058,
  routeLineGlowAlpha: 0.48,
  nightLightsAlpha: 0.42,
  shadowMul: 0.0,
  dayMul: 0.0
}

let visualTriOpacityMul = 1
let visualTriShimmerMul = 1
let visualLatLonOpacityMul = 1
let visualLatLonShimmerMul = 1
let visualLightingShadowMul = 1
let visualLightingDayMul = 1

function applyVisualPreset() {
  const cfg = DRAMATIC_VISUAL_PRESET

  scene.background = new THREE.Color(cfg.sceneBg)

  if (innerSphereMesh && innerSphereMesh.material instanceof THREE.MeshBasicMaterial) {
    // Keep the globe interior exactly equal to the space background.
    innerSphereMesh.material.color.setHex(cfg.sceneBg)
    innerSphereMesh.visible = false
  }
  if (depthMaskMesh && depthMaskMesh.material instanceof THREE.MeshBasicMaterial) {
    depthMaskMesh.material.color.setHex(cfg.sceneBg)
  }
  if (lightingShell) {
    lightingShell.group.visible = false
  }

  if (landWater) {
    const u = landWater.material.uniforms as any
    if (u.uLandAlpha) u.uLandAlpha.value = cfg.landAlpha
    if (u.uCoastAlpha) u.uCoastAlpha.value = cfg.coastAlpha
  }

  if (countriesLines) {
    countriesLines.setStyle({
      opacity: cfg.borderCoreOpacity,
      color: 0xffffff,
      lineWidth: cfg.borderLineWidth
    })
  }

  if (languagePoints) {
    const u = languagePoints.material.uniforms as any
    if (u.uAlphaMul) u.uAlphaMul.value = cfg.dotAlpha
    if (u.uSizeMul) u.uSizeMul.value = scaleThickness(cfg.dotSizeMul)
  }

  if (flightRoutes) {
    const planeMat = flightRoutes.planes.material as THREE.ShaderMaterial
    const lineMat = flightRoutes.lines.material as THREE.ShaderMaterial
    const p = planeMat.uniforms as any
    const l = lineMat.uniforms as any
    if (p.uAlpha) p.uAlpha.value = cfg.planeAlpha
    if (p.uSizeMul) p.uSizeMul.value = scaleThickness(cfg.planeSizeMul)
    if (l.uBaseAlpha) l.uBaseAlpha.value = cfg.routeLineBaseAlpha
    if (l.uGlowAlpha) l.uGlowAlpha.value = cfg.routeLineGlowAlpha
  }

  if (nightLights) {
    const u = nightLights.material.uniforms as any
    if (u.uAlpha) u.uAlpha.value = cfg.nightLightsAlpha
  }

  if (atmosphere) {
    ;(atmosphere.materials.inner.uniforms as any).uIntensity.value = cfg.atmoInner
    ;(atmosphere.materials.outer.uniforms as any).uIntensity.value = cfg.atmoOuter
    ;(atmosphere.materials.subsurface.uniforms as any).uIntensity.value = cfg.atmoSubsurface
  }

  visualTriOpacityMul = cfg.triGridOpacityMul
  visualTriShimmerMul = cfg.triGridShimmerMul
  visualLatLonOpacityMul = cfg.latLonGridOpacityMul
  visualLatLonShimmerMul = cfg.latLonGridShimmerMul
  visualLightingShadowMul = cfg.shadowMul
  visualLightingDayMul = cfg.dayMul
}

/**
 * Story mode (presets)
 */
type StoryPresetId = 'global' | 'americas' | 'europe' | 'africa' | 'asia'

const storyCaptionEl = document.getElementById('story-caption') as HTMLDivElement | null
const storyButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('#globe-ui [data-story]')
)
const heroTitleEl = document.getElementById('hero-title') as HTMLHeadingElement | null
const heroSubtitleEl = document.getElementById('hero-subtitle') as HTMLParagraphElement | null
const heroCopyEl = document.getElementById('hero-copy') as HTMLDivElement | null
const storyPanel = document.querySelector('#globe-ui .ui-story') as HTMLDivElement | null
const railZoomIn = document.getElementById('rail-zoom-in') as HTMLButtonElement | null
const railZoomOut = document.getElementById('rail-zoom-out') as HTMLButtonElement | null
const railInfo = document.getElementById('rail-info') as HTMLButtonElement | null
const defaultHeroTitleHTML = heroTitleEl?.innerHTML ?? ''
const defaultHeroSubtitle = heroSubtitleEl?.textContent ?? ''
const SHOW_HERO_HEADLINE = false

if (!SHOW_HERO_HEADLINE && heroCopyEl) {
  heroCopyEl.style.display = 'none'
}

function setDefaultHeroCopy() {
  document.body.classList.remove('country-selected')
  if (heroTitleEl) {
    heroTitleEl.innerHTML = defaultHeroTitleHTML
  }
  if (heroSubtitleEl) {
    heroSubtitleEl.textContent = defaultHeroSubtitle
  }
}

function setCountryHeroCopy(countryName: string) {
  const safeName = escapeHtml(countryName)
  document.body.classList.add('country-selected')
  if (heroTitleEl) {
    heroTitleEl.innerHTML = `${safeName} <span class="accent">economic growth</span> starts from <span class="accent">above</span>.`
  }
  if (heroSubtitleEl) {
    heroSubtitleEl.textContent = ''
  }
}

const STORY_PRESETS: Record<
  StoryPresetId,
  | {
      caption: string
      zoom: number
      centerLat: number
      centerLon: number
      spotRadiusDeg: number
      ringRadiusDeg: number
    }
  | {
      caption: string
      zoom: number
      centerLat: null
      centerLon: null
      spotRadiusDeg: null
      ringRadiusDeg: null
    }
> = {
  global: {
    caption: 'Global overview',
    zoom: 25,
    centerLat: null,
    centerLon: null,
    spotRadiusDeg: null,
    ringRadiusDeg: null
  },
  americas: {
    caption: 'Americas — transatlantic + intercontinental corridors',
    zoom: 21,
    centerLat: 14,
    centerLon: -82,
    spotRadiusDeg: 56,
    ringRadiusDeg: 46
  },
  europe: {
    caption: 'Europe — dense regional network',
    zoom: 20,
    centerLat: 51,
    centerLon: 10,
    spotRadiusDeg: 34,
    ringRadiusDeg: 28
  },
  africa: {
    caption: 'Africa — growing hubs + long-haul gateways',
    zoom: 21,
    centerLat: 6,
    centerLon: 20,
    spotRadiusDeg: 52,
    ringRadiusDeg: 42
  },
  asia: {
    caption: 'Asia — high-density east/southeast networks',
    zoom: 20,
    centerLat: 28,
    centerLon: 100,
    spotRadiusDeg: 62,
    ringRadiusDeg: 52
  }
}

let activeStoryPreset: StoryPresetId = 'global'

function applyHeatmap(enabled: boolean) {
  if (heatmapThumb) {
    heatmapThumb.style.transform = enabled ? 'translateX(20px)' : 'translateX(0px)'
  }
  flightRoutes?.setHeatmapEnabled(enabled)
}

if (heatmapToggle) {
  heatmapToggle.addEventListener('change', () => {
    applyHeatmap(heatmapToggle.checked)
  })
}

/**
 * Globe group
 */
const globeGroup = new THREE.Group()
scene.add(globeGroup)

/**
 * OrbitControls: zoom only
 */
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.enableRotate = false
controls.enablePan = false
controls.enableZoom = true
controls.minDistance = 14
controls.maxDistance = 40
controls.target.set(0, 0, 0)
controls.update()

/**
 * Smooth zoom animation (used by Story mode presets)
 */
let zoomAnim: { t0: number; dur: number; from: number; to: number } | null = null
const _camDir = new THREE.Vector3()

function setCameraDistance(distance: number) {
  const clamped = THREE.MathUtils.clamp(distance, controls.minDistance, controls.maxDistance)
  _camDir.copy(camera.position).normalize()
  camera.position.copy(_camDir.multiplyScalar(clamped))
}

function zoomTo(distance: number, durationMs = 900) {
  zoomAnim = {
    t0: performance.now(),
    dur: durationMs,
    from: camera.position.length(),
    to: distance
  }
}

controls.addEventListener('start', () => {
  // If the user zooms manually, stop scripted zoom so it doesn't "fight" them.
  markUserInteracted()
  zoomAnim = null
})

function zoomByStep(delta: number) {
  const currentDistance = camera.position.length()
  const targetDistance = THREE.MathUtils.clamp(
    currentDistance + delta,
    controls.minDistance,
    controls.maxDistance
  )
  if (Math.abs(targetDistance - currentDistance) < 0.01) return
  zoomTo(targetDistance, 280)
}

if (railZoomIn) {
  railZoomIn.addEventListener('click', () => {
    zoomByStep(-2.4)
  })
}

if (railZoomOut) {
  railZoomOut.addEventListener('click', () => {
    zoomByStep(2.4)
  })
}

if (railInfo && storyPanel) {
  const setInfoVisualState = () => {
    const collapsed = storyPanel.classList.contains('is-collapsed')
    railInfo.style.borderColor = collapsed
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(255, 255, 255, 0.46)'
  }

  setInfoVisualState()

  railInfo.addEventListener('click', () => {
    const nextCollapsed = !storyPanel.classList.contains('is-collapsed')
    storyPanel.classList.toggle('is-collapsed', nextCollapsed)
    setInfoVisualState()
  })
}

for (const topLink of document.querySelectorAll<HTMLAnchorElement>('#figma-shell a[href=\"#\"]')) {
  topLink.addEventListener('click', (ev) => {
    ev.preventDefault()
  })
}

/**
 * Drag to rotate globe
 */
let isDragging = false
let lastX = 0
let lastY = 0
const ROTATE_SPEED = 0.00245

let velYaw = 0
let velPitch = 0
let lastMoveTime = performance.now()
let peakVelYaw = 0
let peakVelPitch = 0
let lastYawDragSign = 0

const INERTIA = 0.94          // atrito (0.85..0.95) — maior = freada mais suave
const MAX_VEL = 0.52          // rad/s (limita velocidade pra não “pirar”)
const MAX_DRAG_STEP_RAD = THREE.MathUtils.degToRad(1.15)
const RELEASE_SPIN_TRIGGER_DISTANCE = 170
const RELEASE_SPIN_TRIGGER_SPEED = 0.14
const RELEASE_SPIN_MIN = 0.10
const RELEASE_SPIN_MAX = 0.30
const RELEASE_SPIN_BOOST = 0.055
const RELEASE_PITCH_DAMP = 0.42
const CLICK_DRAG_THRESHOLD = 4 // px: acima disso consideramos que foi drag
const AUTO_ROTATE_SPEED = THREE.MathUtils.degToRad(0.30)
const AUTO_ROTATE_BREAK_CYCLE_SEC = 20.0
const AUTO_ROTATE_BREAK_WINDOW_SEC = 5.2
const AUTO_ROTATE_BREAK_MIN_FACTOR = 0.42
let dragDistance = 0
let dragSuppressUntil = 0
let activePointerId: number | null = null
let dragStartTime = 0
let focusDimBase = 0
let focusDimFlash = 0
let hasUserInteracted = false
let hoveredCountryRouteFocusIso3: string | null = null

function markUserInteracted() {
  hasUserInteracted = true
}

function getIdleAutoRotateFactor(timeSeconds: number) {
  const phaseSec = timeSeconds % AUTO_ROTATE_BREAK_CYCLE_SEC
  if (phaseSec > AUTO_ROTATE_BREAK_WINDOW_SEC) return 1

  const t = THREE.MathUtils.clamp(phaseSec / AUTO_ROTATE_BREAK_WINDOW_SEC, 0, 1)
  // Smooth brake envelope: gentle slow-down and recovery (no hard "stop" feel).
  const wave = 0.5 - 0.5 * Math.cos(Math.PI * 2 * t)
  const brake = Math.pow(wave, 1.35)
  return 1.0 - brake * (1.0 - AUTO_ROTATE_BREAK_MIN_FACTOR)
}

function clampDragDelta(deltaRad: number) {
  return Math.tanh(deltaRad / MAX_DRAG_STEP_RAD) * MAX_DRAG_STEP_RAD
}

function resetDragState() {
  isDragging = false
  activePointerId = null
  dragDistance = 0
  peakVelYaw = 0
  peakVelPitch = 0
  lastYawDragSign = 0
}

function isEventOverUI(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest('#globe-ui') ||
    target.closest('#ui-toggle') ||
    target.closest('#figma-shell') ||
    target.closest('#flight-route-label')
  )
}


function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (activePointerId !== null) return
  markUserInteracted()
  isDragging = true
  dragDistance = 0
  lastX = e.clientX
  lastY = e.clientY
  dragStartTime = performance.now()
  lastMoveTime = performance.now()
  velYaw = 0
  velPitch = 0
  peakVelYaw = 0
  peakVelPitch = 0
  lastYawDragSign = 0
  if (globeAnim) {
    // If the user grabs the globe mid-focus animation, sync angles to avoid a jump.
    syncYawPitchFromGlobe()
  }
  globeAnim = null
  zoomAnim = null
  activePointerId = e.pointerId
  if (renderer.domElement.setPointerCapture) {
    renderer.domElement.setPointerCapture(e.pointerId)
  }
}

function onPointerMove(e: PointerEvent) {
  if (activePointerId !== e.pointerId) return
  if (!isDragging) return

  const dx = e.clientX - lastX
  // Tela: Y cresce para baixo. dy positivo = arrastar para baixo.
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
  dragDistance += Math.hypot(dx, dy)

  const now = performance.now()
  const dt = Math.max(1, now - lastMoveTime)
  lastMoveTime = now

  // Não aplica rotação antes de cruzar um limiar mínimo.
  // Isso evita "micro-jitter" virar rotação e melhora o reconhecimento click vs drag.
  if (dragDistance < CLICK_DRAG_THRESHOLD) {
    tooltip.hide()
    return
  }

  // se estiver animando foco, cancela (pra não brigar)
  globeAnim = null

  // acumula yaw/pitch e aplica sem roll
  const yawDelta = clampDragDelta(dx * ROTATE_SPEED)
  const pitchDelta = clampDragDelta(dy * ROTATE_SPEED)
  yawAccum += yawDelta
  // Pitch acompanha o movimento vertical do mouse (drag para baixo = inclina para baixo).
  pitchAccum = THREE.MathUtils.clamp(pitchAccum + pitchDelta, -maxPitch, maxPitch)

  applyYawPitchToGlobe()

  // velocidade para inércia (normaliza por tempo)
  const dtSeconds = dt / 1000
  const velYawPerSec = yawDelta / Math.max(0.0001, dtSeconds)
  const velPitchPerSec = pitchDelta / Math.max(0.0001, dtSeconds)
  velYaw = THREE.MathUtils.clamp(velYawPerSec, -MAX_VEL, MAX_VEL)
  velPitch = THREE.MathUtils.clamp(velPitchPerSec, -MAX_VEL, MAX_VEL)
  if (Math.abs(velYaw) > Math.abs(peakVelYaw)) peakVelYaw = velYaw
  if (Math.abs(velPitch) > Math.abs(peakVelPitch)) peakVelPitch = velPitch
  if (Math.abs(yawDelta) > 0.00005) {
    lastYawDragSign = Math.sign(yawDelta)
  }

  tooltip.hide() // (se você já estava fazendo)
}

function onPointerUp(e: PointerEvent) {
  if (activePointerId !== e.pointerId) return
  isDragging = false
  if (renderer.domElement.releasePointerCapture) {
    renderer.domElement.releasePointerCapture(e.pointerId)
  }
  activePointerId = null
  const heldMs = performance.now() - dragStartTime
  if (dragDistance > CLICK_DRAG_THRESHOLD) {
    const strongPull =
      dragDistance >= RELEASE_SPIN_TRIGGER_DISTANCE ||
      Math.abs(peakVelYaw) >= RELEASE_SPIN_TRIGGER_SPEED
    if (strongPull) {
      const spinSign =
        lastYawDragSign !== 0
          ? lastYawDragSign
          : (Math.abs(peakVelYaw) > 0.0001 ? Math.sign(peakVelYaw) : Math.sign(velYaw))
      const baseSpeed = Math.max(Math.abs(velYaw), Math.abs(peakVelYaw) * 0.55)
      const releaseSpeed = THREE.MathUtils.clamp(
        baseSpeed + RELEASE_SPIN_BOOST,
        RELEASE_SPIN_MIN,
        RELEASE_SPIN_MAX
      )
      if (spinSign !== 0) {
        velYaw = spinSign * releaseSpeed
      } else {
        velYaw = THREE.MathUtils.clamp(velYaw, -RELEASE_SPIN_MAX, RELEASE_SPIN_MAX)
      }
    } else {
      velYaw *= 0.78
    }
    velPitch = THREE.MathUtils.clamp(
      velPitch * RELEASE_PITCH_DAMP,
      -MAX_VEL * RELEASE_PITCH_DAMP,
      MAX_VEL * RELEASE_PITCH_DAMP
    )

    // Small hover cooldown after dragging so we don't "flash" a hover on release.
    const cooldown = heldMs < 160 ? 380 : 300
    dragSuppressUntil = performance.now() + cooldown
    return
  }

  // Click (on globe) — handle here (more reliable than window "click").
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (isEventOverUI(el)) return

  // Country selection gets priority over flight lines so country picking remains
  // reliable even when routes pass above it.
  const countryPick = getCountryPick(e.clientX, e.clientY)
  if (countryPick?.feature) {
    const iso3 = getISO3(countryPick.feature.properties)
    if (isCountrySelected && selectedCountryIso3 && iso3 === selectedCountryIso3) {
      clearHoverHighlight(globeGroup)
      tooltip.hide()
      lastHoverKey = ''
      return
    }
    selectCountryFeature(countryPick.feature, countryPick.worldPoint)
    return
  }

  const flightHit = getFlightHit(e.clientX, e.clientY, 0.14)
  if (flightHit) {
    clearHoverRouteCouplingCountry()
    // Toggle selection on the same route.
    if (selectedFlightRouteId === flightHit.routeId) {
      selectedFlightRouteId = null
      flightRoutes?.setSelectedRoute(null)
      setPinnedFlightRoute(null)
      tooltip.hide()
      if (!isCountrySelected) {
        focusDimBase = 0
        focusDimFlash = 0
        hideFocusDim()
      }
    } else {
      selectedFlightRouteId = flightHit.routeId
      flightRoutes?.setSelectedRoute(flightHit.routeId)
      flightRoutes?.setHoverRoute(null)
      showFlightTooltip(flightHit.routeId, e.clientX, e.clientY)
      setPinnedFlightRoute(flightHit.routeId)

      // Focus the globe to the arc midpoint (Google-style "route focus").
      const info = flightRoutes?.getRouteInfo(flightHit.routeId)
      if (info && Number.isFinite(Number(info.midX)) && Number.isFinite(Number(info.midY)) && Number.isFinite(Number(info.midZ))) {
        globeAnim = null
        velYaw = 0
        velPitch = 0
        globeGroup.updateMatrixWorld(true)
        const midWorld = globeGroup.localToWorld(new THREE.Vector3(Number(info.midX), Number(info.midY), Number(info.midZ)))
        focusGlobeToPoint(midWorld, 980)

        // Subtle zoom response: short routes feel closer, long-haul keeps context.
        const distanceKm = Number(info.distanceKm)
        zoomToSubtle(computeRouteZoomTarget(distanceKm), 980, 0.55)
      }

      // Light focus dim flash to help the route "pop" without overpowering the globe.
      showFocusDim()
      if (!isCountrySelected) {
        const distanceKm = Number(info?.distanceKm)
        const t = THREE.MathUtils.clamp((distanceKm - 600) / 10000, 0, 1)
        focusDimBase = THREE.MathUtils.lerp(0.16, 0.22, t)
      }
      focusDimFlash = Math.max(focusDimFlash, 0.22 + focusDimBase * 0.55)
    }
    return
  }

  pickCountryAt(e.clientX, e.clientY, { allowOceanClear: true })
}

function onPointerCancel(e: PointerEvent) {
  if (activePointerId !== e.pointerId) return
  resetDragState()
  velYaw = 0
  velPitch = 0
}


/**
 * Raycasting (picking)
 */
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

const pickSphere = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.001, 64, 64),
  new THREE.MeshBasicMaterial({ visible: false })
)
globeGroup.add(pickSphere)

/**
 * Focus animation (rotate globe quaternion)
 */
let globeAnim: {
  t0: number
  dur: number
  from: THREE.Quaternion
  to: THREE.Quaternion
} | null = null

function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

function estimateCountrySpanDeg(feature: any) {
  const geom = feature?.geometry
  if (!geom) return 24
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  let minLat = 90
  let maxLat = -90
  let minLon = 180
  let maxLon = -180

  for (const poly of polys) {
    for (const ring of poly) {
      for (const coord of ring) {
        const lon = Number(coord?.[0])
        const lat = Number(coord?.[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
        minLon = Math.min(minLon, lon)
        maxLon = Math.max(maxLon, lon)
      }
    }
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || minLat > maxLat) return 24

  const latSpan = Math.max(0.001, maxLat - minLat)
  const lonSpanRaw = Math.max(0.001, maxLon - minLon)
  const lonSpan = lonSpanRaw > 180 ? 360 - lonSpanRaw : lonSpanRaw
  const latCenter = (minLat + maxLat) * 0.5
  const lonSpanScaled = lonSpan * Math.cos(THREE.MathUtils.degToRad(latCenter))
  return Math.max(latSpan, Math.abs(lonSpanScaled))
}

function computeRouteZoomTarget(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return 22.5
  const t = THREE.MathUtils.clamp((distanceKm - 600) / 10000, 0, 1)
  return THREE.MathUtils.lerp(20.6, 24.6, t)
}

function computeCountryZoomTarget(spanDeg: number) {
  if (!Number.isFinite(spanDeg)) return 22.5
  const t = THREE.MathUtils.clamp((spanDeg - 7) / 55, 0, 1)
  return THREE.MathUtils.lerp(20.4, 24.8, t)
}

function zoomToSubtle(targetDistance: number, durationMs = 950, strength = 0.62) {
  const current = camera.position.length()
  const next = THREE.MathUtils.lerp(current, targetDistance, strength)
  if (Math.abs(next - current) < 0.25) return
  zoomTo(next, durationMs)
}

function focusGlobeToPoint(worldPoint: THREE.Vector3, durationMs = 1200) {
  // ponto clicado no espaço LOCAL do globo (estável)
  const localDir = globeGroup.worldToLocal(worldPoint.clone()).normalize()

  // 1) YAW (rotação em Y) para zerar X e alinhar para +Z
  const yaw = Math.atan2(localDir.x, localDir.z)
  _qYaw.setFromAxisAngle(_axisY, -yaw)

  // aplica yaw pra descobrir o pitch necessário
  const v1 = localDir.clone().applyQuaternion(_qYaw)

  // 2) PITCH (rotação em X) para zerar Y e alinhar para +Z
  const pitch = Math.atan2(v1.y, v1.z)
  _qPitch.setFromAxisAngle(_axisX, pitch)

  // quaternion alvo = pitch * yaw (ordem importa)
  const qTarget = _qPitch.clone().multiply(_qYaw).normalize()

  globeAnim = {
    t0: performance.now(),
    dur: durationMs,
    from: globeGroup.quaternion.clone(),
    to: qTarget
  }
}


const defaultGlobeQuat = globeGroup.quaternion.clone()
function resetGlobeRotation(durationMs = 900) {
  globeAnim = {
    t0: performance.now(),
    dur: durationMs,
    from: globeGroup.quaternion.clone(),
    to: defaultGlobeQuat.clone()
  }
  pitchAccum = 0
  yawAccum = 0
}

function setStoryUIActive(presetId: StoryPresetId) {
  activeStoryPreset = presetId
  for (const btn of storyButtons) {
    const id = btn.dataset.story
    btn.classList.toggle('is-active', id === presetId)
  }
  const cfg = STORY_PRESETS[presetId]
  if (storyCaptionEl) {
    storyCaptionEl.textContent = cfg.caption
  }
}

function clearSelectionUIState() {
  // Clear country selection / route selection, but keep the scene intact.
  clearHoverRouteCouplingCountry()
  setDefaultHeroCopy()
  tooltip.hide()
  lastHoverKey = ''
  clearHoverHighlight(globeGroup)
  fadeOutHover(globeGroup)

  selectedFlightRouteId = null
  flightRoutes?.setSelectedRoute(null)
  flightRoutes?.setHoverRoute(null)
  setPinnedFlightRoute(null)

  isCountrySelected = false
  selectedCountryIso3 = null
  flightRoutes?.setFocusCountry(null)
  clearHighlight(globeGroup)
  hideCountryPanel()

  focusDimBase = 0
  focusDimFlash = 0
  hideFocusDim()
}

function setStoryPreset(presetId: StoryPresetId) {
  markUserInteracted()
  setStoryUIActive(presetId)

  // Story mode is a "global navigation" feature: selecting a preset exits any
  // country/route focus so the highlight reads clearly.
  clearSelectionUIState()

  // Stop inertia so the transition feels deliberate.
  velYaw = 0
  velPitch = 0
  zoomAnim = null

  if (presetId === 'global') {
    storyHighlight?.setPreset(null)
    resetGlobeRotation(980)
    zoomTo(STORY_PRESETS.global.zoom, 980)
    return
  }

  const cfg = STORY_PRESETS[presetId]
  if (cfg.centerLat === null || cfg.centerLon === null) return

  // Focus to region center (yaw + pitch only; no roll).
  globeGroup.updateMatrixWorld(true)
  const focusWorld = globeGroup.localToWorld(
    latLongToVector3(cfg.centerLat, cfg.centerLon, GLOBE_RADIUS * 1.01)
  )
  focusGlobeToPoint(focusWorld, 1100)
  zoomTo(cfg.zoom, 1050)
  storyHighlight?.setPreset({
    centerLat: cfg.centerLat,
    centerLon: cfg.centerLon,
    spotRadiusDeg: cfg.spotRadiusDeg ?? 40,
    ringRadiusDeg: cfg.ringRadiusDeg ?? 30
  })

  // Light dim flash so the region "pops" without turning the screen into a modal.
  showFocusDim()
  focusDimBase = 0.14
  focusDimFlash = Math.max(focusDimFlash, 0.18)
}

function getFeatureLabel(feature: any) {
  return (
    feature.properties?.NAME_LONG ||
    feature.properties?.NAME_EN ||
    feature.properties?.ADMIN ||
    feature.properties?.NAME ||
    'Unknown'
  )
}

function getFeatureMeta(feature: any) {
  const props = feature.properties || {}
  const iso = props.ISO_A3 || props.ADM0_A3 || props.BRK_A3 || '—'
  const continent = props.CONTINENT || '—'
  return `${iso} • ${continent}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getISO2(props: any) {
  const candidates = [
    props?.ISO_A2,
    props?.ISO_A2_EH,
    props?.WB_A2,
    props?.ADM0_A3
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.length === 2 && value !== '-99') {
      return value
    }
  }
  return ''
}

function getISO3(props: any) {
  const candidates = [
    props?.ISO_A3,
    props?.ADM0_A3,
    props?.BRK_A3,
    props?.SU_A3
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value && value !== '-99') {
      return value
    }
  }
  return ''
}

function setHoverRouteCouplingCountry(iso3: string | null) {
  if (!flightRoutes) return
  if (isCountrySelected || selectedFlightRouteId !== null) return
  const normalized = iso3 && iso3 !== '-99' ? iso3 : null
  if (hoveredCountryRouteFocusIso3 === normalized) return
  hoveredCountryRouteFocusIso3 = normalized
  flightRoutes.setFocusCountry(normalized)
}

function clearHoverRouteCouplingCountry() {
  if (!flightRoutes) return
  if (hoveredCountryRouteFocusIso3 === null) return
  hoveredCountryRouteFocusIso3 = null
  if (!isCountrySelected && selectedFlightRouteId === null) {
    flightRoutes.setFocusCountry(null)
  }
}

function isoToFlagUrl(iso2: string) {
  if (!iso2) return ''
  return resolveAssetPath(`flags/${iso2.toLowerCase()}.svg`)
}

function compactAirportName(name: string) {
  return String(name || '')
    .replace(/\bInternational\b/gi, 'Intl')
    .replace(/\bAirport\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getFlightHit(clientX: number, clientY: number, lineThreshold = 0.14) {
  if (!flightRoutes) return null

  mouse.x = (clientX / window.innerWidth) * 2 - 1
  mouse.y = -(clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(mouse, camera)

  // Occlusion check: if the globe is in front, ignore the hit.
  const sphereHit = raycaster.intersectObject(pickSphere, false)[0]
  const sphereDist = sphereHit ? sphereHit.distance : Infinity

  // NOTE:
  // Planes are GPU-animated (their real positions live in the vertex shader),
  // so raycasting against the Points geometry can be inaccurate.
  // For stable hover/click, we raycast only against the route lines.
  ;(raycaster.params.Line as any).threshold = lineThreshold
  const lineHit = raycaster.intersectObject(flightRoutes.lines, false)[0]
  if (lineHit && lineHit.index !== undefined && lineHit.index !== null) {
    if (!Number.isFinite(sphereDist) || lineHit.distance <= sphereDist + 1e-4) {
      const geo = (lineHit.object as any).geometry as THREE.BufferGeometry | undefined
      const routeAttr = (geo?.getAttribute('aRouteId') ?? geo?.getAttribute('aAnim1')) as
        | THREE.BufferAttribute
        | undefined
      if (routeAttr) {
        const routeId =
          routeAttr.itemSize >= 3
            ? Math.round(routeAttr.getZ(lineHit.index))
            : Math.round(routeAttr.getX(lineHit.index))
        if (Number.isFinite(routeId)) {
          return { hit: lineHit, routeId }
        }
      }
    }
  }

  return null
}

function getCountryPick(clientX: number, clientY: number) {
  if (!countriesGeoJSON) return null

  mouse.x = (clientX / window.innerWidth) * 2 - 1
  mouse.y = -(clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(mouse, camera)

  const hit = raycaster.intersectObject(pickSphere, false)[0]
  if (!hit) return null

  const worldPoint = hit.point.clone()
  const localPoint = globeGroup.worldToLocal(worldPoint.clone())
  const { lat, lon } = vector3ToLatLon(localPoint)
  const feature = findCountryFeature(countriesGeoJSON, lat, lon)

  return { feature, worldPoint }
}

function showFlightTooltip(routeId: number, x: number, y: number) {
  if (!flightRoutes) return
  const info = flightRoutes.getRouteInfo(routeId)
  if (!info) return

  const isForward = Number(info.dir) >= 0
  const from = compactAirportName(isForward ? info.fromName : info.toName)
  const to = compactAirportName(isForward ? info.toName : info.fromName)
  const distanceKm = Number(info.distanceKm)
  const kmText = Number.isFinite(distanceKm) ? `${Math.round(distanceKm).toLocaleString('en-US')} km` : '— km'
  const trafficCount = Number(info.trafficCount)
  const trafficClamped = Number.isFinite(trafficCount) ? Math.max(1, Math.min(4, Math.round(trafficCount))) : NaN
  const trafficText = Number.isFinite(trafficClamped) ? `Traffic ${trafficClamped}/4` : 'Traffic —/4'

  const html = `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div style="font-size:12px;line-height:1.1;">${escapeHtml(from)} → ${escapeHtml(to)}</div>
      <div style="font-size:10px;opacity:.7;letter-spacing:.6px;text-transform:uppercase;">${escapeHtml(kmText)} • ${escapeHtml(trafficText)}</div>
    </div>
  `
  tooltip.showHTML(html, x, y)
}

function getFeatureFocusPoint(feature: any) {
  const props = feature.properties || {}
  let lat = Number(props.LABEL_Y)
  let lon = Number(props.LABEL_X)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const geom = feature.geometry
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
    const first = polys?.[0]?.[0]?.[0]
    if (first) {
      lon = Number(first[0])
      lat = Number(first[1])
    } else {
      lat = 0
      lon = 0
    }
  }

  return globeGroup.localToWorld(latLongToVector3(lat, lon, GLOBE_RADIUS * 1.01))
}

function selectCountryFeature(feature: any, worldPoint?: THREE.Vector3) {
  if (!feature) return
  const iso3 = getISO3(feature.properties)
  if (isCountrySelected && selectedCountryIso3 && iso3 === selectedCountryIso3) {
    return
  }
  // Country focus should not coexist with story preset ring/spotlight.
  storyHighlight?.setPreset(null)
  clearHoverRouteCouplingCountry()
  setCountryHeroCopy(getFeatureLabel(feature))
  fadeOutHover(globeGroup)
  tooltip.hide()
  highlightCountryFromFeature(feature, globeGroup, GLOBE_RADIUS)
  isCountrySelected = true
  selectedCountryIso3 = iso3 || null
  const flightsStats = flightRoutes ? flightRoutes.getCountryFlightStats(iso3, performance.now() * 0.001) : null
  showCountryPanel(feature.properties, flightsStats)
  selectedFlightRouteId = null
  flightRoutes?.setSelectedRoute(null)
  flightRoutes?.setHoverRoute(null)
  setPinnedFlightRoute(null)
  flightRoutes?.setFocusCountry(iso3)
  showFocusDim()
  const spanDeg = estimateCountrySpanDeg(feature)
  const sizeT = THREE.MathUtils.clamp((spanDeg - 7) / 55, 0, 1)
  focusDimBase = THREE.MathUtils.lerp(0.38, 0.28, sizeT)
  focusDimFlash = THREE.MathUtils.lerp(0.46, 0.34, sizeT)
  velYaw = 0
  velPitch = 0
  const focusPoint = worldPoint ?? getFeatureFocusPoint(feature)
  focusGlobeToPoint(focusPoint.clone(), 1200)

  // Subtle zoom: small countries get a touch closer; big ones keep context.
  zoomToSubtle(computeCountryZoomTarget(spanDeg), 1120, 0.6)
}

/**
 * Background stars
 */
let star: ReturnType<typeof createStarfieldShader> | null = null

/**
 * Country pick helper (raycast only against pickSphere).
 */
function pickCountryAt(clientX: number, clientY: number, options: { allowOceanClear?: boolean } = {}) {
  if (!countriesGeoJSON) return

  // Ignore interactions on top of UI elements.
  const el = document.elementFromPoint(clientX, clientY)
  if (isEventOverUI(el)) return

  const allowOceanClear = options.allowOceanClear ?? true
  const pick = getCountryPick(clientX, clientY)
  if (!pick) return
  const { feature, worldPoint } = pick

  // oceano
  if (!feature) {
    globeAnim = null
    velYaw = 0
    velPitch = 0
    if (allowOceanClear) {
      clearSelectionUIState()
    }
    return
  }

  const iso3 = getISO3(feature.properties)
  if (isCountrySelected && selectedCountryIso3 && iso3 === selectedCountryIso3) {
    return
  }

  selectCountryFeature(feature, worldPoint)
}

function onPointerHover(e: PointerEvent) {
  renderer.domElement.style.cursor = 'default'
  if (!countriesGeoJSON) return

  // Don't hover through UI.
  const elUnderPointer = document.elementFromPoint(e.clientX, e.clientY)
  if (isEventOverUI(elUnderPointer)) {
    clearHoverRouteCouplingCountry()
    flightRoutes?.setHoverRoute(null)
    clearHoverHighlight(globeGroup)
    tooltip.hide()
    lastHoverKey = ''
    renderer.domElement.style.cursor = 'default'
    return
  }

  // durante drag, não faz hover (fica muito mais "Google")
  if (isDragging) {
    clearHoverRouteCouplingCountry()
    flightRoutes?.setHoverRoute(null)
    clearHoverHighlight(globeGroup)
    tooltip.hide()
    lastHoverKey = ''
    renderer.domElement.style.cursor = 'default'
    return
  }

  // After a drag, give a tiny cooldown before showing hover again.
  if (performance.now() < dragSuppressUntil) {
    clearHoverRouteCouplingCountry()
    flightRoutes?.setHoverRoute(null)
    clearHoverHighlight(globeGroup)
    tooltip.hide()
    lastHoverKey = ''
    renderer.domElement.style.cursor = 'default'
    return
  }

  // Flight hover (prioritário): rota/avião por cima do país.
  const flightHit = getFlightHit(e.clientX, e.clientY, 0.16)
  if (flightHit) {
    clearHoverRouteCouplingCountry()
    clearHoverHighlight(globeGroup)
    lastHoverKey = ''
    flightRoutes?.setHoverRoute(flightHit.routeId)
    renderer.domElement.style.cursor = 'pointer'
    showFlightTooltip(flightHit.routeId, e.clientX, e.clientY)
    return
  } else {
    flightRoutes?.setHoverRoute(null)
  }

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(mouse, camera)

  const hit = raycaster.intersectObject(pickSphere, false)[0]
  if (!hit) {
    clearHoverRouteCouplingCountry()
    clearHoverHighlight(globeGroup)
    tooltip.hide()
    lastHoverKey = ''
    renderer.domElement.style.cursor = 'default'
    return
  }

  const localPoint = globeGroup.worldToLocal(hit.point.clone())
  const { lat, lon } = vector3ToLatLon(localPoint)
  const feature = findCountryFeature(countriesGeoJSON, lat, lon)

  if (!feature) {
    clearHoverRouteCouplingCountry()
    clearHoverHighlight(globeGroup)
    tooltip.hide()
    lastHoverKey = ''
    renderer.domElement.style.cursor = 'default'
    return
  }

  const iso3 = getISO3(feature.properties)
  if (isCountrySelected && selectedCountryIso3 && iso3 === selectedCountryIso3) {
    clearHoverRouteCouplingCountry()
    clearHoverHighlight(globeGroup)
    tooltip.hide()
    lastHoverKey = ''
    renderer.domElement.style.cursor = 'default'
    return
  }

  // evita recalcular highlight a cada pixel
  const key = feature.properties?.ISO_A3 || feature.properties?.ADMIN || feature.properties?.NAME || 'country'
  if (key !== lastHoverKey) {
    lastHoverKey = key
    setHoverHighlight(feature, globeGroup, GLOBE_RADIUS)
  }
  setHoverRouteCouplingCountry(iso3)

  const name =
    feature.properties?.ADMIN ||
    feature.properties?.NAME ||
    feature.properties?.NAME_EN ||
    'Country'

  renderer.domElement.style.cursor = 'pointer'

  const iso2 = getISO2(feature.properties)
  const flagUrl = isoToFlagUrl(iso2)
  const meta = getFeatureMeta(feature)
  if (iso2) {
    const html = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <div style="font-size:12px;line-height:1.1;">${escapeHtml(name)}</div>
          <div style="font-size:10px;opacity:.7;letter-spacing:.6px;text-transform:uppercase;">${escapeHtml(meta)}</div>
        </div>
        <img src="${flagUrl}" alt="" style="height:28px;width:auto;border-radius:2px;display:block;" onerror="this.style.display='none'">
      </div>
    `
    tooltip.showHTML(html, e.clientX, e.clientY)
  } else {
    tooltip.show(name, e.clientX, e.clientY)
  }
}

/**
 * Render loop
 */
function animate() {
  requestAnimationFrame(animate)
  const now = performance.now() * 0.001
  const nowMs = now * 1000
  const lastTime = (animate as any)._lastTime ?? now
  const deltaSeconds = Math.min(0.05, Math.max(0, now - lastTime))
  ;(animate as any)._lastTime = now

  if (zoomAnim) {
    const tt = (performance.now() - zoomAnim.t0) / zoomAnim.dur
    const k = easeInOutSine(Math.min(1, Math.max(0, tt)))
    const dist = THREE.MathUtils.lerp(zoomAnim.from, zoomAnim.to, k)
    setCameraDistance(dist)
    if (tt >= 1) {
      zoomAnim = null
    }
  }

  const cameraDistance = camera.position.length()
  updateHoverHighlight(globeGroup, now, cameraDistance)
  updateCountryHighlight(now)
  storyHighlight?.update(now, cameraDistance)

  if (focusDimBase > 0 || focusDimFlash > 0) {
    focusDimFlash *= 0.96
    if (focusDimFlash < 0.01) focusDimFlash = 0
    setFocusDimOpacity(Math.min(0.65, focusDimBase + focusDimFlash))
  }

  if (globeAnim) {
    const tt = (performance.now() - globeAnim.t0) / globeAnim.dur
    const k = easeInOutSine(Math.min(1, Math.max(0, tt)))
    globeGroup.quaternion.copy(globeAnim.from).slerp(globeAnim.to, k)
    if (tt >= 1) {
      globeAnim = null
      syncYawPitchFromGlobe()
    }
  }

  if (triGrid) {
    triGrid.update(cameraDistance)
  }
  if (latLonGrid) {
    latLonGrid.update(cameraDistance)
  }
  {
    const u = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 14, 40, 0.0, 1.0),
      0,
      1
    )
    const zoom01 = 1 - u
    const rolloff = THREE.MathUtils.lerp(1.25, 1.6, u)
    if (triGrid) {
      triGrid.materials.forEach(mat => {
        const base = mat.userData.baseRolloff ?? 1.35
        mat.uniforms.uRolloff.value = base * (rolloff / 1.35)
        ;(mat.uniforms as any).uTime.value = now
        if (mat.userData.baseOpacity === undefined) {
          mat.userData.baseOpacity = mat.opacity
        }
        const lodAlpha = Number(mat.userData.lodAlpha ?? 1)
        mat.opacity = Number(mat.userData.baseOpacity) * visualTriOpacityMul * lodAlpha
        const baseShimmer = mat.userData.baseShimmerStrength ?? (mat.uniforms as any).uShimmerStrength?.value ?? 0
        if ((mat.uniforms as any).uShimmerStrength) {
          ;(mat.uniforms as any).uShimmerStrength.value = baseShimmer * visualTriShimmerMul * (0.35 + 0.65 * zoom01)
        }
      })
    }
    if (latLonGrid) {
      latLonGrid.materials.forEach(mat => {
        const base = mat.userData.baseRolloff ?? 1.35
        mat.uniforms.uRolloff.value = base * (rolloff / 1.35)
        ;(mat.uniforms as any).uTime.value = now
        if (mat.userData.baseOpacity === undefined) {
          mat.userData.baseOpacity = mat.opacity
        }
        const lodAlpha = Number(mat.userData.lodAlpha ?? 1)
        mat.opacity = Number(mat.userData.baseOpacity) * visualLatLonOpacityMul * lodAlpha
        const baseShimmer = mat.userData.baseShimmerStrength ?? (mat.uniforms as any).uShimmerStrength?.value ?? 0
        if ((mat.uniforms as any).uShimmerStrength) {
          ;(mat.uniforms as any).uShimmerStrength.value = baseShimmer * visualLatLonShimmerMul * (0.25 + 0.60 * zoom01)
        }
      })
    }
  }
  if (languagePoints) {
    languagePoints.material.uniforms.uTime.value = now
    languagePoints.material.uniforms.uCameraDistance.value = cameraDistance
  }
  if (flightRoutes) {
    flightRoutes.update(deltaSeconds, now, cameraDistance)
  }
  if (star) {
    const mat = star.material as THREE.ShaderMaterial
    if (mat.uniforms?.uTime) {
      mat.uniforms.uTime.value = now
    }
  }

  if (!isDragging && !globeAnim) {
    const hasMomentum = Math.abs(velYaw) > 0.00001 || Math.abs(velPitch) > 0.00001

    if (hasMomentum) {
      // aplica inércia via quaternions (sem Euler)
      if (Math.abs(velYaw) > 0.00001) {
        yawAccum += velYaw * deltaSeconds
      }

      if (Math.abs(velPitch) > 0.00001) {
        pitchAccum = THREE.MathUtils.clamp(pitchAccum + velPitch * deltaSeconds, -maxPitch, maxPitch)
      }

      applyYawPitchToGlobe()

      const damping = Math.pow(INERTIA, deltaSeconds * 60)
      velYaw *= damping
      velPitch *= damping

      // “corta” quando ficar imperceptível (evita drift infinito)
      if (Math.abs(velYaw) < 0.00001) velYaw = 0
      if (Math.abs(velPitch) < 0.00001) velPitch = 0
    } else if (!hasUserInteracted && !isCountrySelected && selectedFlightRouteId === null) {
      // Very slow idle rotation with periodic "breaks" (Google-like breathing pace).
      const brakeFactor = getIdleAutoRotateFactor(now)
      yawAccum += AUTO_ROTATE_SPEED * brakeFactor * deltaSeconds
      applyYawPitchToGlobe()
    }
  }

  // Sun direction (Earth-fixed): update a few times per second, then rotate with the globe
  // so day/night remains anchored to geography even though we rotate the globe (camera is fixed).
  if (lightingShell || atmosphere) {
    if (nowMs - _lastSunUpdateMs > 1500) {
      _sunLocalDir.copy(getSunDirectionUTC(new Date()))
      _lastSunUpdateMs = nowMs
    }
    _sunWorldDir.copy(_sunLocalDir).applyQuaternion(globeGroup.quaternion)
  }

  if (lightingShell) {
    const sun = _sunWorldDir
    const strength = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 14, 40, 0.26, 0.16),
      0.16,
      0.26
    )
    const softness = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 14, 40, 0.26, 0.38),
      0.26,
      0.38
    )
    lightingShell.nightMaterial.uniforms.uLightDir.value.copy(sun)
    lightingShell.nightMaterial.uniforms.uShadowStrength.value = strength * visualLightingShadowMul
    lightingShell.nightMaterial.uniforms.uTerminatorSoftness.value = softness

    const baseDayStrength = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 14, 40, 0.082, 0.046),
      0.046,
      0.082
    )
    const dayPulse = 0.93 + 0.07 * Math.sin(now * 0.35)
    const dayStrength = baseDayStrength * dayPulse
    lightingShell.dayMaterial.uniforms.uLightDir.value.copy(sun)
    lightingShell.dayMaterial.uniforms.uDayStrength.value = dayStrength * visualLightingDayMul
  }
  if (atmosphere) {
    atmosphere.setLightDir(_sunWorldDir)
  }
  if (nightLights) {
    nightLights.update(now, cameraDistance, _sunWorldDir)
  }

  // Postprocessing uniforms.
  if (vignettePass?.material?.uniforms?.uTime) {
    vignettePass.material.uniforms.uTime.value = now
  }

  // Subtle bloom zoom response (near = richer, far = cleaner).
  if (bloomPass) {
    const zoom = THREE.MathUtils.clamp((32 - cameraDistance) / 16, 0, 1)
    bloomPass.strength = THREE.MathUtils.lerp(0.11, 0.18, zoom)
  }

  controls.update()
  updatePinnedFlightRouteLabelPosition()
  if (composer) {
    composer.render(deltaSeconds)
  } else {
    renderer.render(scene, camera)
  }
}

/**
 * Init
 */
async function init() {
  depthMaskMesh = createDepthMaskSphere(GLOBE_RADIUS)
  globeGroup.add(depthMaskMesh)
  // ⭐ starfield (não dentro do globeGroup!)
  star = createStarfieldShader({ count: 7000, radius: 420, size: 0.9, opacity: 0.65 })
  scene.add(star.points)

  // layers
  innerSphereMesh = createInnerSphere(GLOBE_RADIUS)
  globeGroup.add(innerSphereMesh)
  lightingShell = createLightingShell(GLOBE_RADIUS)
  globeGroup.add(lightingShell.group)

  // Story mode highlight layer (region spotlight + ring).
  if (ENABLE_STORY_HIGHLIGHT) {
    storyHighlight = createStoryHighlight(GLOBE_RADIUS)
    globeGroup.add(storyHighlight.group)
  }

  const geojson = await loadGeoJSON(COUNTRIES_GEOJSON_PATH)
  countriesGeoJSON = geojson

  // Single source of truth for all country-driven layers (render + hover + lookup).
  landWater = createLandWaterLayer(geojson, GLOBE_RADIUS)
  globeGroup.add(landWater.mesh)

  countriesLines = createCountries(geojson, GLOBE_RADIUS, camera)
  globeGroup.add(countriesLines.lines)

  triGrid = createAdaptiveTriGrid(GLOBE_RADIUS, camera)
  globeGroup.add(triGrid.group)

  latLonGrid = createAdaptiveLatLonGrid(GLOBE_RADIUS, camera)
  globeGroup.add(latLonGrid.group)

  const baseAirports = await fetch(resolveAssetPath('data/airports_points.json')).then(r => r.json())
  const denseAirports = inflateAirportsDataset(baseAirports, countriesGeoJSON, {
    targetCount: SYNTHETIC_AIRPORT_TARGET,
    minSpacingDeg: AIRPORT_MIN_SPACING_DEG
  })
  const baseCount = Array.isArray(baseAirports) ? baseAirports.length : 0
  console.info(
    `[airports] base=${baseCount} land_spaced=${denseAirports.length} spacingDeg=${AIRPORT_MIN_SPACING_DEG}`
  )
  if (SHOW_GLOBE_POINTS) {
    languagePoints = createLanguagePoints(denseAirports, GLOBE_RADIUS)
    globeGroup.add(languagePoints.points)

    nightLights = createNightLights(denseAirports, GLOBE_RADIUS)
    globeGroup.add(nightLights.points)
  } else {
    languagePoints = null
    nightLights = null
  }

  flightRoutes = createFlightRoutes(denseAirports, GLOBE_RADIUS, countriesGeoJSON, MOCK_FLIGHT_ROUTE_COUNT)
  console.info(`[flights] mocked_routes=${MOCK_FLIGHT_ROUTE_COUNT} source_airports=${denseAirports.length}`)
  globeGroup.add(flightRoutes.group)
  applyHeatmap(initialHeatmapEnabled)

  atmosphere = createAtmosphere(GLOBE_RADIUS, camera)
  globeGroup.add(atmosphere.group)

  applyVisualPreset()

  // events
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  renderer.domElement.addEventListener('pointerleave', onPointerCancel)
  window.addEventListener('blur', () => {
    resetDragState()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      resetDragState()
    }
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearSelectionUIState()
    }
  })

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    updatePostprocessSize()
  })

  window.addEventListener('pointermove', onPointerHover)

  // Story mode pills (Global / Americas / Europe).
  for (const btn of storyButtons) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.story
      if (id === 'global' || id === 'americas' || id === 'europe' || id === 'africa' || id === 'asia') {
        setStoryPreset(id)
      }
    })
  }
  setStoryUIActive(activeStoryPreset)

  animate()
}

  const ready = init()
  return { ready }
}
