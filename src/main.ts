/**
 * NAVPASS Globe — URL Parameter Reference
 * ========================================
 *
 * The globe is fully configurable via query string parameters, making it easy
 * to embed in iframes or configure per-deployment without touching code.
 *
 * Example:
 *   ?bgColor=0A1628&accentColor=00B4FF&showZoomControls=1&lightIntensity=0.6
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GENERAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * assetBaseUrl
 *   Base URL prefix for all static data files (GeoJSON, airports, flights…).
 *   Useful when the globe is served from a subdirectory or a CDN.
 *   Default: Vite's BASE_URL (usually "" or "/").
 *
 * heatmap=0|1
 *   Show the flight density heatmap overlay on startup.
 *   Default: 0 (off). Can be toggled in the UI at any time.
 *
 * flightMode=legacy|reengineered
 *   Choose the flight-rendering pipeline.
 *   "reengineered" (default) uses GPU-accelerated arcs with animated planes.
 *   "legacy" uses a simpler line-based renderer without planes.
 *
 * introAnimation=0|1
 *   Play the globe spin-in intro sequence on load.
 *   Default: 1 (on).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA FILES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * routesDataFile=<filename>
 *   Override the enriched flight routes file loaded from data/.
 *   Must be a JSON file in the NavPass enriched-flights format.
 *   Default: "flights_enriched.json".
 *
 * airportsDataFile=<filename>
 *   Override the airports data file. Takes precedence over useFullAirportsDataset.
 *   Expects an array of { latitude, longitude } objects, or the full airports.json
 *   format ({ records: [...] }) with an optional iso_3_code field for fast country
 *   lookup. Default: resolved from useFullAirportsDataset.
 *
 * useFullAirportsDataset=0|1
 *   When 1 (default), loads airports.json (55 000+ global airports).
 *   When 0, loads airports_points.json (a smaller legacy subset, ~530 airports).
 *   Overridden by airportsDataFile when provided.
 *   Default: 1.
 *
 * airportRenderLimit=<number>
 *   Cap the number of airport dot points rendered on the globe. Useful on low-end
 *   devices to reduce GPU load. The full dataset is still used for per-country
 *   airport count aggregation — only the rendered dots are limited.
 *   Default: no limit (all airports are rendered).
 *
 * airportKinds=<kind>[,<kind>…]
 *   Comma-separated list of airport `kind` values to include. Applied before both
 *   rendering and per-country aggregation.
 *   Valid values: large_airport, medium_airport, small_airport, heliport, closed, balloonport
 *   Default: large_airport,medium_airport,small_airport
 *   Example: airportKinds=large_airport,medium_airport
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FLIGHT DENSITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * routeCount=<number>
 *   Maximum number of flight routes drawn on the globe.
 *   Default: 180.
 *
 * planesPerRoute=<number>
 *   Number of animated plane dots per route arc.
 *   Default: determined by the flight engine.
 *
 * planeDensityScale=<number>
 *   Multiplier for overall plane density (0.1 = sparse, 2.0 = dense).
 *   Default: 1.0.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAMERA & ZOOM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * minZoomDistance=<number>
 *   Minimum camera distance from the globe centre (closest zoom in).
 *   Clamped to [12, 28]. Default: 14.
 *
 * maxZoomDistance=<number>
 *   Maximum camera distance from the globe centre (furthest zoom out).
 *   Clamped to [minZoomDistance + 2, 60]. Default: 28.
 *   Country-click and animated transitions never exceed this value.
 *
 * countryClickZoomLevel=<number>
 *   Fixed camera distance to animate to when a country is clicked.
 *   When omitted the globe computes a smart zoom based on country size.
 *   Clamped to [minZoomDistance, maxZoomDistance].
 *
 * countryClickZoomDuration=<ms>
 *   Duration of the country-click zoom animation in milliseconds.
 *   Clamped to [120, 8000]. Default: 1120 ms.
 *
 * disableScrollZoom=0|1  (alias: disableScroll)
 *   Prevent the user from zooming with the mouse wheel / trackpad.
 *   Default: 0 (scroll-zoom enabled).
 *
 * scrollResetsView=0|1
 *   When 1 (default), scrolling while a country card is open closes the card
 *   and resets the camera to maxZoomDistance after a short debounce (250 ms).
 *   Set to 0 to keep the card open while the user scrolls.
 *   Default: 1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UI CONTROLS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * showZoomControls=0|1
 *   Show the + / − zoom buttons in the bottom-left corner.
 *   When 0 the buttons are removed from the DOM entirely (no layout shift).
 *   Default: 0.
 *
 * showBreadcrumbs=0|1
 *   Show the navigation breadcrumb trail (Home › Map › Country).
 *   Default: 1.
 *
 * breadcrumbOffsetLeft=<px>
 *   Horizontal distance from the left edge of the viewport to the breadcrumbs.
 *   Default: 50.
 *
 * breadcrumbOffsetTop=<px>
 *   Vertical distance from the top edge of the viewport to the breadcrumbs.
 *   Default: 92.
 *
 * showCountryCardCloseButton=0|1
 *   Show the × close button on the selected-country card.
 *   When 0 the card can still be closed by clicking elsewhere or scrolling.
 *   Default: 1.
 *
 * animatedCards=0|1
 *   Enable animated entrance/exit transitions on info cards.
 *   Default: determined by the component.
 *
 * disableMapInteraction=0|1
 *   Prevent all click/drag interaction with the globe (hover still works).
 *   Useful for purely decorative or read-only embeds.
 *   Default: 0.
 *
 * searchBarX=<number>
 *   Custom X offset for the country search bar.
 *
 * searchBarY=<number>
 *   Custom Y offset for the country search bar.
 *
 * showSearchBarMobile=0|1
 *   Force the search bar to appear on mobile viewports.
 *   Default: determined by breakpoint.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CARD / UI THEMING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * accentColor=<hex>
 *   Color applied to all UI accent elements: the live-status dot on the country
 *   card, the active breadcrumb label, and the card hover-glow border.
 *   Accepts #RRGGBB, #RGB, or 0xRRGGBB. Default: #ECB200 (gold).
 *
 * cardBorderColor=<hex|rgba>
 *   Color of the country card's outer border.
 *   Accepts #RRGGBB, #RGB, 0xRRGGBB, or any CSS color string.
 *   Default: rgba(255, 255, 255, 0.08).
 *
 * cardBorderWidth=<number>
 *   Width in pixels of the country card's outer border.
 *   Use 0 to remove the border entirely. Default: 1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOBE THEMING — QUICK SHORTCUTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These are convenience aliases that map to the full theme object.
 * For full control use the theme= JSON param or theme.* dot-notation params.
 *
 * bgColor=<hex>
 *   Background, inner sphere, and depth-mask colour. Sets the "space" colour
 *   behind the globe. Default: dark navy (#0A1628).
 *
 * gridMainColor=<hex>
 *   Colour of the latitude/longitude and triangular grid lines.
 *
 * gridEffectColor=<hex>
 *   Colour of the shimmer/pulse effect on the grid lines.
 *
 * countryLineColor=<hex>
 *   Colour of the country border lines drawn on the globe surface.
 *
 * hoverColor=<hex>
 *   Base colour for the country hover highlight (sets hoverA, hoverB, hoverCore).
 *
 * hoverAccentColor=<hex>
 *   Secondary colour for the hover highlight's outer glow (hoverB).
 *
 * hoverCoreColor=<hex>
 *   Colour of the sharp inner core of the hover highlight.
 *
 * hoverPaletteMix=<0–1>
 *   Blend between the primary and accent hover colours. 0 = full primary, 1 = full accent.
 *
 * selectedColor=<hex>
 *   Base colour for the selected-country highlight (sets selectedA–D).
 *
 * selectedAccentColor=<hex>
 *   Accent colour for the selected highlight's secondary passes (selectedB, selectedD).
 *
 * planeCoreColor=<hex>   planeGlowColor=<hex>   planeTintColor=<hex>   planeAccentColor=<hex>
 *   Colours for the animated plane dots on flight arcs.
 *
 * airportDotColor=<hex>  (aliases: airportPulseColor, airportColor)
 *   Colour of the airport dot points rendered on the globe surface.
 *
 * glowColor=<hex>
 *   Colour of the atmospheric glow ring around the globe edge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOBE THEMING — FULL JSON
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * theme=<JSON>
 *   Full theme object as a URL-encoded JSON string. Merged with any shortcut
 *   params above (shortcut params take precedence).
 *
 * theme.<section>.<key>=<value>
 *   Dot-notation override for individual theme properties.
 *   Example: theme.atmosphere.glowColor=%23FF6B35
 *   Merged on top of the theme= JSON, with highest priority.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIRECTIONAL LIGHTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * lightIntensity=<0–2>
 *   Enables a soft directional light on the globe surface.
 *   0 (default) disables the effect. 0.3–0.8 gives a subtle one-sided glow.
 *   Values above 1.0 produce a strong specular-like highlight.
 *
 * lightColor=<hex>
 *   Tint colour of the illuminated side of the light blob.
 *   Defaults to the theme's day colour (light blue).
 *
 * lightRadius=<0.01–1.0>
 *   Half-intensity radius of the Gaussian light blob.
 *   This is the angular distance (as a fraction of the visible hemisphere)
 *   at which brightness drops to 50 %.
 *   0.05 = tight spotlight  |  0.35 = medium blob (default)  |  0.8 = near-full wash.
 *
 * lightX=<number>  lightY=<number>  lightZ=<number>
 *   Direction vector of the light in world space. When omitted the light always
 *   faces the camera (the lit spot stays centred on the visible face of the globe).
 */

import globe, { type GlobeOptions, type GlobeTheme } from './index'
import type { FlightVisualizationMode } from './globe/flights'

function parseBooleanParam(params: URLSearchParams, key: string): boolean | undefined {
  const value = params.get(key)
  if (value === null) return undefined

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return undefined
}

function parseNumberParam(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key)
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseFlightModeParam(value: string | null): FlightVisualizationMode | undefined {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'legacy' || normalized === 'reengineered') return normalized
  return undefined
}

function normalizeAssetBaseUrl(value: string | null | undefined): string {
  if (!value) return ''
  const normalized = value.trim().replace(/\/+$/, '')
  return normalized === '/' ? '' : normalized
}

function normalizeHexColor(value: string | null): string | undefined {
  if (value === null) return undefined
  let hex = value.trim()
  if (!hex) return undefined

  if (hex.startsWith('#')) {
    hex = hex.slice(1)
  } else if (/^0x/i.test(hex)) {
    hex = hex.slice(2)
  }

  if (!/^[0-9a-fA-F]+$/.test(hex)) return undefined
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((part) => part + part)
      .join('')
  }
  if (hex.length !== 6) return undefined
  return `#${hex.toUpperCase()}`
}

function parseHexColorParam(params: URLSearchParams, key: string): string | undefined {
  return normalizeHexColor(params.get(key))
}

/**
 * Parses a color param that may be a hex color OR a raw CSS color string
 * (e.g. rgba(...)). Hex values are normalised; other strings are passed through.
 */
function parseCssColorParam(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)
  if (!raw || !raw.trim()) return undefined
  const hex = normalizeHexColor(raw)
  if (hex) return hex
  // Accept raw CSS color strings (rgba, hsl, etc.) as-is
  return raw.trim()
}

function parseColorThemeParams(params: URLSearchParams): Partial<GlobeTheme> | undefined {
  const bgColor = parseHexColorParam(params, 'bgColor')
  const gridEffectColor = parseHexColorParam(params, 'gridEffectColor')
  const gridMainColor = parseHexColorParam(params, 'gridMainColor')
  const countryLineColor = parseHexColorParam(params, 'countryLineColor')
  const hoverColor = parseHexColorParam(params, 'hoverColor')
  const hoverAccentColor = parseHexColorParam(params, 'hoverAccentColor')
  const hoverCoreColor = parseHexColorParam(params, 'hoverCoreColor')
  const hoverPaletteMix = parseNumberParam(params, 'hoverPaletteMix')
  const selectedColor = parseHexColorParam(params, 'selectedColor')
  const selectedAccentColor = parseHexColorParam(params, 'selectedAccentColor')
  const planeCoreColor = parseHexColorParam(params, 'planeCoreColor')
  const planeGlowColor = parseHexColorParam(params, 'planeGlowColor')
  const planeTintColor = parseHexColorParam(params, 'planeTintColor')
  const planeAccentColor = parseHexColorParam(params, 'planeAccentColor')
  const airportDotColor =
    parseHexColorParam(params, 'airportDotColor') ??
    parseHexColorParam(params, 'airportPulseColor') ??
    parseHexColorParam(params, 'airportColor')
  const glowColor = parseHexColorParam(params, 'glowColor')

  if (
    !bgColor &&
    !gridEffectColor &&
    !gridMainColor &&
    !countryLineColor &&
    !hoverColor &&
    !hoverAccentColor &&
    !hoverCoreColor &&
    hoverPaletteMix === undefined &&
    !selectedColor &&
    !selectedAccentColor &&
    !planeCoreColor &&
    !planeGlowColor &&
    !planeTintColor &&
    !planeAccentColor &&
    !airportDotColor &&
    !glowColor
  ) {
    return undefined
  }

  const theme: Partial<GlobeTheme> = {}

  if (bgColor) {
    theme.scene = {
      ...(theme.scene ?? {}),
      background: bgColor,
      depthMask: bgColor,
      innerSphere: bgColor
    }
  }

  if (gridEffectColor || gridMainColor) {
    theme.grids = { ...(theme.grids ?? {}) }
    if (gridEffectColor) {
      theme.grids.triShimmerColor = gridEffectColor
      theme.grids.latLonShimmerColor = gridEffectColor
    }
    if (gridMainColor) {
      theme.grids.triColor = gridMainColor
      theme.grids.latLonColor = gridMainColor
    }
  }

  if (countryLineColor) {
    theme.countries = {
      ...(theme.countries ?? {}),
      border: countryLineColor
    }
  }

  if (hoverColor || hoverAccentColor || hoverCoreColor || hoverPaletteMix !== undefined) {
    theme.highlights = { ...(theme.highlights ?? {}) }
    if (hoverColor) {
      theme.highlights.hoverA = hoverColor
      theme.highlights.hoverB = hoverColor
      theme.highlights.hoverCore = hoverColor
    }
    if (hoverAccentColor) {
      theme.highlights.hoverB = hoverAccentColor
    }
    if (hoverCoreColor) {
      theme.highlights.hoverCore = hoverCoreColor
    }
    if (hoverPaletteMix !== undefined) {
      theme.highlights.hoverPaletteMix = Math.max(0, Math.min(1, hoverPaletteMix))
    }
  }

  if (selectedColor || selectedAccentColor) {
    theme.highlights = { ...(theme.highlights ?? {}) }
    if (selectedColor) {
      theme.highlights.selectedA = selectedColor
      theme.highlights.selectedB = selectedColor
      theme.highlights.selectedC = selectedColor
      theme.highlights.selectedD = selectedColor
    }
    if (selectedAccentColor) {
      theme.highlights.selectedB = selectedAccentColor
      theme.highlights.selectedD = selectedAccentColor
    }
  }

  if (planeCoreColor || planeGlowColor || planeTintColor || planeAccentColor) {
    theme.flights = { ...(theme.flights ?? {}) }
    if (planeCoreColor) {
      theme.flights.planeCoreColor = planeCoreColor
    }
    if (planeGlowColor) {
      theme.flights.planeGlowColor = planeGlowColor
    }
    if (planeTintColor) {
      theme.flights.planeTintColor = planeTintColor
    }
    if (planeAccentColor) {
      theme.flights.planeAccentColor = planeAccentColor
    }
  }

  if (airportDotColor) {
    theme.points = { ...(theme.points ?? {}) }
    theme.points.dotColorMul = airportDotColor
    theme.points.dotFlowColor = airportDotColor
  }

  if (glowColor) {
    theme.atmosphere = { ...(theme.atmosphere ?? {}), glowColor }
  }

  return theme
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseThemeJsonParam(value: string | null): Partial<GlobeTheme> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? (parsed as Partial<GlobeTheme>) : undefined
  } catch {
    return undefined
  }
}

function parseThemeLeafValue(path: string[], rawValue: string): string | number {
  const leafKey = path[path.length - 1]
  if (leafKey === 'hoverPaletteMix') {
    const parsed = Number(rawValue)
    if (Number.isFinite(parsed)) return parsed
  }
  if (/^0x[0-9a-f]+$/i.test(rawValue)) {
    return Number(rawValue)
  }
  return rawValue
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown) {
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]
    const next = cursor[key]
    if (!isPlainObject(next)) {
      const created: Record<string, unknown> = {}
      cursor[key] = created
      cursor = created
      continue
    }
    cursor = next
  }
  cursor[path[path.length - 1]] = value
}

function parseThemeFlatParams(params: URLSearchParams): Partial<GlobeTheme> | undefined {
  const overrides: Record<string, unknown> = {}

  for (const [key, value] of params.entries()) {
    if (!key.startsWith('theme.')) continue
    const path = key.slice('theme.'.length).split('.').filter(Boolean)
    if (path.length < 2) continue
    setNestedValue(overrides, path, parseThemeLeafValue(path, value))
  }

  return Object.keys(overrides).length ? (overrides as Partial<GlobeTheme>) : undefined
}

function mergeThemes(
  base: Partial<GlobeTheme> | undefined,
  override: Partial<GlobeTheme> | undefined
): Partial<GlobeTheme> | undefined {
  if (!base && !override) return undefined
  return {
    ...(base ?? {}),
    ...(override ?? {}),
    scene: { ...(base?.scene ?? {}), ...(override?.scene ?? {}) },
    countries: { ...(base?.countries ?? {}), ...(override?.countries ?? {}) },
    grids: { ...(base?.grids ?? {}), ...(override?.grids ?? {}) },
    landWater: { ...(base?.landWater ?? {}), ...(override?.landWater ?? {}) },
    atmosphere: { ...(base?.atmosphere ?? {}), ...(override?.atmosphere ?? {}) },
    lighting: { ...(base?.lighting ?? {}), ...(override?.lighting ?? {}) },
    points: { ...(base?.points ?? {}), ...(override?.points ?? {}) },
    flights: { ...(base?.flights ?? {}), ...(override?.flights ?? {}) },
    highlights: { ...(base?.highlights ?? {}), ...(override?.highlights ?? {}) }
  }
}

function notifyParent(event: 'boot' | 'ready' | 'error', payload?: Record<string, unknown>) {
  if (window.parent === window) return
  window.parent.postMessage(
    {
      source: 'navpass-globe',
      event,
      ...(payload ?? {})
    },
    '*'
  )
}

const params = new URLSearchParams(window.location.search)
const mountTarget = document.getElementById('app') ?? document.body
const defaultAssetBaseUrl = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL
const themeFromParams = mergeThemes(parseThemeJsonParam(params.get('theme')), parseThemeFlatParams(params))
const colorThemeParams = parseColorThemeParams(params)

const options: GlobeOptions = {
  mountTarget,

  // ── General ───────────────────────────────────────────────────────────────
  assetBaseUrl: normalizeAssetBaseUrl(params.get('assetBaseUrl') ?? defaultAssetBaseUrl),
  initialHeatmapEnabled: parseBooleanParam(params, 'heatmap'),
  initialFlightVisualizationMode: parseFlightModeParam(params.get('flightMode')),
  initialIntroAnimationEnabled: parseBooleanParam(params, 'introAnimation'),

  // ── Data files ────────────────────────────────────────────────────────────
  routesDataFile: params.get('routesDataFile') ?? undefined,
  airportsDataFile: params.get('airportsDataFile') ?? undefined,
  // useFullAirportsDataset: 1 (default) → airports.json (55 000+ entries)
  //                         0           → airports_points.json (legacy, ~530 entries)
  useFullAirportsDataset: parseBooleanParam(params, 'useFullAirportsDataset'),
  // airportRenderLimit caps rendered dots; aggregation always uses the full dataset
  airportRenderLimit: parseNumberParam(params, 'airportRenderLimit'),
  // airportKinds: comma-separated kind filter; default excludes heliports, closed, balloonports
  airportKinds: params.get('airportKinds')?.split(',').map((s) => s.trim()).filter(Boolean) ?? "medium_airport,large_airport".split(','),

  // ── Flight density ────────────────────────────────────────────────────────
  routeCount: parseNumberParam(params, 'routeCount'),
  planesPerRoute: parseNumberParam(params, 'planesPerRoute'),
  planeDensityScale: parseNumberParam(params, 'planeDensityScale'),

  // ── Camera & zoom ─────────────────────────────────────────────────────────
  minZoomDistance: parseNumberParam(params, 'minZoomDistance'),
  maxZoomDistance: parseNumberParam(params, 'maxZoomDistance'),
  countryClickZoomLevel: parseNumberParam(params, 'countryClickZoomLevel'),
  countryClickZoomDuration: parseNumberParam(params, 'countryClickZoomDuration'),
  disableScrollZoom: parseBooleanParam(params, 'disableScrollZoom') ?? parseBooleanParam(params, 'disableScroll'),
  // scrollResetsView: 1 (default) — scroll while card is open → close card + reset zoom
  scrollResetsView: parseBooleanParam(params, 'scrollResetsView'),

  // ── UI controls ───────────────────────────────────────────────────────────
  // showZoomControls: 0 (default) — + / − buttons are removed from DOM when disabled
  showZoomControls: parseBooleanParam(params, 'showZoomControls') ?? false,
  showBreadcrumbs: parseBooleanParam(params, 'showBreadcrumbs') ?? true,
  breadcrumbOffsetLeft: parseNumberParam(params, 'breadcrumbOffsetLeft'),
  breadcrumbOffsetTop: parseNumberParam(params, 'breadcrumbOffsetTop'),
  showCountryCardCloseButton: parseBooleanParam(params, 'showCountryCardCloseButton') ?? true,
  animatedCards: parseBooleanParam(params, 'animatedCards'),
  disableMapInteraction: parseBooleanParam(params, 'disableMapInteraction'),
  searchBarX: parseNumberParam(params, 'searchBarX'),
  searchBarY: parseNumberParam(params, 'searchBarY'),
  showSearchBarMobile: parseBooleanParam(params, 'showSearchBarMobile'),

  // ── Card / UI theming ─────────────────────────────────────────────────────
  // highlightRenderMode: 'line2' (default) | 'line' — renderer for hover/select border line
  highlightRenderMode: (params.get('highlightRenderMode') === 'line' ? 'line' : undefined) as 'line' | undefined,
  // showSelectBacking: 1 (default) — yellow shadow backing on selected country border
  showSelectBacking: parseBooleanParam(params, 'showSelectBacking'),
  // showCountryGlow: 0 (default) — soft glow/halo around selected country border. 1 enables
  showCountryGlow: parseBooleanParam(params, 'showCountryGlow'),
  // accentColor: live dot, active breadcrumb, card hover glow. Default: #ECB200 (gold)
  accentColor: parseHexColorParam(params, 'accentColor'),
  // cardBackground: CSS background of the card panel. Accepts hex, rgba(), or 'transparent'
  cardBackground: parseCssColorParam(params, 'cardBackground'),
  // cardBackgroundColor: solid color applied to all card sections (overrides cardBackground)
  cardBackgroundColor: parseCssColorParam(params, 'cardBackgroundColor'),
  // cardBorderColor: outer border of the country card. Accepts hex or rgba(…)
  cardBorderColor: parseCssColorParam(params, 'cardBorderColor'),
  // cardBorderWidth: outer border width in px. 0 removes it. Default: 1
  cardBorderWidth: parseNumberParam(params, 'cardBorderWidth'),

  // ── Directional lighting ──────────────────────────────────────────────────
  // lightIntensity: 0 (default, off). Range 0.3–1.0 for subtle glow
  lightIntensity: parseNumberParam(params, 'lightIntensity'),
  lightColor: parseHexColorParam(params, 'lightColor'),
  // lightRadius: half-intensity blob size (0.01 = dot, 0.35 = default, 0.8 = full wash)
  lightRadius: parseNumberParam(params, 'lightRadius'),
  lightX: parseNumberParam(params, 'lightX'),
  lightY: parseNumberParam(params, 'lightY'),
  lightZ: parseNumberParam(params, 'lightZ'),

  // ── Globe theme ───────────────────────────────────────────────────────────
  // Priority: theme.* dot-params > shortcut color params (bgColor, etc.) > theme= JSON
  theme: mergeThemes(themeFromParams, colorThemeParams)
}

notifyParent('boot')

const app = globe(options)

void app.ready
  .then(() => notifyParent('ready'))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    notifyParent('error', { message })
    console.error('[navpass-globe] startup failed', error)
  })
