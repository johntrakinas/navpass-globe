function getPanel() {
  return document.getElementById('country-panel') as HTMLDivElement | null
}

function getGlobeUi() {
  return document.getElementById('globe-ui') as HTMLDivElement | null
}

function getFocusDim() {
  return document.getElementById('focus-dim') as HTMLDivElement | null
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

export function showCountryPanel(props: any, flights?: CountryFlightStats | null) {
  const panel = getPanel()
  const globeUi = getGlobeUi()
  if (!panel) return

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
  const incomingRoutes = splitValue(routesNow, seed + 7)

  const aircraftOperating =
    props.AIRCRAFTS_OPERATING ||
    props.AIRCRAFTS ||
    props.AIRCRAFT_TYPES ||
    'Airbus A320, Airbus A350, Boeing 777'

  const incomingFlightsLabel = formatInt(incomingFlights.a)
  const outgoingFlightsLabel = formatInt(incomingFlights.b)
  const incomingRoutesLabel = formatInt(incomingRoutes.a)
  const outgoingRoutesLabel = formatInt(incomingRoutes.b)

  const flagUrl =
    iso2 && typeof iso2 === 'string' && iso2.length === 2 && iso2 !== '-99'
      ? resolveFlagUrl(iso2)
      : ''

  const flagBox = flagUrl
    ? `<div class="panel-tooltip-flagbox" style="--flag-bg:url('${flagUrl}')"></div>`
    : '<div class="panel-tooltip-flagbox panel-tooltip-flagbox--empty"></div>'

  panel.innerHTML = `
    <div class="panel-tooltip">
      <div class="panel-tooltip-header">
        <button type="button" class="panel-tooltip-close" aria-label="Close">×</button>
        <div class="panel-tooltip-headcopy">
          <div class="panel-tooltip-title">${escapeHtml(name)}</div>
          <div class="panel-tooltip-live">
            <span class="panel-tooltip-live-dot"></span>
            <span>LIVE MONITORING</span>
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
  `

  const closeButton = panel.querySelector('.panel-tooltip-close') as HTMLButtonElement | null
  closeButton?.addEventListener('click', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })

  requestAnimationFrame(() => {
    panel.classList.add('is-visible')
    globeUi?.classList.add('expanded')
  })
}

export function hideCountryPanel() {
  const panel = getPanel()
  const globeUi = getGlobeUi()
  if (!panel) return
  panel.classList.remove('is-visible')
  globeUi?.classList.remove('expanded')
}

export function showFocusDim() {
  const focusDim = getFocusDim()
  if (focusDim) focusDim.style.opacity = '1'
}

export function hideFocusDim() {
  const focusDim = getFocusDim()
  if (focusDim) focusDim.style.opacity = '0'
}

export function setFocusDimOpacity(value: number) {
  const focusDim = getFocusDim()
  if (!focusDim) return
  const clamped = Math.max(0, Math.min(1, value))
  focusDim.style.opacity = clamped.toFixed(3)
}
