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

function parseColorThemeParams(params: URLSearchParams): Partial<GlobeTheme> | undefined {
  const bgColor = parseHexColorParam(params, 'bgColor')
  const gridEffectColor = parseHexColorParam(params, 'gridEffectColor')
  const gridMainColor = parseHexColorParam(params, 'gridMainColor')
  const countryLineColor = parseHexColorParam(params, 'countryLineColor')
  const hoverColor = parseHexColorParam(params, 'hoverColor')
  const hoverAccentColor = parseHexColorParam(params, 'hoverAccentColor')
  const hoverCoreColor = parseHexColorParam(params, 'hoverCoreColor')
  const hoverPaletteMix = parseNumberParam(params, 'hoverPaletteMix')
  const planeCoreColor = parseHexColorParam(params, 'planeCoreColor')
  const planeGlowColor = parseHexColorParam(params, 'planeGlowColor')
  const planeTintColor = parseHexColorParam(params, 'planeTintColor')
  const planeAccentColor = parseHexColorParam(params, 'planeAccentColor')
  const airportDotColor =
    parseHexColorParam(params, 'airportDotColor') ??
    parseHexColorParam(params, 'airportPulseColor') ??
    parseHexColorParam(params, 'airportColor')

  if (
    !bgColor &&
    !gridEffectColor &&
    !gridMainColor &&
    !countryLineColor &&
    !hoverColor &&
    !hoverAccentColor &&
    !hoverCoreColor &&
    hoverPaletteMix === undefined &&
    !planeCoreColor &&
    !planeGlowColor &&
    !planeTintColor &&
    !planeAccentColor &&
    !airportDotColor
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
  assetBaseUrl: normalizeAssetBaseUrl(params.get('assetBaseUrl') ?? defaultAssetBaseUrl),
  initialHeatmapEnabled: parseBooleanParam(params, 'heatmap'),
  initialFlightVisualizationMode: parseFlightModeParam(params.get('flightMode')),
  initialIntroAnimationEnabled: parseBooleanParam(params, 'introAnimation'),
  disableScrollZoom: parseBooleanParam(params, 'disableScrollZoom') ?? parseBooleanParam(params, 'disableScroll'),
  showBreadcrumbs: parseBooleanParam(params, 'showBreadcrumbs') ?? true,
  breadcrumbOffsetLeft: parseNumberParam(params, 'breadcrumbOffsetLeft'),
  breadcrumbOffsetTop: parseNumberParam(params, 'breadcrumbOffsetTop'),
  showZoomControls: parseBooleanParam(params, 'showZoomControls') ?? true,
  countryClickZoomLevel: parseNumberParam(params, 'countryClickZoomLevel'),
  countryClickZoomDuration: parseNumberParam(params, 'countryClickZoomDuration'),
  showCountryCardCloseButton: parseBooleanParam(params, 'showCountryCardCloseButton') ?? true,
  minZoomDistance: parseNumberParam(params, 'minZoomDistance'),
  maxZoomDistance: parseNumberParam(params, 'maxZoomDistance'),
  routeCount: parseNumberParam(params, 'routeCount'),
  planesPerRoute: parseNumberParam(params, 'planesPerRoute'),
  planeDensityScale: parseNumberParam(params, 'planeDensityScale'),
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
