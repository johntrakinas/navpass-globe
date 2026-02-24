import globe, { type GlobeOptions, type GlobeTheme } from './index'
import type { FlightVisualizationMode } from './globe/flights'

type ColorPresetId = 'current' | 'suggested_lines' | 'suggested_main_lines'

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

function parseColorPresetParam(value: string | null): ColorPresetId {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return 'current'
  if (normalized === 'suggested_lines' || normalized === 'suggested-lines' || normalized === 'lines-162f50') {
    return 'suggested_lines'
  }
  if (
    normalized === 'suggested_main_lines' ||
    normalized === 'suggested-main-lines' ||
    normalized === 'main-0d1c30-lines-1a3960'
  ) {
    return 'suggested_main_lines'
  }
  return 'current'
}

function getColorPresetTheme(preset: ColorPresetId): Partial<GlobeTheme> | undefined {
  if (preset === 'suggested_lines') {
    return {
      countries: {
        border: '#162f50'
      }
    }
  }

  if (preset === 'suggested_main_lines') {
    return {
      scene: {
        background: '#0D1C30',
        depthMask: '#0D1C30',
        innerSphere: '#0D1C30'
      },
      countries: {
        border: '#1A3960'
      }
    }
  }

  return undefined
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
const colorPreset = parseColorPresetParam(params.get('colorPreset'))
const colorPresetTheme = getColorPresetTheme(colorPreset)
const themeFromParams = mergeThemes(parseThemeJsonParam(params.get('theme')), parseThemeFlatParams(params))

const options: GlobeOptions = {
  mountTarget,
  assetBaseUrl: normalizeAssetBaseUrl(params.get('assetBaseUrl') ?? defaultAssetBaseUrl),
  initialHeatmapEnabled: parseBooleanParam(params, 'heatmap'),
  initialFlightVisualizationMode: parseFlightModeParam(params.get('flightMode')),
  minZoomDistance: parseNumberParam(params, 'minZoomDistance'),
  maxZoomDistance: parseNumberParam(params, 'maxZoomDistance'),
  theme: mergeThemes(colorPresetTheme, themeFromParams)
}

notifyParent('boot')

const app = globe(options)

const colorSelect = document.getElementById('rail-color-select') as HTMLSelectElement | null
if (colorSelect) {
  colorSelect.value = colorPreset
  colorSelect.addEventListener('change', () => {
    const nextPreset = parseColorPresetParam(colorSelect.value)
    const nextParams = new URLSearchParams(window.location.search)
    if (nextPreset === 'current') {
      nextParams.delete('colorPreset')
    } else {
      nextParams.set('colorPreset', nextPreset)
    }
    const query = nextParams.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.location.assign(nextUrl)
  })
}

void app.ready
  .then(() => notifyParent('ready'))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    notifyParent('error', { message })
    console.error('[navpass-globe] startup failed', error)
  })
