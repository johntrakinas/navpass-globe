const UI_ROOT_ID = 'globe-ui'
const PANEL_ID = 'country-panel'
const FOCUS_DIM_ID = 'focus-dim'
const STYLE_ID = 'navpass-country-panel-style'

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #globe-ui { position: fixed; inset: 0; z-index: 4; pointer-events: none; }
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
      color: #ffffff;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.42);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 460ms ease, transform 560ms ease, border-color 280ms ease, box-shadow 280ms ease;
      z-index: 4;
    }
    #country-panel.is-visible { opacity: 1; transform: translateY(0); }
    #country-panel.is-visible:hover {
      border-color: rgba(236, 178, 0, 0.78);
      box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.42),
        0 0 58px -16px rgba(236, 178, 0, 0.62);
    }
    #focus-dim {
      position: fixed;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      opacity: 0;
      background: transparent;
      transition: opacity 0ms linear;
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
      #country-panel { right: 12px !important; bottom: 74px !important; width: calc(100vw - 24px); max-height: 70vh; }
    }
    @media (max-width: 700px) {
      .panel-tooltip-title, .panel-tooltip-stat-value, .panel-tooltip-total-value { font-size: 34px; }
      .panel-tooltip-aircraft-value { font-size: 16px; }
    }
  `
  document.head.appendChild(style)
}

function getOrCreateUiRoot() {
  let uiRoot = document.getElementById(UI_ROOT_ID) as HTMLDivElement | null
  if (!uiRoot) {
    uiRoot = document.createElement('div')
    uiRoot.id = UI_ROOT_ID
    document.body.appendChild(uiRoot)
  }
  return uiRoot
}

function getOrCreatePanel() {
  const uiRoot = getOrCreateUiRoot()
  let panel = document.getElementById(PANEL_ID) as HTMLDivElement | null
  if (!panel) {
    panel = document.createElement('div')
    panel.id = PANEL_ID
    uiRoot.appendChild(panel)
  }
  return panel
}

function getOrCreateFocusDim() {
  let focusDim = document.getElementById(FOCUS_DIM_ID) as HTMLDivElement | null
  if (!focusDim) {
    focusDim = document.createElement('div')
    focusDim.id = FOCUS_DIM_ID
    document.body.appendChild(focusDim)
  }
  return focusDim
}

export function ensureCountryPanelScaffold() {
  ensureStyles()
  getOrCreateUiRoot()
  getOrCreatePanel()
  getOrCreateFocusDim()
}

function resolveFlagUrl(iso2: string) {
  const base = String((globalThis as any).__NAVPASS_GLOBE_ASSET_BASE_URL ?? '').replace(/\/+$/, '')
  return base ? `${base}/flags/${iso2.toLowerCase()}.svg` : `/flags/${iso2.toLowerCase()}.svg`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatInt(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}

function splitValue(total: number | null | undefined, seed: number) {
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    return { a: null, b: null }
  }
  const clamped = Math.max(0, Math.round(total))
  const ratio = 0.46 + (seed % 9) * 0.01 // 0.46 .. 0.54
  const a = Math.round(clamped * ratio)
  const b = clamped - a
  return { a, b }
}

function hashSeed(text: string) {
  let seed = 0
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 33 + text.charCodeAt(i)) >>> 0
  }
  return seed
}

type CountryFlightStats = {
  now: number
  tenMinAgo: number
  routes?: number
}

export type CountryPanelMode = 'selected' | 'hover'

type RouteHoverPanelData = {
  from: string
  to: string
  distanceKm: number | null
  trafficCount: number | null
}

function showPanel(panelHtml: string) {
  ensureCountryPanelScaffold()
  const panel = getOrCreatePanel()
  const globeUi = getOrCreateUiRoot()
  panel.innerHTML = panelHtml
  requestAnimationFrame(() => {
    panel.classList.add('is-visible')
    globeUi.classList.add('expanded')
  })
}

export function showCountryPanel(
  props: any,
  flights?: CountryFlightStats | null,
  mode: CountryPanelMode = 'selected'
) {
  const isHoverMode = mode === 'hover'

  const name =
    props.NAME_LONG ||
    props.NAME_EN ||
    props.ADMIN ||
    props.NAME ||
    'Unknown country'

  const iso3 =
    props.ISO_A3 || props.ADM0_A3 || props.BRK_A3 || props.SU_A3 || '—'
  const iso2 = props.ISO_A2 || props.WB_A2 || ''

  const flightsNow = Number.isFinite(flights?.now) ? Number(flights?.now) : null
  const routesNow = Number.isFinite(flights?.routes) ? Number(flights?.routes) : null
  const totalFlightsLabel = formatInt(flightsNow)

  const seed = hashSeed(String(iso3))
  const incomingFlights = splitValue(flightsNow, seed)
  const outgoingFlights = { a: incomingFlights.b, b: incomingFlights.a }
  const incomingRoutes = splitValue(routesNow, seed + 7)
  const outgoingRoutes = { a: incomingRoutes.b, b: incomingRoutes.a }

  const aircraftOperating =
    props.AIRCRAFTS_OPERATING ||
    props.AIRCRAFTS ||
    props.AIRCRAFT_TYPES ||
    'Airbus A320, Airbus A350, Boeing 777'

  const incomingFlightsLabel = formatInt(incomingFlights.a)
  const outgoingFlightsLabel = formatInt(outgoingFlights.a)
  const incomingRoutesLabel = formatInt(incomingRoutes.a)
  const outgoingRoutesLabel = formatInt(outgoingRoutes.a)

  const flagUrl =
    iso2 && typeof iso2 === 'string' && iso2.length === 2 && iso2 !== '-99'
      ? resolveFlagUrl(iso2)
      : ''

  const flagBox = flagUrl
    ? `<div class="panel-tooltip-flagbox" style="--flag-bg:url('${flagUrl}')"></div>`
    : '<div class="panel-tooltip-flagbox panel-tooltip-flagbox--empty"></div>'

  const closeButton = isHoverMode
    ? ''
    : '<button type="button" class="panel-tooltip-close" aria-label="Close">×</button>'
  const liveLabel = isHoverMode ? 'HOVER PREVIEW' : 'LIVE MONITORING'

  showPanel(`
    <div class="panel-tooltip">
      <div class="panel-tooltip-header">
        ${closeButton}
        <div class="panel-tooltip-headcopy">
          <div class="panel-tooltip-title">${escapeHtml(name)}</div>
          <div class="panel-tooltip-live">
            <span class="panel-tooltip-live-dot"></span>
            <span>${liveLabel}</span>
          </div>
        </div>
        ${flagBox}
      </div>

      <div class="panel-tooltip-dual">
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-label">↙ INCOMING</div>
          <div class="panel-tooltip-stat-value">${escapeHtml(incomingFlightsLabel)}</div>
          <div class="panel-tooltip-stat-sub">${escapeHtml(incomingRoutesLabel)} Routes Active</div>
        </div>
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-label">↗ OUTGOING</div>
          <div class="panel-tooltip-stat-value">${escapeHtml(outgoingFlightsLabel)}</div>
          <div class="panel-tooltip-stat-sub">${escapeHtml(outgoingRoutesLabel)} Routes Active</div>
        </div>
      </div>

      <div class="panel-tooltip-aircraft">
        <div class="panel-tooltip-aircraft-label">✈ AIRCRAFTS OPERATING</div>
        <div class="panel-tooltip-aircraft-value">${escapeHtml(String(aircraftOperating))}</div>
      </div>

      <div class="panel-tooltip-footer">
        <div class="panel-tooltip-total">
          <div class="panel-tooltip-total-label">TOTAL FLIGHTS</div>
          <div class="panel-tooltip-total-value">${escapeHtml(totalFlightsLabel)}</div>
        </div>
        <button type="button" class="panel-tooltip-more">Learn More</button>
      </div>
    </div>
  `)

  if (!isHoverMode) {
    const panel = getOrCreatePanel()
    const closeButtonEl = panel.querySelector('.panel-tooltip-close') as HTMLButtonElement | null
    closeButtonEl?.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
  }
}

export function showRouteHoverPanel(data: RouteHoverPanelData) {
  const from = escapeHtml(data.from || 'Origin')
  const to = escapeHtml(data.to || 'Destination')
  const distanceText =
    typeof data.distanceKm === 'number' && Number.isFinite(data.distanceKm)
      ? `${Math.round(data.distanceKm).toLocaleString('en-US')} km`
      : '— km'
  const trafficText =
    typeof data.trafficCount === 'number' && Number.isFinite(data.trafficCount)
      ? `${Math.max(1, Math.round(data.trafficCount)).toLocaleString('en-US')}`
      : '—'

  showPanel(`
    <div class="panel-tooltip">
      <div class="panel-tooltip-header">
        <div class="panel-tooltip-headcopy">
          <div class="panel-tooltip-title">${from} → ${to}</div>
          <div class="panel-tooltip-live">
            <span class="panel-tooltip-live-dot"></span>
            <span>HOVER PREVIEW</span>
          </div>
        </div>
        <div class="panel-tooltip-flagbox panel-tooltip-flagbox--empty"></div>
      </div>

      <div class="panel-tooltip-dual">
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-label">ROUTE DISTANCE</div>
          <div class="panel-tooltip-stat-value">${escapeHtml(distanceText)}</div>
          <div class="panel-tooltip-stat-sub">Great-circle estimate</div>
        </div>
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-label">TRAFFIC LEVEL</div>
          <div class="panel-tooltip-stat-value">${escapeHtml(trafficText)}</div>
          <div class="panel-tooltip-stat-sub">Active planes on route</div>
        </div>
      </div>

      <div class="panel-tooltip-aircraft">
        <div class="panel-tooltip-aircraft-label">↔ ROUTE</div>
        <div class="panel-tooltip-aircraft-value">${from} → ${to}</div>
      </div>

      <div class="panel-tooltip-footer">
        <div class="panel-tooltip-total">
          <div class="panel-tooltip-total-label">STATUS</div>
          <div class="panel-tooltip-total-value">TRACKED</div>
        </div>
        <button type="button" class="panel-tooltip-more" aria-label="Route preview">Hovering</button>
      </div>
    </div>
  `)
}

export function hideCountryPanel() {
  const panel = document.getElementById(PANEL_ID) as HTMLDivElement | null
  const globeUi = document.getElementById(UI_ROOT_ID) as HTMLDivElement | null
  if (!panel) return
  panel.classList.remove('is-visible')
  globeUi?.classList.remove('expanded')
}

export function showFocusDim() {
  const focusDim = getOrCreateFocusDim()
  focusDim.style.opacity = '0'
}

export function hideFocusDim() {
  const focusDim = document.getElementById(FOCUS_DIM_ID) as HTMLDivElement | null
  if (focusDim) focusDim.style.opacity = '0'
}

export function setFocusDimOpacity(value: number) {
  const focusDim = getOrCreateFocusDim()
  void value
  focusDim.style.opacity = '0'
}
