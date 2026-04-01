import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { createDepthMaskSphere } from './globe/depthMask'
import { createLanguagePoints } from './globe/languagePoints'
import { createCountries } from './globe/countries'
import { createAtmosphere } from './globe/atmosphere'
import { createInnerSphere } from './globe/innerSphere'
import { createLightingShell } from './globe/lighting'
import { latLongToVector3 } from './globe/latLongtoVector3'
import { createFlightRoutes, type FlightRoutesLayer, type FlightVisualizationMode } from './globe/flights'
import { getSunDirectionUTC } from './globe/solar'
import { loadGeoJSON } from './loaders/loadGeoJSON'

import {
  highlightCountryFromFeature,
  clearHighlight,
  updateCountryHighlight,
  configureCountryHighlightPalette,
  setSelectedBorderLineWidth,
  setSelectBackingEnabled,
  setCountryGlowEnabled,
  syncCountryHighlightResolution,
  setHighlightRenderMode as setHoverHighlightRenderMode
} from './globe/countryHighlight'
import { vector3ToLatLon } from './globe/math'
import { findCountryFeature } from './globe/countryLookUp'
import {
  ensureCountryPanelScaffold,
  configureGlobeUi,
  setGlobeBreadcrumbs,
  showCountryPanel,
  hideCountryPanel,
  showFocusDim,
  hideFocusDim
} from './scene/camera'
import { createAdaptiveLatLonGrid } from './globe/grid'
import { createAdaptiveTriGrid } from './globe/tridGrid'
import { createNightLights } from './globe/nightLights'
import { createLandWaterLayer } from './globe/landWater'

import { createStarfieldShader } from './background/starfieldShaders'
import { createTooltip } from './ui/tooltip'
import { createAnimatedCards } from './ui/animatedCards'
import {
  setSelectedHighlight,
  clearSelectedHighlight,
  updateSelectedHighlight,
  fadeOutSelected,
  configureSelectedHighlightColors,
  setSelectedBorderLineWidth as setSelectHighlightLineWidth,
  setHighlightRenderMode
} from './globe/hoverHighlight'
import { scaleThickness } from './globe/thicknessScale'
import { inflateAirportsDataset } from './globe/syntheticAirports'

export type GlobeSceneTheme = {
  background: THREE.ColorRepresentation
  depthMask: THREE.ColorRepresentation
  innerSphere: THREE.ColorRepresentation
}

export type GlobeCountriesTheme = {
  border: THREE.ColorRepresentation
}

export type GlobeGridTheme = {
  triColor: THREE.ColorRepresentation
  triShimmerColor: THREE.ColorRepresentation
  latLonColor: THREE.ColorRepresentation
  latLonShimmerColor: THREE.ColorRepresentation
}

export type GlobeLandWaterTheme = {
  landTint: THREE.ColorRepresentation
  coastTint: THREE.ColorRepresentation
}

export type GlobeAtmosphereTheme = {
  innerCore: THREE.ColorRepresentation
  innerRim: THREE.ColorRepresentation
  outerCore: THREE.ColorRepresentation
  outerRim: THREE.ColorRepresentation
  subsurfaceCore: THREE.ColorRepresentation
  subsurfaceRim: THREE.ColorRepresentation
  /**
   * Optional multiplicative tint applied to all atmosphere layers at once.
   * White (`#ffffff`) is a no-op and leaves layer colors unchanged.
   * Set to any hue (e.g. `#FF9F40` for amber) to recolor the entire glow.
   * Can be updated at runtime via `GlobeInstance.setGlowColor()`.
   */
  glowColor?: THREE.ColorRepresentation
}

export type GlobeLightingTheme = {
  shadow: THREE.ColorRepresentation
  day: THREE.ColorRepresentation
}

export type GlobePointsTheme = {
  dotColorMul: THREE.ColorRepresentation
  dotFlowColor: THREE.ColorRepresentation
  nightWarmA: THREE.ColorRepresentation
  nightWarmB: THREE.ColorRepresentation
}

export type GlobeFlightsTheme = {
  lineBaseColor: THREE.ColorRepresentation
  lineHeadColor: THREE.ColorRepresentation
  lineTailColor: THREE.ColorRepresentation
  lineAccentColor: THREE.ColorRepresentation
  planeCoreColor: THREE.ColorRepresentation
  planeGlowColor: THREE.ColorRepresentation
  planeTintColor: THREE.ColorRepresentation
  planeAccentColor: THREE.ColorRepresentation
  heatColdColor: THREE.ColorRepresentation
  heatMidColor: THREE.ColorRepresentation
  heatHotColor: THREE.ColorRepresentation
  heatEdgeAccentColor: THREE.ColorRepresentation
  endpointOriginColor: THREE.ColorRepresentation
  endpointDestColor: THREE.ColorRepresentation
  endpointAccentColor: THREE.ColorRepresentation
  pinHoverColor: THREE.ColorRepresentation
  pinSelectedColor: THREE.ColorRepresentation
  hubColorMul: THREE.ColorRepresentation
}

export type GlobeHighlightTheme = {
  hoverA: THREE.ColorRepresentation
  hoverB: THREE.ColorRepresentation
  hoverCore: THREE.ColorRepresentation
  hoverPaletteMix: number
  selectedA: THREE.ColorRepresentation
  selectedB: THREE.ColorRepresentation
  selectedC: THREE.ColorRepresentation
  selectedD: THREE.ColorRepresentation
}

export type GlobeTheme = {
  scene?: Partial<GlobeSceneTheme>
  countries?: Partial<GlobeCountriesTheme>
  grids?: Partial<GlobeGridTheme>
  landWater?: Partial<GlobeLandWaterTheme>
  atmosphere?: Partial<GlobeAtmosphereTheme>
  lighting?: Partial<GlobeLightingTheme>
  points?: Partial<GlobePointsTheme>
  flights?: Partial<GlobeFlightsTheme>
  highlights?: Partial<GlobeHighlightTheme>
}

type ResolvedGlobeTheme = {
  scene: GlobeSceneTheme
  countries: GlobeCountriesTheme
  grids: GlobeGridTheme
  landWater: GlobeLandWaterTheme
  atmosphere: GlobeAtmosphereTheme
  lighting: GlobeLightingTheme
  points: GlobePointsTheme
  flights: GlobeFlightsTheme
  highlights: GlobeHighlightTheme
}

type EnrichedFlightsFile = {
  flights?: Array<{
    id?: string | number
    cs?: string
    orig?: string
    dest?: string
    reg?: string
    type?: string
    air?: string
    olat: number
    olon: number
    dlat: number
    dlon: number
    path?: Array<[number, number]>
    segs?: Array<{
      country?: string
      enter?: string
      exit?: string
    }>
    snap_lat?: number
    snap_lon?: number
    snap_alt?: number
  }>
  airports?: Record<string, {
    code?: string
    icao?: string
    iata?: string
    name?: string
    lat?: number
    lon?: number
    elev?: number
    city?: string
    kind?: string
    country?: string
  }>
  country_stats?: Record<string, {
    in_air?: number
    arr?: number
    dep?: number
    dom?: number
    over?: number
    day_total?: number
    day_arr?: number
    day_dep?: number
    day_dom?: number
    day_over?: number
  }>
}

function mixColor(
  a: THREE.ColorRepresentation,
  b: THREE.ColorRepresentation,
  t: number
): THREE.ColorRepresentation {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex()
}

function scaleColor(color: THREE.ColorRepresentation, factor: number): THREE.ColorRepresentation {
  return new THREE.Color(color).multiplyScalar(factor).getHex()
}

const DEFAULT_SCENE_THEME: GlobeSceneTheme = {
  background: 0x091320,
  depthMask: 0x091320,
  innerSphere: 0x091320
}

const DEFAULT_COUNTRIES_THEME: GlobeCountriesTheme = {
  border: 0x4796ff
}

const DEFAULT_GRID_THEME: GlobeGridTheme = {
  triColor: 0xb8c0ce,
  triShimmerColor: 0xb8c0ce,
  latLonColor: 0xb8c0ce,
  latLonShimmerColor: 0xb8c0ce
}

const DEFAULT_LAND_WATER_THEME: GlobeLandWaterTheme = {
  landTint: mixColor('#12203a', '#8AB4F8', 0.38),
  coastTint: mixColor(mixColor('#12203a', '#8AB4F8', 0.38), '#ffffff', 0.3)
}

const DEFAULT_ATMOSPHERE_THEME: GlobeAtmosphereTheme = {
  innerCore: scaleColor('#1A73E8', 0.14),
  innerRim: mixColor('#8AB4F8', '#ffffff', 0.42),
  outerCore: scaleColor('#1A73E8', 0.08),
  outerRim: mixColor('#8AB4F8', '#ffffff', 0.56),
  subsurfaceCore: scaleColor('#1A73E8', 0.04),
  subsurfaceRim: mixColor('#8AB4F8', '#ffffff', 0.22)
}

const DEFAULT_LIGHTING_THEME: GlobeLightingTheme = {
  shadow: scaleColor(mixColor('#1A73E8', '#8AB4F8', 0.22), 0.62),
  day: mixColor('#8AB4F8', '#ffffff', 0.14)
}

const DEFAULT_POINTS_THEME: GlobePointsTheme = {
  dotColorMul: '#FBBC05',
  dotFlowColor: mixColor('#FBBC05', '#ffffff', 0.18),
  nightWarmA: mixColor('#FBBC05', '#ffffff', 0.35),
  nightWarmB: mixColor('#ffffff', '#FBBC05', 0.25)
}

const DEFAULT_FLIGHTS_THEME: GlobeFlightsTheme = {
  lineBaseColor: mixColor('#FBBC05', '#ffffff', 0.28),
  lineHeadColor: '#ffffff',
  lineTailColor: mixColor('#FBBC05', '#ffffff', 0.16),
  lineAccentColor: '#ffffff',
  planeCoreColor: mixColor('#ffffff', '#FBBC05', 0.22),
  planeGlowColor: mixColor('#FBBC05', '#ffffff', 0.16),
  planeTintColor: '#FBBC05',
  planeAccentColor: '#ffffff',
  heatColdColor: scaleColor('#1A73E8', 0.34),
  heatMidColor: scaleColor('#8AB4F8', 1.02),
  heatHotColor: mixColor('#FBBC05', '#ffffff', 0.32),
  heatEdgeAccentColor: '#ffffff',
  endpointOriginColor: mixColor('#ffffff', '#FBBC05', 0.08),
  endpointDestColor: mixColor('#FBBC05', '#ffffff', 0.18),
  endpointAccentColor: '#ffffff',
  pinHoverColor: mixColor('#ffffff', '#8AB4F8', 0.08),
  pinSelectedColor: mixColor('#ffffff', '#FBBC05', 0.24),
  hubColorMul: '#FBBC05'
}

const DEFAULT_HIGHLIGHT_THEME: GlobeHighlightTheme = {
  hoverA: '#ffffff',
  hoverB: '#FBBC05',
  hoverCore: '#ffffff',
  hoverPaletteMix: 0.0,
  selectedA: '#ffffff',
  selectedB: '#FBBC05',
  selectedC: '#ffffff',
  selectedD: '#FBBC05'
}

function resolveGlobeTheme(theme?: GlobeTheme): ResolvedGlobeTheme {
  return {
    scene: { ...DEFAULT_SCENE_THEME, ...(theme?.scene ?? {}) },
    countries: { ...DEFAULT_COUNTRIES_THEME, ...(theme?.countries ?? {}) },
    grids: { ...DEFAULT_GRID_THEME, ...(theme?.grids ?? {}) },
    landWater: { ...DEFAULT_LAND_WATER_THEME, ...(theme?.landWater ?? {}) },
    atmosphere: { ...DEFAULT_ATMOSPHERE_THEME, ...(theme?.atmosphere ?? {}) },
    lighting: { ...DEFAULT_LIGHTING_THEME, ...(theme?.lighting ?? {}) },
    points: { ...DEFAULT_POINTS_THEME, ...(theme?.points ?? {}) },
    flights: { ...DEFAULT_FLIGHTS_THEME, ...(theme?.flights ?? {}) },
    highlights: { ...DEFAULT_HIGHLIGHT_THEME, ...(theme?.highlights ?? {}) }
  }
}

function setUniformColor(
  uniforms: Record<string, { value: any }> | undefined,
  uniformName: string,
  color: THREE.ColorRepresentation
) {
  if (!uniforms) return
  const entry = uniforms[uniformName]
  if (!entry) return
  if (entry.value instanceof THREE.Color) {
    entry.value.set(color)
    return
  }
  entry.value = new THREE.Color(color)
}

export type GlobeOptions = {
  mountTarget?: HTMLElement
  assetBaseUrl?: string
  initialHeatmapEnabled?: boolean
  initialFlightVisualizationMode?: FlightVisualizationMode
  initialIntroAnimationEnabled?: boolean
  disableScrollZoom?: boolean
  showBreadcrumbs?: boolean
  breadcrumbOffsetLeft?: number
  breadcrumbOffsetTop?: number
  showZoomControls?: boolean
  countryClickZoomLevel?: number
  countryClickZoomDuration?: number
  showCountryCardCloseButton?: boolean
  minZoomDistance?: number
  maxZoomDistance?: number
  routeCount?: number
  planesPerRoute?: number
  planeDensityScale?: number
  animatedCards?: boolean
  disableMapInteraction?: boolean
  searchBarX?: number
  searchBarY?: number
  showSearchBarMobile?: boolean
  /**
   * When `true` (default), loads `airports.json` which contains the full airport dataset.
   * Set to `false` to fall back to the legacy `airports_points.json`.
   * Overridden entirely by `airportsDataFile` when that option is provided.
   */
  useFullAirportsDataset?: boolean
  /**
   * Caps the number of airport points rendered. When omitted all airports are rendered.
   * Applies after the file is loaded; the cap does not affect the per-country count aggregation.
   */
  airportRenderLimit?: number
  /**
   * Restrict which airport `kind` values are included in both rendering and per-country
   * aggregation. Any entry whose `kind` is not in this list is silently dropped.
   * Entries with no `kind` field (e.g. the legacy airports_points.json format) are always kept.
   *
   * Valid values: 'large_airport' | 'medium_airport' | 'small_airport' |
   *               'heliport' | 'closed' | 'balloonport'
   *
   * Default: ['large_airport', 'medium_airport', 'small_airport']
   * (excludes heliports, closed airports, and balloonports)
   */
  airportKinds?: string[]
  /**
   * Override the airports data filename loaded from the `data/` directory.
   * Takes precedence over `useFullAirportsDataset`. The file must be an array of objects
   * with `latitude` and `longitude` fields (optionally `iso3` for faster country lookup).
   */
  airportsDataFile?: string
  /**
   * Override the flights/routes data filename loaded from the `data/` directory.
   * Defaults to `flights_enriched.json`.
   */
  routesDataFile?: string
  /**
   * When `true` (default), scrolling while a country card is open closes the card
   * and resets the camera to the default zoom distance.
   * Set to `false` (or `?scrollResetsView=0`) to disable this behaviour entirely.
   * Zoom is unaffected — this only controls the card-close+reset side effect.
   */
  scrollResetsView?: boolean
  /**
   * Directional light intensity applied to the globe surface via the lighting shell.
   * `0` (default) disables the lighting effect. Values in the range 0.3–1.0 give
   * a subtle-to-strong one-sided illumination (lit face vs dark face).
   */
  lightIntensity?: number
  /**
   * Hex color string for the directional light's illuminated-side tint.
   * Defaults to the theme `lighting.day` color when not provided.
   */
  lightColor?: string
  /** X component of the directional light vector in world space. Default: camera-facing. */
  lightX?: number
  /** Y component of the directional light vector in world space. Default: camera-facing. */
  lightY?: number
  /** Z component of the directional light vector in world space. Default: camera-facing. */
  lightZ?: number
  /**
   * Half-intensity radius of the soft light blob (0.01–1.0).
   * Defines the angular distance from center at which brightness drops to 50%.
   * `0.05` = small tight circle; `0.35` = medium blob (default); `0.8` = near-full-globe wash.
   */
  lightRadius?: number
  /**
   * Hex color string for the country card's outer border.
   * Accepts `#RRGGBB`, `#RGB`, or `0xRRGGBB` notation.
   * Also accepts `rgba(...)` for semi-transparent borders.
   * Defaults to `rgba(255, 255, 255, 0.08)`.
   */
  cardBorderColor?: string
  /**
   * Width in pixels of the country card's outer border.
   * `0` removes the border entirely. Defaults to `1`.
   */
  cardBorderWidth?: number
  /**
   * Background CSS value for the country card panel.
   * Accepts any valid CSS color: hex (`#0d1c30`), `rgb()`, `rgba()`, or `transparent`.
   * Defaults to `#0d1c30`.
   */
  cardBackground?: string
  /**
   * Solid background color applied uniformly to all country card sections
   * (outer container, header, stats, footer). Replaces any gradient-based backgrounds.
   * Accepts any valid CSS color: hex, `rgb()`, or `rgba()`.
   * Defaults to `#001E3D`.
   * Takes precedence over `cardBackground` when both are provided.
   */
  cardBackgroundColor?: string
  /**
   * Whether to show the thick shadow backing on the selected country border.
   * Defaults to `false`.
   */
  showSelectBacking?: boolean
  /**
   * Whether to show the soft glow/halo around the selected country border.
   * The core border line is always visible regardless of this setting.
   * Defaults to `false`.
   */
  showCountryGlow?: boolean
  /**
   * Renderer used for the selected-country highlight line.
   * - `'line2'` (default) — Line2 + LineMaterial: real screen-space thickness, smooth joins.
   * - `'line'` — THREE.LineLoop + LineBasicMaterial: 1px WebGL line, classic look.
   */
  highlightRenderMode?: 'line2' | 'line'
  /**
   * Hex color string applied to all UI accent elements:
   * the live-status dot on the country card, the active breadcrumb label,
   * and the card hover glow border.
   * Defaults to `#ECB200` (gold).
   */
  accentColor?: string
  theme?: GlobeTheme
}

export type GlobeInstance = {
  ready: Promise<void>
  /**
   * Update the atmosphere glow color at runtime.
   * Equivalent to initializing with `theme.atmosphere.glowColor`.
   * White (`#ffffff`) resets to the neutral default (no tint).
   */
  setGlowColor: (color: THREE.ColorRepresentation) => void
}

const BASE_BREADCRUMBS = [
  { id: 'home', label: 'Home' },
  { id: 'map', label: 'Map' }
]

function getBaseBreadcrumbs() {
  return BASE_BREADCRUMBS.map((item) => ({ ...item }))
}

function getCountryBreadcrumbs(label: string) {
  return [
    ...getBaseBreadcrumbs(),
    { id: 'country', label }
  ]
}

export default function globe(options: GlobeOptions = {}): GlobeInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('The globe package must be instantiated in a browser environment.')
  }

  const mountTarget = options.mountTarget ?? document.body
  const showBreadcrumbs = options.showBreadcrumbs !== false
  const showZoomControls = options.showZoomControls === true
  const showCountryCardCloseButton = options.showCountryCardCloseButton !== false
  ensureCountryPanelScaffold()
  configureGlobeUi({
    showBreadcrumbs,
    showCountryCardCloseButton,
    breadcrumbOffsetLeft: options.breadcrumbOffsetLeft,
    breadcrumbOffsetTop: options.breadcrumbOffsetTop,
    cardBorderColor: options.cardBorderColor,
    cardBorderWidth: options.cardBorderWidth,
    cardBackground: options.cardBackground,
    cardBackgroundColor: options.cardBackgroundColor,
    accentColor: options.accentColor
  })
  setGlobeBreadcrumbs(getBaseBreadcrumbs())
  const assetBaseUrl = (options.assetBaseUrl ?? '').replace(/\/+$/, '')
  const resolveAssetPath = (assetPath: string) => {
    const normalizedAssetPath = assetPath.replace(/^\/+/, '')
    return assetBaseUrl ? `${assetBaseUrl}/${normalizedAssetPath}` : `/${normalizedAssetPath}`
  }
  ;(globalThis as any).__NAVPASS_GLOBE_ASSET_BASE_URL = assetBaseUrl
  let theme = resolveGlobeTheme(options.theme)

  function applyThemeRuntimeTokens() {
    configureSelectedHighlightColors({
      colorA: theme.highlights.hoverA,
      colorB: theme.highlights.hoverB,
      coreColor: theme.highlights.hoverCore,
      paletteMix: theme.highlights.hoverPaletteMix
    })
    configureCountryHighlightPalette({
      colorA: theme.highlights.selectedA,
      colorB: theme.highlights.selectedB,
      colorC: theme.highlights.selectedC,
      colorD: theme.highlights.selectedD
    })
  }

  applyThemeRuntimeTokens()

  /* 
   * Config
   */
  const GLOBE_RADIUS = 10
  const COUNTRIES_GEOJSON_PATH = resolveAssetPath('data/ne_110m_admin_0_countries.geojson')
  const SYNTHETIC_AIRPORT_TARGET = 5200
  const AIRPORT_MIN_SPACING_DEG = 0.5
  const SHOW_AIRPORT_POINTS = true
  const SHOW_NIGHT_LIGHTS = false
  const disableScrollZoom = options.disableScrollZoom === true
  const scrollResetsView = options.scrollResetsView !== false
  const requestedRouteCount = Number(options.routeCount)
  const FLIGHT_ROUTE_TARGET = Number.isFinite(requestedRouteCount)
    ? THREE.MathUtils.clamp(Math.round(requestedRouteCount), 1, 30000)
    : null
  const requestedPlanesPerRoute = Number(options.planesPerRoute)
  const FLIGHT_PLANES_PER_ROUTE = THREE.MathUtils.clamp(
    Number.isFinite(requestedPlanesPerRoute) ? Math.round(requestedPlanesPerRoute) : 1,
    1,
    8
  )
  const requestedPlaneDensityScale = Number(options.planeDensityScale)
  const FLIGHT_PLANE_DENSITY_SCALE = THREE.MathUtils.clamp(
    Number.isFinite(requestedPlaneDensityScale) ? requestedPlaneDensityScale : 1.0,
    0.2,
    2.5
  )
  const ANIMATED_CARDS_ENABLED = options.animatedCards === true
  const animatedCards = ANIMATED_CARDS_ENABLED
    ? createAnimatedCards(mountTarget)
    : null
  let countriesGeoJSON: any = null

let triGrid: ReturnType<typeof createAdaptiveTriGrid> | null = null
let latLonGrid: ReturnType<typeof createAdaptiveLatLonGrid> | null = null
let countriesLines: ReturnType<typeof createCountries> | null = null
let languagePoints: { points: THREE.Points; material: THREE.ShaderMaterial } | null = null
let lightingShell:
  | { group: THREE.Group; nightMaterial: THREE.ShaderMaterial; dayMaterial: THREE.ShaderMaterial; nightMesh: THREE.Mesh; dayMesh: THREE.Mesh }
  | null = null
let nightLights:
  | {
      points: THREE.Points
      material: THREE.ShaderMaterial
      update: (timeSeconds: number, cameraDistance: number, sunDirWorld: THREE.Vector3) => void
    }
  | null = null
let landWater: ReturnType<typeof createLandWaterLayer> | null = null
let atmosphere: ReturnType<typeof createAtmosphere> | null = null
let flightRoutes: FlightRoutesLayer | null = null
let selectedFlightRouteId: number | null = null
let isCountrySelected = false
let selectedCountryIso3: string | null = null
let innerSphereMesh: THREE.Mesh | null = null
let depthMaskMesh: THREE.Mesh | null = null
let lastHoverKey = ''
const tooltip = createTooltip(document.body)
const DEFAULT_TOOLTIP_FONT =
  '12px system-ui, -apple-system, Segoe UI, Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
const FLIGHT_TOOLTIP_FONT_FAMILY = "'Verdana Pro',Verdana,'Trebuchet MS',sans-serif"
const COUNTRY_TOOLTIP_TITLE_FONT_FAMILY = "'Optima','Times New Roman',serif"
const countrySearch = document.getElementById('country-search') as HTMLFormElement | null
const countrySearchInput = document.getElementById('country-search-input') as HTMLInputElement | null
const countrySearchButton = document.getElementById('country-search-button') as HTMLButtonElement | null
const countrySearchResults = document.getElementById('country-search-results') as HTMLDivElement | null
const countrySearchMobileQuery = window.matchMedia('(max-width: 720px)')
const COUNTRY_SEARCH_RECENTS_STORAGE_KEY = 'navpass:globe:recent-country-searches'

type CountrySearchEntry = {
  feature: any
  label: string
  meta: string
  iso2: string
  iso3: string
  tokens: string[]
}

let countrySearchIndex: CountrySearchEntry[] = []
let countrySearchSuggestions: CountrySearchEntry[] = []
let countrySearchActiveIndex = -1
let countrySearchResultsHeading = ''
let recentCountrySearchIso3 = loadRecentCountrySearches()

function applyDefaultTooltipChrome() {
  const { style } = tooltip.el
  style.padding = '6px 10px'
  style.borderRadius = '10px'
  style.background = 'var(--tooltip-bg, rgba(6, 18, 38, 0.88))'
  style.border = '1px solid var(--tooltip-border, rgba(255, 255, 255, 0.22))'
  style.color = 'var(--tooltip-text, rgba(255, 255, 255, 0.95))'
  style.font = DEFAULT_TOOLTIP_FONT
  style.letterSpacing = '0.2px'
  style.backdropFilter = 'blur(6px)'
  style.boxShadow = 'none'
}

function applyFlightTooltipChrome() {
  const { style } = tooltip.el
  style.padding = '0'
  style.borderRadius = '0'
  style.background = 'transparent'
  style.border = '0'
  style.color = '#fff'
  style.font = `14px ${FLIGHT_TOOLTIP_FONT_FAMILY}`
  style.letterSpacing = '0'
  style.backdropFilter = 'none'
  style.boxShadow = '0 16px 34px rgba(3, 10, 22, 0.32)'
}

function applyCountryTooltipChrome() {
  const { style } = tooltip.el
  style.padding = '0'
  style.borderRadius = '0'
  style.background = 'transparent'
  style.border = '0'
  style.color = '#fff'
  style.font = `14px ${FLIGHT_TOOLTIP_FONT_FAMILY}`
  style.letterSpacing = '0'
  style.backdropFilter = 'none'
  style.boxShadow = '0 16px 34px rgba(3, 10, 22, 0.28)'
}

applyDefaultTooltipChrome()

function isCountrySearchEnabled() {
  return countrySearchMobileQuery.matches
}

function loadRecentCountrySearches() {
  try {
    const raw = window.localStorage.getItem(COUNTRY_SEARCH_RECENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 5)
  } catch {
    return []
  }
}

function persistRecentCountrySearches() {
  try {
    window.localStorage.setItem(
      COUNTRY_SEARCH_RECENTS_STORAGE_KEY,
      JSON.stringify(recentCountrySearchIso3.slice(0, 5))
    )
  } catch {
    // Ignore storage failures so search remains functional in restricted environments.
  }
}

function normalizeSearchToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function buildCountrySearchIndex(geojson: any): CountrySearchEntry[] {
  const entries: CountrySearchEntry[] = []
  for (const feature of geojson?.features ?? []) {
    const props = feature?.properties ?? {}
    const iso2 = getISO2(props)
    const iso3 = getISO3(props)
    const names = [
      props.NAME_LONG,
      props.NAME_EN,
      props.ADMIN,
      props.NAME
    ].filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    const codes = [
      props.ISO_A3,
      props.ADM0_A3,
      props.BRK_A3,
      props.SU_A3,
      props.ISO_A2,
      props.WB_A2
    ].filter((value: unknown): value is string => typeof value === 'string' && value !== '-99' && value.trim().length > 0)

    const tokens = new Set<string>()
    for (const name of names) {
      tokens.add(normalizeSearchToken(name))
    }
    for (const code of codes) {
      tokens.add(normalizeSearchToken(code))
    }
    if (!tokens.size) continue

    entries.push({
      feature,
      label: names[0] ?? String(codes[0] ?? 'Country'),
      meta: names.find((name) => name !== (names[0] ?? '')) ?? '',
      iso2,
      iso3,
      tokens: [...tokens]
    })
  }

  entries.sort((a, b) => a.label.localeCompare(b.label))
  return entries
}

function setCountrySearchInvalidState(isInvalid: boolean) {
  if (!countrySearch) return
  countrySearch.classList.toggle('is-invalid', isInvalid)
}

function clearCountrySearchSuggestions() {
  countrySearchSuggestions = []
  countrySearchActiveIndex = -1
  countrySearchResultsHeading = ''
  if (countrySearchResults) {
    countrySearchResults.innerHTML = ''
  }
  countrySearch?.classList.remove('has-results')
}

const showSearchBarMobile = options.showSearchBarMobile !== false

function applyCountrySearchVisibility() {
  if (!countrySearch) return
  if (!showSearchBarMobile && countrySearchMobileQuery.matches) {
    countrySearch.style.display = 'none'
    clearCountrySearchSuggestions()
    return
  }
  const enabled = isCountrySearchEnabled()
  countrySearch.style.display = enabled ? '' : 'none'
  if (!enabled) {
    setCountrySearchInvalidState(false)
    clearCountrySearchSuggestions()
  }
}

function findCountryByQuery(query: string) {
  const needle = normalizeSearchToken(query)
  if (!needle) return null

  let startsWith: CountrySearchEntry | null = null
  let includes: CountrySearchEntry | null = null

  for (const entry of countrySearchIndex) {
    for (const token of entry.tokens) {
      if (token === needle) return entry
      if (!startsWith && token.startsWith(needle)) {
        startsWith = entry
      } else if (!includes && token.includes(needle)) {
        includes = entry
      }
    }
  }

  return startsWith ?? includes
}

function getCountrySearchSuggestions(query: string, limit = 7) {
  const needle = normalizeSearchToken(query)
  if (!needle) return []

  const matches: Array<{ entry: CountrySearchEntry; rank: number }> = []
  const seen = new Set<CountrySearchEntry>()

  for (const entry of countrySearchIndex) {
    let rank = Number.POSITIVE_INFINITY
    for (const token of entry.tokens) {
      if (token === needle) {
        rank = 0
        break
      }
      if (token.startsWith(needle)) {
        rank = Math.min(rank, 1)
        continue
      }
      if (token.includes(needle)) {
        rank = Math.min(rank, 2)
      }
    }
    if (!Number.isFinite(rank) || seen.has(entry)) continue
    seen.add(entry)
    matches.push({ entry, rank })
  }

  matches.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.entry.label.localeCompare(b.entry.label)
  })

  return matches.slice(0, limit).map((item) => item.entry)
}

function findCountrySearchEntryByIso3(iso3: string) {
  return countrySearchIndex.find((entry) => entry.iso3 === iso3) ?? null
}

function getRecentCountrySearchEntries(limit = 5) {
  const entries: CountrySearchEntry[] = []
  for (const iso3 of recentCountrySearchIso3) {
    const entry = findCountrySearchEntryByIso3(iso3)
    if (!entry) continue
    entries.push(entry)
    if (entries.length >= limit) break
  }
  return entries
}

function showRecentCountrySearches() {
  const entries = getRecentCountrySearchEntries()
  if (!entries.length) {
    clearCountrySearchSuggestions()
    return
  }
  setCountrySearchSuggestions(entries, -1, 'Recent searches')
}

function rememberRecentCountry(feature: any) {
  const iso3 = getISO3(feature?.properties ?? {})
  if (!iso3) return
  recentCountrySearchIso3 = [iso3, ...recentCountrySearchIso3.filter((value) => value !== iso3)].slice(0, 5)
  persistRecentCountrySearches()
}

function renderCountrySearchSuggestions(entries: CountrySearchEntry[]) {
  if (!countrySearchResults) return

  countrySearchSuggestions = entries
  countrySearchResults.innerHTML = ''
  countrySearch?.classList.toggle('has-results', entries.length > 0)

  if (entries.length > 0 && countrySearchResultsHeading) {
    const heading = document.createElement('div')
    heading.className = 'country-search-results__heading'
    heading.textContent = countrySearchResultsHeading
    countrySearchResults.appendChild(heading)
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const option = document.createElement('button')
    option.type = 'button'
    option.className = 'country-search-option'
    option.setAttribute('role', 'option')
    option.setAttribute('aria-selected', i === countrySearchActiveIndex ? 'true' : 'false')
    if (i === countrySearchActiveIndex) {
      option.classList.add('is-active')
    }

    const meta = entry.meta && entry.meta !== entry.label ? entry.meta : 'Country'
    const hasFlag = entry.iso2 && entry.iso2 !== '-99' && entry.iso2.length === 2
    const flagThumb = hasFlag
      ? `<span class="country-search-option-flag" style="background-image:url('${isoToFlagUrl(entry.iso2)}')"></span>`
      : '<span class="country-search-option-flag country-search-option-flag--empty"></span>'
    option.innerHTML = `
      ${flagThumb}
      <span class="country-search-option-main">
        <span class="country-search-option-label">${escapeHtml(entry.label)}</span>
        <span class="country-search-option-meta">${escapeHtml(meta)}</span>
      </span>
      <span class="country-search-option-code">${escapeHtml(entry.iso3 || '---')}</span>
    `

    option.addEventListener('click', () => {
      selectCountrySearchEntry(entry)
    })
    countrySearchResults.appendChild(option)
  }
}

function setCountrySearchSuggestions(
  entries: CountrySearchEntry[],
  activeIndex = -1,
  heading = ''
) {
  countrySearchActiveIndex =
    entries.length > 0 ? THREE.MathUtils.clamp(activeIndex, 0, entries.length - 1) : -1
  countrySearchResultsHeading = heading
  renderCountrySearchSuggestions(entries)
}

function selectCountrySearchEntry(entry: CountrySearchEntry) {
  if (!countrySearchInput) return
  markUserInteracted()
  setCountrySearchInvalidState(false)
  countrySearchInput.value = entry.label
  clearCountrySearchSuggestions()
  selectCountryFeature(entry.feature)
}

function runCountrySearch(preferredEntry?: CountrySearchEntry | null) {
  if (!countrySearchInput) return
  if (!isCountrySearchEnabled()) return
  markUserInteracted()
  const rawQuery = countrySearchInput.value.trim()
  if (!rawQuery) {
    const fallbackEntry =
      preferredEntry ??
      (countrySearchActiveIndex >= 0 ? countrySearchSuggestions[countrySearchActiveIndex] ?? null : null) ??
      countrySearchSuggestions[0] ??
      null
    if (fallbackEntry) {
      selectCountrySearchEntry(fallbackEntry)
      return
    }
    setCountrySearchInvalidState(false)
    showRecentCountrySearches()
    return
  }

  const match =
    preferredEntry ??
    (countrySearchActiveIndex >= 0 ? countrySearchSuggestions[countrySearchActiveIndex] ?? null : null) ??
    findCountryByQuery(rawQuery)
  if (!match) {
    setCountrySearchInvalidState(true)
    return
  }

  selectCountrySearchEntry(match)
}

countrySearch?.addEventListener('submit', (event) => {
  event.preventDefault()
  runCountrySearch()
})

countrySearchInput?.addEventListener('input', () => {
  setCountrySearchInvalidState(false)
  const rawQuery = countrySearchInput.value.trim()
  if (!rawQuery) {
    showRecentCountrySearches()
    return
  }
  setCountrySearchSuggestions(getCountrySearchSuggestions(rawQuery), 0)
})

countrySearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    if (!countrySearchSuggestions.length) return
    event.preventDefault()
    setCountrySearchSuggestions(countrySearchSuggestions, countrySearchActiveIndex + 1)
    return
  }
  if (event.key === 'ArrowUp') {
    if (!countrySearchSuggestions.length) return
    event.preventDefault()
    setCountrySearchSuggestions(countrySearchSuggestions, countrySearchActiveIndex <= 0 ? countrySearchSuggestions.length - 1 : countrySearchActiveIndex - 1)
    return
  }
  if (event.key === 'Escape') {
    clearCountrySearchSuggestions()
    return
  }
  if (event.key !== 'Enter') return
  event.preventDefault()
  runCountrySearch()
})

countrySearchInput?.addEventListener('focus', () => {
  const rawQuery = countrySearchInput.value.trim()
  if (!rawQuery) {
    showRecentCountrySearches()
    return
  }
  setCountrySearchSuggestions(getCountrySearchSuggestions(rawQuery), 0)
})

countrySearchButton?.addEventListener('click', () => {
  runCountrySearch()
})

window.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element)) return
  if (event.target.closest('#country-search')) return
  clearCountrySearchSuggestions()
})

applyCountrySearchVisibility()
if (typeof countrySearchMobileQuery.addEventListener === 'function') {
  countrySearchMobileQuery.addEventListener('change', applyCountrySearchVisibility)
} else {
  ;(countrySearchMobileQuery as any).addListener?.(applyCountrySearchVisibility)
}

function setPinnedFlightRoute(_routeId: number | null) {}

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
scene.background = new THREE.Color(theme.scene.background)

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000)
camera.up.set(0, 1, 0)
camera.position.set(0, 0, 50)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.debug.checkShaderErrors = true
mountTarget.appendChild(renderer.domElement)

if (options.disableMapInteraction === true) {
  renderer.domElement.style.pointerEvents = 'none'
}

if (countrySearch) {
  if (typeof options.searchBarX === 'number') {
    countrySearch.style.left = `${options.searchBarX}px`
    countrySearch.style.right = 'auto'
  }
  if (typeof options.searchBarY === 'number') {
    countrySearch.style.top = `${options.searchBarY}px`
  }
}

/**
 * Directional lighting
 * Opt-in via `options.lightIntensity` (default 0 = off).
 * When enabled, the lighting shell renders a one-sided illumination over the globe.
 */
const requestedLightIntensity = Number(options.lightIntensity)
const USER_LIGHT_INTENSITY = Number.isFinite(requestedLightIntensity) && requestedLightIntensity > 0
  ? THREE.MathUtils.clamp(requestedLightIntensity, 0.01, 2.0)
  : 0.15  // default: subtle front-facing blue wash
const USER_LIGHT_ENABLED = USER_LIGHT_INTENSITY > 0

// When lightX/Y/Z are all provided, use a fixed direction; otherwise use the default (0, 0, 1).
const _rawLX = Number(options.lightX)
const _rawLY = Number(options.lightY)
const _rawLZ = Number(options.lightZ)
const USER_LIGHT_DIR: THREE.Vector3 =
  Number.isFinite(_rawLX) && Number.isFinite(_rawLY) && Number.isFinite(_rawLZ)
    ? new THREE.Vector3(_rawLX, _rawLY, _rawLZ).normalize()
    : new THREE.Vector3(0, 0, 1)  // default: straight toward the camera (+Z)

// `lightRadius` is the half-intensity radius: the angular distance (0–1, where 1 = globe edge)
// at which brightness drops to 50%. Formula: k = ln(2) / r² so the mapping is physically grounded.
// lightRadius=0.5 → half the globe lit at ≥50%; lightRadius=0.05 → tight small circle.
const _rawRadius = Number(options.lightRadius)
const USER_LIGHT_RADIUS = Number.isFinite(_rawRadius)
  ? THREE.MathUtils.clamp(_rawRadius, 0.01, 1.0)
  : 0.10  // default: tight soft circle
const USER_GAUSSIAN_FALLOFF = 0.693 / (USER_LIGHT_RADIUS * USER_LIGHT_RADIUS)

const initialHeatmapEnabled = options.initialHeatmapEnabled ?? false
const initialFlightVisualizationMode: FlightVisualizationMode = options.initialFlightVisualizationMode ?? 'reengineered'
const initialIntroAnimationEnabled = options.initialIntroAnimationEnabled ?? true
const INTRO_BOOTSTRAP_FRAMES = initialIntroAnimationEnabled ? 2 : 0
const INTRO_FLIGHT_BOOTSTRAP_DELAY_MS = initialIntroAnimationEnabled ? 140 : 0
const AIRPORT_REVEAL_DURATION_SECONDS = 1.35
type VisualPreset = {
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
  starOpacityFar: number
  starOpacityNear: number
}

const DRAMATIC_VISUAL_PRESET: VisualPreset = {
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
  dotAlpha: 1.34,
  dotSizeMul: 1.84,
  planeAlpha: 0.82,
  planeSizeMul: 1.08,
  routeLineBaseAlpha: 0.072,
  routeLineGlowAlpha: 0.58,
  nightLightsAlpha: 0.42,
  shadowMul: 0.0,
  dayMul: 0.0,
  starOpacityFar: 0.18,
  starOpacityNear: 0.30
}

let visualTriOpacityMul = 1
let visualTriShimmerMul = 1
let visualLatLonOpacityMul = 1
let visualLatLonShimmerMul = 1
let visualStarOpacityFar = DRAMATIC_VISUAL_PRESET.starOpacityFar
let visualStarOpacityNear = DRAMATIC_VISUAL_PRESET.starOpacityNear

function applyVisualPreset() {
  const cfg: VisualPreset = DRAMATIC_VISUAL_PRESET

  scene.background = new THREE.Color(theme.scene.background)

  if (innerSphereMesh && innerSphereMesh.material instanceof THREE.MeshBasicMaterial) {
    // Keep the globe interior exactly equal to the space background.
    innerSphereMesh.material.color.set(theme.scene.innerSphere)
    innerSphereMesh.visible = false
  }
  if (depthMaskMesh && depthMaskMesh.material instanceof THREE.MeshBasicMaterial) {
    depthMaskMesh.material.color.set(theme.scene.depthMask)
  }
  if (lightingShell) {
    lightingShell.group.visible = USER_LIGHT_ENABLED
    // In spotlight mode, only the day (additive) mesh is shown — the night mesh would tint
    // the whole globe with a shadow color, which is not wanted for a flashlight effect.
    lightingShell.nightMesh.visible = false
    lightingShell.dayMesh.visible = USER_LIGHT_ENABLED
    setUniformColor(lightingShell.nightMaterial.uniforms as any, 'uShadowColor', theme.lighting.shadow)
    const dayColor = options.lightColor ?? '#007AF5'
    setUniformColor(lightingShell.dayMaterial.uniforms as any, 'uDayColor', dayColor)
  }

  if (landWater) {
    // Borders-only mode: keep country surfaces fully unfilled.
    landWater.mesh.visible = false
    const u = landWater.material.uniforms as any
    if (u.uLandAlpha) u.uLandAlpha.value = 0
    if (u.uCoastAlpha) u.uCoastAlpha.value = 0
    setUniformColor(u, 'uLandTint', theme.landWater.landTint)
    setUniformColor(u, 'uCoastTint', theme.landWater.coastTint)
  }

  setSelectedBorderLineWidth(4.0)
  setSelectHighlightLineWidth(4.0)
  setHighlightRenderMode(options.highlightRenderMode ?? 'line2')
  setHoverHighlightRenderMode(options.highlightRenderMode ?? 'line2')
  setSelectBackingEnabled(options.showSelectBacking === true)
  setCountryGlowEnabled(options.showCountryGlow === true)

  if (countriesLines) {
    countriesLines.setStyle({
      opacity: cfg.borderCoreOpacity,
      color: theme.countries.border,
      lineWidth: cfg.borderLineWidth
    })
  }

  if (triGrid) {
    for (const mat of triGrid.materials) {
      setUniformColor(mat.uniforms as any, 'uColor', theme.grids.triColor)
      setUniformColor(mat.uniforms as any, 'uShimmerColor', theme.grids.triShimmerColor)
    }
  }

  if (latLonGrid) {
    for (const mat of latLonGrid.materials) {
      setUniformColor(mat.uniforms as any, 'uColor', theme.grids.latLonColor)
      setUniformColor(mat.uniforms as any, 'uShimmerColor', theme.grids.latLonShimmerColor)
    }
  }

  if (languagePoints) {
    const u = languagePoints.material.uniforms as any
    if (u.uAlphaMul) u.uAlphaMul.value = cfg.dotAlpha
    if (u.uSizeMul) u.uSizeMul.value = scaleThickness(cfg.dotSizeMul)
    setUniformColor(u, 'uColorMul', theme.points.dotColorMul)
    setUniformColor(u, 'uFlowColor', theme.points.dotFlowColor)
  }

  if (flightRoutes) {
    const p = flightRoutes.materials.plane.uniforms as any
    const l = flightRoutes.materials.line.uniforms as any
    const h = flightRoutes.materials.heatmap.uniforms as any
    const e = flightRoutes.materials.endpoints.uniforms as any
    const pin = flightRoutes.materials.pin.uniforms as any
    if (p.uAlpha) p.uAlpha.value = cfg.planeAlpha
    if (p.uSizeMul) p.uSizeMul.value = scaleThickness(cfg.planeSizeMul)
    if (l.uBaseAlpha) l.uBaseAlpha.value = cfg.routeLineBaseAlpha
    if (l.uGlowAlpha) l.uGlowAlpha.value = cfg.routeLineGlowAlpha
    setUniformColor(l, 'uBaseColor', theme.flights.lineBaseColor)
    setUniformColor(l, 'uHeadColor', theme.flights.lineHeadColor)
    setUniformColor(l, 'uTailColor', theme.flights.lineTailColor)
    setUniformColor(l, 'uAccentColor', theme.flights.lineAccentColor)
    setUniformColor(p, 'uCoreColor', theme.flights.planeCoreColor)
    setUniformColor(p, 'uGlowColor', theme.flights.planeGlowColor)
    setUniformColor(p, 'uTintColor', theme.flights.planeTintColor)
    setUniformColor(p, 'uAccentColor', theme.flights.planeAccentColor)
    setUniformColor(h, 'uColdColor', theme.flights.heatColdColor)
    setUniformColor(h, 'uMidColor', theme.flights.heatMidColor)
    setUniformColor(h, 'uHotColor', theme.flights.heatHotColor)
    setUniformColor(h, 'uEdgeAccentColor', theme.flights.heatEdgeAccentColor)
    setUniformColor(e, 'uOriginColor', theme.flights.endpointOriginColor)
    setUniformColor(e, 'uDestColor', theme.flights.endpointDestColor)
    setUniformColor(e, 'uAccentColor', theme.flights.endpointAccentColor)
    setUniformColor(pin, 'uHoverColor', theme.flights.pinHoverColor)
    setUniformColor(pin, 'uSelectedColor', theme.flights.pinSelectedColor)
    if (flightRoutes.materials.hubs) {
      setUniformColor(flightRoutes.materials.hubs.uniforms as any, 'uColorMul', theme.flights.hubColorMul)
    }
  }

  if (nightLights) {
    const u = nightLights.material.uniforms as any
    if (u.uAlpha) u.uAlpha.value = cfg.nightLightsAlpha
    setUniformColor(u, 'uWarmA', theme.points.nightWarmA)
    setUniformColor(u, 'uWarmB', theme.points.nightWarmB)
  }

  if (atmosphere) {
    const innerUniforms = atmosphere.materials.inner.uniforms as any
    const outerUniforms = atmosphere.materials.outer.uniforms as any
    const subsurfaceUniforms = atmosphere.materials.subsurface.uniforms as any
    innerUniforms.uIntensity.value = cfg.atmoInner
    outerUniforms.uIntensity.value = cfg.atmoOuter
    subsurfaceUniforms.uIntensity.value = cfg.atmoSubsurface
    setUniformColor(innerUniforms, 'uCoreColor', theme.atmosphere.innerCore)
    setUniformColor(innerUniforms, 'uRimColor', theme.atmosphere.innerRim)
    setUniformColor(outerUniforms, 'uCoreColor', theme.atmosphere.outerCore)
    setUniformColor(outerUniforms, 'uRimColor', theme.atmosphere.outerRim)
    setUniformColor(subsurfaceUniforms, 'uCoreColor', theme.atmosphere.subsurfaceCore)
    setUniformColor(subsurfaceUniforms, 'uRimColor', theme.atmosphere.subsurfaceRim)
    if (theme.atmosphere.glowColor != null) {
      atmosphere.setGlowColor(new THREE.Color(theme.atmosphere.glowColor))
    } else {
      // Reset to neutral when glowColor is removed from the theme.
      atmosphere.setGlowColor(new THREE.Color(1, 1, 1))
    }
  }

  visualTriOpacityMul = cfg.triGridOpacityMul
  visualTriShimmerMul = cfg.triGridShimmerMul
  visualLatLonOpacityMul = cfg.latLonGridOpacityMul
  visualLatLonShimmerMul = cfg.latLonGridShimmerMul
  visualStarOpacityFar = cfg.starOpacityFar
  visualStarOpacityNear = cfg.starOpacityNear
}

function applyHeatmap(enabled: boolean) {
  flightRoutes?.setHeatmapEnabled(enabled)
}

function applyFlightVisualization(mode: FlightVisualizationMode) {
  flightRoutes?.setVisualizationMode(mode)
}

/**
 * Globe group
 */
const globeGroup = new THREE.Group()
scene.add(globeGroup)

/**
 * OrbitControls: zoom only
 */
const DEFAULT_MIN_ZOOM_DISTANCE = 17
const DEFAULT_MAX_ZOOM_DISTANCE = 32
const requestedMinZoomDistance = Number(options.minZoomDistance)
const requestedMaxZoomDistance = Number(options.maxZoomDistance)
const minZoomDistance = THREE.MathUtils.clamp(
  Number.isFinite(requestedMinZoomDistance) ? requestedMinZoomDistance : DEFAULT_MIN_ZOOM_DISTANCE,
  12,
  28
)
const maxZoomDistance = THREE.MathUtils.clamp(
  Number.isFinite(requestedMaxZoomDistance) ? requestedMaxZoomDistance : DEFAULT_MAX_ZOOM_DISTANCE,
  minZoomDistance + 2,
  60
)
const requestedCountryClickZoomLevel = Number(options.countryClickZoomLevel)
const countryClickZoomLevel = Number.isFinite(requestedCountryClickZoomLevel)
  ? THREE.MathUtils.clamp(requestedCountryClickZoomLevel, minZoomDistance, maxZoomDistance)
  : null
const requestedCountryClickZoomDuration = Number(options.countryClickZoomDuration)
const countryClickZoomDuration = Number.isFinite(requestedCountryClickZoomDuration)
  ? THREE.MathUtils.clamp(Math.round(requestedCountryClickZoomDuration), 120, 8000)
  : null
function getMobileZoomDistance() {
  const aspect = Math.max(0.1, innerWidth / innerHeight)
  const vFovHalfRad = THREE.MathUtils.degToRad(camera.fov / 2)
  const hFovHalfRad = Math.atan(Math.tan(vFovHalfRad) * aspect)
  const minFovHalfRad = Math.min(vFovHalfRad, hFovHalfRad)
  const needed = (GLOBE_RADIUS / Math.sin(minFovHalfRad)) * 1.15
  return Math.max(needed, minZoomDistance)
}

function isMobileZoomLocked() {
  return countrySearchMobileQuery.matches
}

function getCameraZoom01(distance: number) {
  const span = Math.max(1e-4, maxZoomDistance - minZoomDistance)
  return THREE.MathUtils.clamp((maxZoomDistance - distance) / span, 0, 1)
}

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.enableRotate = false
controls.enablePan = false
controls.target.set(0, 0, 0)

/**
 * Smooth zoom animation (used by Story mode presets)
 */
let zoomAnim: { t0: number; dur: number; from: number; to: number } | null = null
const _camDir = new THREE.Vector3()
let airportRevealStartedAt = -1

function setCameraDistance(distance: number) {
  const clamped = THREE.MathUtils.clamp(distance, controls.minDistance, controls.maxDistance)
  _camDir.copy(camera.position).normalize()
  camera.position.copy(_camDir.multiplyScalar(clamped))
}

function zoomTo(distance: number, durationMs = 900) {
  if (isMobileZoomLocked()) {
    zoomAnim = null
    setCameraDistance(getMobileZoomDistance())
    return
  }
  zoomAnim = {
    t0: performance.now(),
    dur: durationMs,
    from: THREE.MathUtils.clamp(camera.position.length(), minZoomDistance, maxZoomDistance),
    to: THREE.MathUtils.clamp(distance, minZoomDistance, maxZoomDistance)
  }
}

controls.addEventListener('start', () => {
  // If the user zooms manually, stop scripted zoom so it doesn't "fight" them.
  markUserInteracted()
  zoomAnim = null
})

const railZoomIn = document.getElementById('rail-zoom-in') as HTMLButtonElement | null
const railZoomOut = document.getElementById('rail-zoom-out') as HTMLButtonElement | null
const leftRail = document.getElementById('left-rail') as HTMLElement | null
if (!showZoomControls && leftRail) {
  leftRail.remove()
}

function applyResponsiveZoomMode() {
  const locked = isMobileZoomLocked()
  const mobileZoomDist = getMobileZoomDistance()
  const effectiveZoomDistance = locked ? mobileZoomDist : camera.position.length()

  controls.enableZoom = !disableScrollZoom && !locked
  controls.minDistance = locked ? mobileZoomDist : minZoomDistance
  controls.maxDistance = locked ? mobileZoomDist : maxZoomDistance
  setCameraDistance(effectiveZoomDistance)
  controls.update()

  if (showZoomControls && leftRail) {
    leftRail.style.display = locked ? 'none' : ''
    leftRail.setAttribute('aria-hidden', locked ? 'true' : 'false')
  }
}

applyResponsiveZoomMode()

if (typeof countrySearchMobileQuery.addEventListener === 'function') {
  countrySearchMobileQuery.addEventListener('change', applyResponsiveZoomMode)
} else {
  ;(countrySearchMobileQuery as any).addListener?.(applyResponsiveZoomMode)
}

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
const FLIGHT_CLICK_THRESHOLD = 0.08
const FLIGHT_HOVER_THRESHOLD = 0.09
const AUTO_ROTATE_SPEED = THREE.MathUtils.degToRad(2)
let dragDistance = 0
let dragSuppressUntil = 0
let activePointerId: number | null = null
let dragStartTime = 0
let hasUserInteracted = false
let hoveredCountryRouteFocusIso3: string | null = null

function markUserInteracted() {
  hasUserInteracted = true
  animatedCards?.stop()
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
    target.closest('#left-rail') ||
    target.closest('#country-search') ||
    target.closest('#globe-ui') ||
    target.closest('#country-panel')
  )
}

function onPointerDown(e: PointerEvent) {
  if (isMobileZoomLocked()) return
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

  tooltip.hide()

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

  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (isEventOverUI(el)) return

  // Country selection gets priority over flight lines so country picking remains
  // reliable even when routes pass above it.
  const countryPick = getCountryPick(e.clientX, e.clientY)
  if (countryPick?.feature) {
    const iso3 = getISO3(countryPick.feature.properties)
    if (isCountrySelected && selectedCountryIso3 && iso3 === selectedCountryIso3) {
      const flightHit = getFlightHit(e.clientX, e.clientY, FLIGHT_CLICK_THRESHOLD)
      if (flightHit) {
        selectFlightRoute(flightHit.routeId, e.clientX, e.clientY)
        return
      }
      clearHighlight(globeGroup)
      tooltip.hide()
      lastHoverKey = ''
      return
    }
    selectCountryFeature(countryPick.feature, countryPick.worldPoint)
    return
  }

  const flightHit = getFlightHit(e.clientX, e.clientY, FLIGHT_CLICK_THRESHOLD)
  if (flightHit) {
    selectFlightRoute(flightHit.routeId, e.clientX, e.clientY)
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
  return THREE.MathUtils.lerp(19.2, 23.6, t)
}

function computeCountryZoomTarget(spanDeg: number) {
  if (!Number.isFinite(spanDeg)) return 22.5
  const t = THREE.MathUtils.clamp((spanDeg - 7) / 55, 0, 1)
  return THREE.MathUtils.lerp(19.0, 23.8, t)
}

function zoomToSubtle(targetDistance: number, durationMs = 950, strength = 0.62) {
  if (isMobileZoomLocked()) return
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

function startIntroAnimation() {
  if (!initialIntroAnimationEnabled) return
  if (hasUserInteracted || isCountrySelected || selectedFlightRouteId !== null) return
  if (globeAnim || zoomAnim) return

  const introYaw = THREE.MathUtils.degToRad(-24)
  const introPitch = THREE.MathUtils.degToRad(12)
  _qYaw.setFromAxisAngle(_axisY, introYaw)
  _qPitch.setFromAxisAngle(_axisX, introPitch)
  const qFrom = _qPitch.clone().multiply(_qYaw).normalize()
  const qTo = new THREE.Quaternion()

  globeGroup.quaternion.copy(qFrom)
  globeAnim = {
    t0: performance.now(),
    dur: 1800,
    from: qFrom.clone(),
    to: qTo
  }

  const introDistance = THREE.MathUtils.lerp(maxZoomDistance, minZoomDistance, 0.30)
  setCameraDistance(maxZoomDistance)
  zoomTo(introDistance, 1900)
}

function waitForAnimationFrames(frameCount = 1) {
  if (frameCount <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let remaining = frameCount
    const step = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

function waitForDelay(delayMs: number) {
  if (delayMs <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

async function waitForIntroAnimationsToSettle() {
  while (globeAnim || zoomAnim) {
    await waitForAnimationFrames(1)
  }
}

function waitForBrowserIdle(timeoutMs = 160) {
  if (typeof window.requestIdleCallback === 'function') {
    return new Promise<void>((resolve) => {
      window.requestIdleCallback(() => resolve(), { timeout: timeoutMs })
    })
  }
  return waitForAnimationFrames(1)
}

async function parseJsonResponse<T>(responsePromise: Promise<Response>, errorLabel: string): Promise<T> {
  const response = await responsePromise
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status}`)
  }
  return response.json() as Promise<T>
}

/**
 * Counts airports per country from the airports dataset.
 * Each airport entry must have `latitude` and `longitude`.
 * If the entry already has `iso3` (string) it is used directly; otherwise a point-in-polygon
 * lookup against the GeoJSON is performed.
 *
 * Logs a summary and warns about any entries with invalid coordinates or unresolvable countries.
 */
function buildAirportCountByIso3(
  airports: any[],
  countriesGeoJSON: any
): Map<string, number> {
  const counts = new Map<string, number>()
  if (!Array.isArray(airports) || airports.length === 0) return counts

  let invalidCoords = 0
  let missingCode = 0

  for (const ap of airports) {
    const lat = Number(ap.latitude ?? ap.lat)
    const lon = Number(ap.longitude ?? ap.lon ?? ap.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      invalidCoords++
      continue
    }

    // Fast path: use pre-supplied ISO3 if present (airports.json uses iso_3_code)
    const rawIso3 = ap.iso3 ?? ap.iso_3_code
    let iso3 = typeof rawIso3 === 'string' ? rawIso3.trim() : ''

    // Slower path: geo lookup
    if (!iso3 && countriesGeoJSON) {
      const feature = findCountryFeature(countriesGeoJSON, lat, lon)
      if (feature) {
        const props = feature.properties || {}
        const candidates = [props.ISO_A3, props.ADM0_A3, props.BRK_A3, props.SU_A3]
        iso3 = candidates.find((v): v is string =>
          typeof v === 'string' && v.length > 0 && v !== '-99'
        ) ?? ''
      }
    }

    if (!iso3) {
      missingCode++
      continue
    }

    counts.set(iso3, (counts.get(iso3) ?? 0) + 1)
  }

  const resolved = airports.length - invalidCoords - missingCode
  console.info(
    `[airports] per-country aggregation: total=${airports.length} resolved=${resolved} invalid_coords=${invalidCoords} no_country=${missingCode} countries=${counts.size}`
  )
  if (invalidCoords > 0 || missingCode > 0) {
    console.warn(
      `[airports] data quality: ${invalidCoords} entries with invalid coordinates, ${missingCode} with no matching country`
    )
  }

  return counts
}

async function parseEnrichedFlightsResponse(
  responsePromise: Promise<Response>,
  errorLabel: string,
  routeCountLimit: number | null
): Promise<{
  flights: NonNullable<EnrichedFlightsFile['flights']>
  airports: NonNullable<EnrichedFlightsFile['airports']> | null
  countryStats: NonNullable<EnrichedFlightsFile['country_stats']> | null
}> {
  const response = await responsePromise
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status}`)
  }

  const text = await response.text()
  const safeRouteCountLimit = Number.isFinite(routeCountLimit) ? Math.max(1, Math.floor(routeCountLimit as number)) : null

  const normalizeParsed = (parsed: EnrichedFlightsFile | null | undefined) => {
    const flightsSource = Array.isArray(parsed?.flights) ? parsed!.flights! : []
    const flights =
      safeRouteCountLimit && flightsSource.length > safeRouteCountLimit
        ? flightsSource.slice(0, safeRouteCountLimit)
        : flightsSource
    const airports =
      parsed?.airports && typeof parsed.airports === 'object'
        ? parsed.airports
        : null
    const countryStats =
      parsed?.country_stats && typeof parsed.country_stats === 'object'
        ? parsed.country_stats
        : null

    return { flights, airports, countryStats }
  }

  if (typeof Worker === 'undefined') {
    return normalizeParsed(JSON.parse(text) as EnrichedFlightsFile)
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const finishResolve = (value: {
      flights: NonNullable<EnrichedFlightsFile['flights']>
      airports: NonNullable<EnrichedFlightsFile['airports']> | null
      countryStats: NonNullable<EnrichedFlightsFile['country_stats']> | null
    }) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const finishReject = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error)
    }

    try {
      const worker = new Worker(new URL('./workers/enrichedFlightsParseWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<any>) => {
        worker.terminate()
        if (event.data?.error) {
          try {
            finishResolve(normalizeParsed(JSON.parse(text) as EnrichedFlightsFile))
          } catch (error) {
            finishReject(error)
          }
          return
        }

        finishResolve({
          flights: Array.isArray(event.data?.flights) ? event.data.flights : [],
          airports:
            event.data?.airports && typeof event.data.airports === 'object'
              ? event.data.airports
              : null,
          countryStats:
            event.data?.countryStats && typeof event.data.countryStats === 'object'
              ? event.data.countryStats
              : null
        })
      }
      worker.onerror = () => {
        worker.terminate()
        try {
          finishResolve(normalizeParsed(JSON.parse(text) as EnrichedFlightsFile))
        } catch (error) {
          finishReject(error)
        }
      }
      worker.postMessage({ text, routeCountLimit: safeRouteCountLimit })
    } catch {
      try {
        finishResolve(normalizeParsed(JSON.parse(text) as EnrichedFlightsFile))
      } catch (error) {
        finishReject(error)
      }
    }
  })
}

function clearSelectionUIState() {
  // Clear country selection / route selection, but keep the scene intact.
  clearHoverRouteCouplingCountry()
  hideCountryPanel()
  hideFocusDim()
  applyDefaultTooltipChrome()
  tooltip.hide()
  lastHoverKey = ''
  clearHighlight(globeGroup)

  selectedFlightRouteId = null
  flightRoutes?.setSelectedRoute(null)
  flightRoutes?.setHoverRoute(null)
  setPinnedFlightRoute(null)

  isCountrySelected = false
  selectedCountryIso3 = null
  flightRoutes?.setFocusCountry(null)
  clearSelectedHighlight(globeGroup)
  fadeOutSelected(globeGroup)
  setGlobeBreadcrumbs(getBaseBreadcrumbs())
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

function getFeatureLabel(feature: any) {
  return (
    feature.properties?.NAME_LONG ||
    feature.properties?.NAME_EN ||
    feature.properties?.ADMIN ||
    feature.properties?.NAME ||
    'Country'
  )
}

function getFeatureMetaParts(feature: any) {
  const props = feature.properties || {}
  return {
    iso3: getISO3(props) || '—',
    continent: String(props.CONTINENT || '—').toUpperCase()
  }
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

function deriveAirportCodeFromName(name: string) {
  const cleaned = compactAirportName(name).toUpperCase()
  const directMatch = cleaned.match(/\b[A-Z0-9]{3,4}\b/)
  if (directMatch) return directMatch[0]

  const stopWords = new Set(['INTL', 'INTERNATIONAL', 'REGIONAL', 'MUNICIPAL', 'CITY', 'PORT', 'THE'])
  const tokens = cleaned
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !stopWords.has(token))

  if (tokens.length >= 3) return `${tokens[0][0]}${tokens[1][0]}${tokens[2][0]}`
  if (tokens.length === 2) {
    const merged = `${tokens[0][0]}${tokens[1].slice(0, 2)}`
    return merged.length >= 3 ? merged : merged.padEnd(3, 'X')
  }
  if (tokens.length === 1 && tokens[0].length >= 3) return tokens[0].slice(0, 4)

  const compact = cleaned.replace(/[^A-Z0-9]/g, '')
  const source = (compact || 'AIR').slice(0, 4)
  return source.length >= 3 ? source : source.padEnd(3, 'X')
}

function resolveAirportTooltipCode(code: unknown, fallbackName: string) {
  const normalized = String(code || '').trim().toUpperCase()
  if (/^[A-Z0-9]{3,4}$/.test(normalized)) return normalized
  return deriveAirportCodeFromName(fallbackName)
}

function showFlightTooltip(routeId: number, x: number, y: number) {
  if (!flightRoutes) return
  const info = flightRoutes.getRouteInfo(routeId)
  if (!info) return

  const isForward = Number(info.dir) >= 0
  const fromName = compactAirportName(isForward ? info.fromName : info.toName)
  const toName = compactAirportName(isForward ? info.toName : info.fromName)
  const fromCode = resolveAirportTooltipCode(isForward ? info.fromCode : info.toCode, fromName)
  const toCode = resolveAirportTooltipCode(isForward ? info.toCode : info.fromCode, toName)
  const flightLabel = String(info.callsign || info.registration || `${fromCode}${toCode}`).trim().toUpperCase()
  const distanceKm = Number(info.distanceKm)
  const distanceLabel = Number.isFinite(distanceKm) ? `${Math.round(distanceKm).toLocaleString('en-US')} KM` : '— KM'

  applyFlightTooltipChrome()
  const html = `
    <div
      title="${escapeHtml(`${fromName} to ${toName}`)}"
      style="
        box-sizing:border-box;
        width:min(208px, calc(100vw - 16px));
        padding:10px 11px 9px;
        background:#0d1c30;
        border:1px solid rgba(204,183,97,0.72);
        color:#f7f8fb;
        font-family:${FLIGHT_TOOLTIP_FONT_FAMILY};
      "
    >
      <div
        style="
          display:grid;
          grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
          align-items:center;
          column-gap:8px;
        "
      >
        <div style="font-size:clamp(16px, 1.75vw, 20px);line-height:1;font-weight:700;letter-spacing:0.95px;text-transform:uppercase;">${escapeHtml(fromCode)}</div>
        <div style="font-size:clamp(18px, 2vw, 24px);line-height:0.9;font-weight:400;color:rgba(255,255,255,0.96);">→</div>
        <div style="font-size:clamp(16px, 1.75vw, 20px);line-height:1;font-weight:700;letter-spacing:0.95px;text-transform:uppercase;">${escapeHtml(toCode)}</div>
      </div>
      <div
        style="
          margin-top:6px;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:center;
          gap:6px;
          color:rgba(255,255,255,0.62);
          font-size:clamp(8px, 0.8vw, 10px);
          letter-spacing:0.58px;
          text-transform:uppercase;
        "
      >
        <div style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(flightLabel)}</div>
        <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
          <span style="width:5px;height:5px;border-radius:999px;background:rgba(255,255,255,0.62);display:inline-block;flex:0 0 auto;"></span>
          <span>${escapeHtml(distanceLabel)}</span>
        </div>
      </div>
    </div>
  `
  tooltip.showHTML(html, x, y)
}

function showCountryTooltip(feature: any, x: number, y: number) {
  const name = getFeatureLabel(feature)
  const iso2 = getISO2(feature.properties)
  const flagUrl = isoToFlagUrl(iso2)
  const meta = getFeatureMetaParts(feature)
  const hasFlag = Boolean(iso2)

  applyCountryTooltipChrome()
  const html = `
    <div
      style="
        box-sizing:border-box;
        width:min(208px, calc(100vw - 16px));
        padding:10px 12px 10px;
        background:#0d1c30;
        border:1px solid rgba(204,183,97,0.72);
        color:#f7f8fb;
        font-family:${FLIGHT_TOOLTIP_FONT_FAMILY};
      "
    >
      <div
        style="
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:center;
          gap:9px;
        "
      >
        <div style="min-width:0;">
          <div
            style="
              font-family:${COUNTRY_TOOLTIP_TITLE_FONT_FAMILY};
              font-size:clamp(16px, 1.75vw, 20px);
              line-height:1;
              letter-spacing:0.2px;
              color:#f7f8fb;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            "
          >${escapeHtml(name)}</div>
          <div
            style="
              margin-top:6px;
              display:flex;
              align-items:center;
              gap:6px;
              color:rgba(255,255,255,0.56);
              font-size:clamp(8px, 0.8vw, 10px);
              letter-spacing:0.62px;
              text-transform:uppercase;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            "
          >
            <span>${escapeHtml(meta.iso3)}</span>
            <span style="width:5px;height:5px;border-radius:999px;background:rgba(255,255,255,0.56);display:inline-block;flex:0 0 auto;"></span>
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(meta.continent)}</span>
          </div>
        </div>
        ${
          hasFlag
            ? `<img src="${flagUrl}" alt="" style="width:32px;height:32px;border-radius:999px;display:block;object-fit:cover;flex:0 0 auto;" onerror="this.style.display='none'">`
            : `<div style="width:32px;height:32px;border-radius:999px;display:block;flex:0 0 auto;background:rgba(255,255,255,0.08);"></div>`
        }
      </div>
    </div>
  `
  tooltip.showHTML(html, x, y)
}

function applyFlightHover(routeId: number, clientX: number, clientY: number) {
  clearHoverRouteCouplingCountry()
  clearHighlight(globeGroup)
  lastHoverKey = ''
  flightRoutes?.setHoverRoute(routeId)
  renderer.domElement.style.cursor = 'pointer'
  showFlightTooltip(routeId, clientX, clientY)
}

function selectFlightRoute(routeId: number, clientX: number, clientY: number) {
  clearHoverRouteCouplingCountry()
  // Toggle selection on the same route.
  if (selectedFlightRouteId === routeId) {
    selectedFlightRouteId = null
    flightRoutes?.setSelectedRoute(null)
    setPinnedFlightRoute(null)
    tooltip.hide()
    return
  }

  selectedFlightRouteId = routeId
  flightRoutes?.setSelectedRoute(routeId)
  flightRoutes?.setHoverRoute(null)
  setPinnedFlightRoute(routeId)
  showFlightTooltip(routeId, clientX, clientY)

  // Focus the globe to the arc midpoint (Google-style "route focus").
  const info = flightRoutes?.getRouteInfo(routeId)
  if (!info) return
  if (!Number.isFinite(Number(info.midX)) || !Number.isFinite(Number(info.midY)) || !Number.isFinite(Number(info.midZ))) return

  globeAnim = null
  velYaw = 0
  velPitch = 0
  globeGroup.updateMatrixWorld(true)
  const midWorld = globeGroup.localToWorld(
    new THREE.Vector3(Number(info.midX), Number(info.midY), Number(info.midZ))
  )
  focusGlobeToPoint(midWorld, 980)

  // Subtle zoom response: short routes feel closer, long-haul keeps context.
  const distanceKm = Number(info.distanceKm)
  zoomToSubtle(computeRouteZoomTarget(distanceKm), 980, 0.72)
}

function setHoverRouteCouplingCountry(iso3: string | null) {
  if (isCountrySelected || selectedFlightRouteId !== null) return
  const normalized = iso3 && iso3 !== '-99' ? iso3 : null
  if (hoveredCountryRouteFocusIso3 === normalized) return
  hoveredCountryRouteFocusIso3 = normalized
}

function clearHoverRouteCouplingCountry() {
  if (hoveredCountryRouteFocusIso3 === null) return
  hoveredCountryRouteFocusIso3 = null
}

function getFlightHit(clientX: number, clientY: number, lineThreshold = FLIGHT_CLICK_THRESHOLD) {
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
  const zoomOut = 1 - getCameraZoom01(camera.position.length())
  const adaptiveThreshold = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(lineThreshold * 0.82, lineThreshold * 1.38, zoomOut),
    0.03,
    0.2
  )
  ;(raycaster.params.Line as any).threshold = adaptiveThreshold
  const lineHit = raycaster.intersectObject(flightRoutes.hitLines ?? flightRoutes.lines, false)[0]
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
  clearHoverRouteCouplingCountry()
  clearHighlight(globeGroup)
  tooltip.hide()
  setSelectedHighlight(feature, globeGroup, GLOBE_RADIUS)
  rememberRecentCountry(feature)
  isCountrySelected = true
  selectedCountryIso3 = iso3 || null
  setGlobeBreadcrumbs(getCountryBreadcrumbs(getFeatureLabel(feature)))
  const flightsStats = flightRoutes ? flightRoutes.getCountryFlightStats(iso3, performance.now() * 0.001) : null
  showCountryPanel(feature.properties, flightsStats, 'selected')
  showFocusDim()
  selectedFlightRouteId = null
  flightRoutes?.setSelectedRoute(null)
  flightRoutes?.setHoverRoute(null)
  setPinnedFlightRoute(null)
  flightRoutes?.setFocusCountry(iso3 || null)
  const spanDeg = estimateCountrySpanDeg(feature)
  velYaw = 0
  velPitch = 0
  const focusPoint = worldPoint ?? getFeatureFocusPoint(feature)
  focusGlobeToPoint(focusPoint.clone(), 1200)

  if (countryClickZoomLevel !== null) {
    zoomTo(countryClickZoomLevel, countryClickZoomDuration ?? 1120)
    return
  }

  // Subtle zoom: small countries get a touch closer; big ones keep context.
  zoomToSubtle(computeCountryZoomTarget(spanDeg), countryClickZoomDuration ?? 1120, 0.74)
}

function navigateToWorldFromBreadcrumb() {
  clearSelectionUIState()
  globeAnim = null
  velYaw = 0
  velPitch = 0
  zoomTo(maxZoomDistance, 900)
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

function clearHoverInteractionState() {
  clearHoverRouteCouplingCountry()
  flightRoutes?.setHoverRoute(null)
  clearHighlight(globeGroup)
  applyDefaultTooltipChrome()
  tooltip.hide()
  lastHoverKey = ''
  renderer.domElement.style.cursor = 'default'
}

function onPointerHover(e: PointerEvent) {
  renderer.domElement.style.cursor = 'default'
  if (!countriesGeoJSON) return

  const elUnderPointer = document.elementFromPoint(e.clientX, e.clientY)
  if (elUnderPointer instanceof Element && elUnderPointer.closest('#country-panel')) {
    renderer.domElement.style.cursor = 'default'
    return
  }
  if (isEventOverUI(elUnderPointer)) {
    clearHoverInteractionState()
    return
  }

  // durante drag, não faz hover (fica muito mais "Google")
  if (isDragging) {
    clearHoverInteractionState()
    return
  }

  // After a drag, give a tiny cooldown before showing hover again.
  if (performance.now() < dragSuppressUntil) {
    clearHoverInteractionState()
    return
  }

  const countryPick = getCountryPick(e.clientX, e.clientY)
  const feature = countryPick?.feature ?? null
  if (feature) {
    // Country hover takes priority over flight hover.
    flightRoutes?.setHoverRoute(null)
    const iso3 = getISO3(feature.properties)
    if (isCountrySelected && selectedCountryIso3 && iso3 === selectedCountryIso3) {
      clearHoverRouteCouplingCountry()
      clearHighlight(globeGroup)
      applyDefaultTooltipChrome()
      tooltip.hide()
      lastHoverKey = ''
      renderer.domElement.style.cursor = 'default'
      return
    }

    // evita recalcular highlight a cada pixel
    const key = feature.properties?.ISO_A3 || feature.properties?.ADMIN || feature.properties?.NAME || 'country'
    if (key !== lastHoverKey) {
      lastHoverKey = key
      highlightCountryFromFeature(feature, globeGroup, GLOBE_RADIUS)
    }
    setHoverRouteCouplingCountry(iso3)

    renderer.domElement.style.cursor = 'pointer'
    showCountryTooltip(feature, e.clientX, e.clientY)
    return
  }

  const flightHit = getFlightHit(e.clientX, e.clientY, FLIGHT_HOVER_THRESHOLD)
  if (flightHit) {
    applyFlightHover(flightHit.routeId, e.clientX, e.clientY)
    return
  }

  clearHoverInteractionState()
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
  updateSelectedHighlight(globeGroup, now, cameraDistance)
  updateCountryHighlight(now)

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
    const zoom01 = getCameraZoom01(cameraDistance)
    const u = 1 - zoom01
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
        const baseGradient = mat.userData.baseGradientStrength ?? (mat.uniforms as any).uGradientStrength?.value ?? 0
        if ((mat.uniforms as any).uGradientStrength) {
          ;(mat.uniforms as any).uGradientStrength.value = baseGradient * THREE.MathUtils.lerp(0.68, 1.0, zoom01)
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
        const baseGradient = mat.userData.baseGradientStrength ?? (mat.uniforms as any).uGradientStrength?.value ?? 0
        if ((mat.uniforms as any).uGradientStrength) {
          ;(mat.uniforms as any).uGradientStrength.value = baseGradient * THREE.MathUtils.lerp(0.56, 0.9, zoom01)
        }
      })
    }
  }
  if (languagePoints) {
    languagePoints.material.uniforms.uTime.value = now
    languagePoints.material.uniforms.uCameraDistance.value = cameraDistance
    if (airportRevealStartedAt < 0) {
      airportRevealStartedAt = now
    }
    const airportRevealT = THREE.MathUtils.clamp(
      (now - airportRevealStartedAt) / AIRPORT_REVEAL_DURATION_SECONDS,
      0,
      1
    )
    languagePoints.material.uniforms.uRevealProgress.value = THREE.MathUtils.smoothstep(
      airportRevealT,
      0,
      1
    )
  }
  if (flightRoutes) {
    flightRoutes.update(deltaSeconds, now, cameraDistance)
  }
  if (star) {
    const mat = star.material as THREE.ShaderMaterial
    if (mat.uniforms?.uTime) {
      mat.uniforms.uTime.value = now
    }
    if (mat.uniforms?.uOpacity) {
      const zoom01 = getCameraZoom01(cameraDistance)
      mat.uniforms.uOpacity.value = THREE.MathUtils.lerp(visualStarOpacityFar, visualStarOpacityNear, zoom01)
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
    } else if ((!hasUserInteracted || isMobileZoomLocked()) && !isCountrySelected && selectedFlightRouteId === null) {
      // Desktop: spin until first user interaction.
      // Mobile: always spin when nothing is selected (resumes after card is closed).
      yawAccum += AUTO_ROTATE_SPEED * deltaSeconds
      applyYawPitchToGlobe()
    }
  }

  // Solar direction — used by atmosphere glow and night lights.
  // The lighting shell in spotlight mode uses camera direction instead (handled below).
  if (atmosphere || nightLights) {
    if (nowMs - _lastSunUpdateMs > 1500) {
      _sunLocalDir.copy(getSunDirectionUTC(new Date()))
      _lastSunUpdateMs = nowMs
    }
    _sunWorldDir.copy(_sunLocalDir).applyQuaternion(globeGroup.quaternion)
  }

  if (lightingShell && USER_LIGHT_ENABLED) {
    // Gaussian soft light — no hotspot, smooth wide blob facing the camera.
    lightingShell.dayMaterial.uniforms.uLightDir.value.copy(USER_LIGHT_DIR)
    lightingShell.dayMaterial.uniforms.uDayStrength.value = USER_LIGHT_INTENSITY
    ;(lightingShell.dayMaterial.uniforms as any).uGaussianFalloff.value = USER_GAUSSIAN_FALLOFF
  }
  if (atmosphere) {
    atmosphere.setLightDir(_sunWorldDir)
  }
  if (nightLights) {
    nightLights.update(now, cameraDistance, _sunWorldDir)
  }

  controls.update()
  renderer.render(scene, camera)
}

let animationLoopStarted = false

function ensureAnimationLoopStarted() {
  if (animationLoopStarted) return
  animationLoopStarted = true
  animate()
}

/**
 * Init
 */
async function init() {
  const geojsonPromise = loadGeoJSON(COUNTRIES_GEOJSON_PATH)
  const defaultAirportsFile = options.useFullAirportsDataset !== false ? 'airports.json' : 'airports_points.json'
  const airportsFile = (options.airportsDataFile ?? defaultAirportsFile).replace(/^\/+/, '')
  const routesFile = (options.routesDataFile ?? 'flights_enriched.json').replace(/^\/+/, '')
  const airportsResponsePromise = fetch(resolveAssetPath(`data/${airportsFile}`))
  const enrichedFlightsResponsePromise = fetch(resolveAssetPath(`data/${routesFile}`))

  depthMaskMesh = createDepthMaskSphere(GLOBE_RADIUS)
  globeGroup.add(depthMaskMesh)
  // ⭐ starfield (não dentro do globeGroup!)
  star = createStarfieldShader({ count: 5200, radius: 420, size: 0.82, opacity: 0.34 })
  scene.add(star.points)

  // layers
  innerSphereMesh = createInnerSphere(GLOBE_RADIUS)
  globeGroup.add(innerSphereMesh)
  lightingShell = createLightingShell(GLOBE_RADIUS)
  globeGroup.add(lightingShell.group)
  atmosphere = createAtmosphere(GLOBE_RADIUS, camera)
  globeGroup.add(atmosphere.group)

  applyVisualPreset()
  ensureAnimationLoopStarted()
  startIntroAnimation()
  await waitForAnimationFrames(INTRO_BOOTSTRAP_FRAMES)

  const geojson = await geojsonPromise
  countriesGeoJSON = geojson
  countrySearchIndex = buildCountrySearchIndex(geojson)

  // Single source of truth for all country-driven layers (render + hover + lookup).
  landWater = createLandWaterLayer(geojson, GLOBE_RADIUS)
  globeGroup.add(landWater.mesh)

  countriesLines = createCountries(geojson, GLOBE_RADIUS, camera)
  globeGroup.add(countriesLines.lines)

  triGrid = createAdaptiveTriGrid(GLOBE_RADIUS, camera)
  globeGroup.add(triGrid.group)

  latLonGrid = createAdaptiveLatLonGrid(GLOBE_RADIUS, camera)
  globeGroup.add(latLonGrid.group)

  applyVisualPreset()
  await waitForAnimationFrames(1)

  await waitForIntroAnimationsToSettle()
  await waitForDelay(INTRO_FLIGHT_BOOTSTRAP_DELAY_MS)
  await waitForBrowserIdle(160)

  const rawAirportsJson = await parseJsonResponse<any>(
    airportsResponsePromise,
    'Failed to load airport points'
  )
  // airports.json wraps records under { records: [...] }; airports_points.json is a plain array.
  const baseAirports: any[] = Array.isArray(rawAirportsJson)
    ? rawAirportsJson
    : Array.isArray(rawAirportsJson?.records)
      ? rawAirportsJson.records
      : []
  const denseAirports = SHOW_NIGHT_LIGHTS
    ? inflateAirportsDataset(baseAirports, countriesGeoJSON, {
        targetCount: SYNTHETIC_AIRPORT_TARGET,
        minSpacingDeg: AIRPORT_MIN_SPACING_DEG
      })
    : []
  const allowedKinds = options.airportKinds ?? ['large_airport', 'medium_airport', 'small_airport']
  const airportPointData = (Array.isArray(baseAirports) ? baseAirports : []).filter(
    (a: any) => !a.kind || allowedKinds.includes(a.kind)
  )
  const baseCount = airportPointData.length
  const rawRenderLimit = Number(options.airportRenderLimit)
  const airportRenderLimit = Number.isFinite(rawRenderLimit) && rawRenderLimit > 0
    ? Math.floor(rawRenderLimit)
    : null
  // Render slice: respects the limit; full data always goes to the aggregation below.
  const airportRenderData = airportRenderLimit !== null
    ? airportPointData.slice(0, airportRenderLimit)
    : airportPointData
  console.info(
    `[airports] file=${airportsFile} total=${baseCount} rendering=${airportRenderData.length}${airportRenderLimit !== null ? ` (limit=${airportRenderLimit})` : ''}`
  )
  // Build per-country airport count from full dataset — separate metric from route counts.
  const airportCountByIso3 = buildAirportCountByIso3(airportPointData, countriesGeoJSON)
  if (SHOW_AIRPORT_POINTS) {
    languagePoints = createLanguagePoints(airportRenderData, GLOBE_RADIUS)
    globeGroup.add(languagePoints.points)
  } else {
    languagePoints = null
  }

  if (SHOW_NIGHT_LIGHTS) {
    nightLights = createNightLights(denseAirports, GLOBE_RADIUS)
    globeGroup.add(nightLights.points)
  } else {
    nightLights = null
  }

  applyVisualPreset()
  const enrichedFlightsDataPromise = parseEnrichedFlightsResponse(
    enrichedFlightsResponsePromise,
    'Failed to load enriched flights',
    FLIGHT_ROUTE_TARGET
  )

  await waitForAnimationFrames(1)
  await waitForDelay(
    SHOW_AIRPORT_POINTS
      ? Math.max(140, Math.round(AIRPORT_REVEAL_DURATION_SECONDS * 1000 * 0.34))
      : 110
  )
  await waitForBrowserIdle(180)

  const {
    flights: enrichedFlights,
    airports: enrichedAirports,
    countryStats: enrichedCountryStats
  } = await enrichedFlightsDataPromise

  await waitForAnimationFrames(1)
  await waitForBrowserIdle(180)

  flightRoutes = createFlightRoutes(
    {
      flights: enrichedFlights,
      airportLookup: enrichedAirports,
      countryStats: enrichedCountryStats,
      airportCountByIso3
    },
    GLOBE_RADIUS,
    countriesGeoJSON,
    {
      routeCount: FLIGHT_ROUTE_TARGET ?? undefined,
      planesPerRoute: FLIGHT_PLANES_PER_ROUTE,
      planeDensityScale: FLIGHT_PLANE_DENSITY_SCALE,
      currentTimeSeconds: performance.now() * 0.001
    }
  )
  console.info(
    `[flights] file=${routesFile} source_flights=${enrichedFlights.length} route_target=${FLIGHT_ROUTE_TARGET ?? 'all'} planes_per_route=${FLIGHT_PLANES_PER_ROUTE} plane_density_scale=${FLIGHT_PLANE_DENSITY_SCALE.toFixed(2)} country_stats=${enrichedCountryStats ? Object.keys(enrichedCountryStats).length : 0} airport_countries=${airportCountByIso3.size}`
  )
  globeGroup.add(flightRoutes.group)
  applyFlightVisualization(initialFlightVisualizationMode)
  applyHeatmap(initialHeatmapEnabled)

  if (animatedCards && !hasUserInteracted && !isCountrySelected) {
    animatedCards.start(() => {
      if (!flightRoutes) return null
      for (let attempt = 0; attempt < 12; attempt++) {
        const id = Math.floor(Math.random() * 16000)
        const info = flightRoutes.getRouteInfo(id)
        if (info && (info.fromCode || info.toCode)) return info
      }
      return null
    })
  }

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
  window.addEventListener('navpass:close-country-panel', () => {
    clearSelectionUIState()
  })
  window.addEventListener('navpass:breadcrumb-select', (event) => {
    const detail =
      event instanceof CustomEvent && typeof event.detail === 'object' && event.detail
        ? (event.detail as { levelId?: string })
        : null
    if (detail?.levelId !== 'home' && detail?.levelId !== 'map') return
    markUserInteracted()
    navigateToWorldFromBreadcrumb()
  })

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    applyResponsiveZoomMode()
    syncCountryHighlightResolution()
  })

  if (scrollResetsView) {
    let scrollResetTimer: ReturnType<typeof setTimeout> | null = null

    window.addEventListener('wheel', (event) => {
      // Never act while the pointer is inside the card UI.
      if (event.target instanceof Element && event.target.closest('#country-panel')) return

      // Always dismiss hover tooltip and highlight on scroll — prevents stale overlays.
      tooltip.hide()
      clearSelectedHighlight(globeGroup)
      fadeOutSelected(globeGroup)
      lastHoverKey = ''

      // Full selection reset only when a country or flight route is open.
      if (!isCountrySelected && selectedFlightRouteId === null) return

      // Debounce: cancel the previous pending reset so rapid scrolling only triggers one reset.
      if (scrollResetTimer !== null) {
        clearTimeout(scrollResetTimer)
      }
      scrollResetTimer = setTimeout(() => {
        scrollResetTimer = null
        clearSelectionUIState()
        globeAnim = null
        velYaw = 0
        velPitch = 0
        zoomTo(maxZoomDistance, 900)
      }, 250)
    }, { passive: true })
  }

  window.addEventListener('pointermove', onPointerHover)
}

  function setGlowColor(color: THREE.ColorRepresentation) {
    theme.atmosphere.glowColor = color
    if (atmosphere) {
      atmosphere.setGlowColor(new THREE.Color(color))
    }
  }

  const ready = init()
  return { ready, setGlowColor }
}
