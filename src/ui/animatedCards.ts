export type AnimatedCardInfo = {
  fromCode?: string
  toCode?: string
  fromName?: string
  toName?: string
  callsign?: string
  registration?: string
  distanceKm?: number
}

export type AnimatedCardsOptions = {
  maxCards?: number
  minVisibleMs?: number
  maxVisibleMs?: number
  spawnIntervalMs?: number
  font?: string
}

// Zones distributed around the viewport edges, avoiding center where globe content is densest.
const ZONES = [
  { x: [0.04, 0.22], y: [0.08, 0.28] },   // top-left
  { x: [0.72, 0.91], y: [0.08, 0.28] },   // top-right
  { x: [0.04, 0.22], y: [0.64, 0.84] },   // bottom-left
  { x: [0.72, 0.91], y: [0.64, 0.84] },   // bottom-right
  { x: [0.36, 0.62], y: [0.06, 0.16] },   // top-center
  { x: [0.36, 0.62], y: [0.80, 0.92] },   // bottom-center
] as const

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildCardHtml(info: AnimatedCardInfo): string {
  const fromCode = String(info.fromCode || '???').toUpperCase()
  const toCode = String(info.toCode || '???').toUpperCase()
  const label = String(info.callsign || info.registration || `${fromCode}${toCode}`).trim().toUpperCase()
  const km = Number(info.distanceKm)
  const distLabel = Number.isFinite(km) && km > 0 ? `${Math.round(km).toLocaleString('en-US')} KM` : ''

  return `
    <div style="
      display:grid;
      grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
      align-items:center;
      column-gap:8px;
    ">
      <div style="font-size:18px;line-height:1;font-weight:700;letter-spacing:0.95px;text-transform:uppercase;">${escapeHtml(fromCode)}</div>
      <div style="font-size:22px;line-height:0.9;font-weight:400;color:rgba(255,255,255,0.96);">→</div>
      <div style="font-size:18px;line-height:1;font-weight:700;letter-spacing:0.95px;text-transform:uppercase;">${escapeHtml(toCode)}</div>
    </div>
    <div style="
      margin-top:6px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:6px;
      color:rgba(255,255,255,0.62);
      font-size:10px;
      letter-spacing:0.58px;
      text-transform:uppercase;
    ">
      <div style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
      ${distLabel ? `<div style="white-space:nowrap;flex-shrink:0;">${escapeHtml(distLabel)}</div>` : ''}
    </div>
  `.trim()
}

export function createAnimatedCards(
  mountTarget: HTMLElement,
  opts: AnimatedCardsOptions = {}
) {
  const maxCards = opts.maxCards ?? 3
  const minVisibleMs = opts.minVisibleMs ?? 3200
  const maxVisibleMs = opts.maxVisibleMs ?? 6400
  const spawnIntervalMs = opts.spawnIntervalMs ?? 1600
  const font = opts.font ?? "'Verdana Pro',Verdana,'Trebuchet MS',sans-serif"

  let running = false
  let getInfo: (() => AnimatedCardInfo | null) | null = null
  let spawnTimer: ReturnType<typeof setTimeout> | null = null
  const activeCards: HTMLElement[] = []
  const usedZones = new Set<number>()

  function pickZone() {
    // Try to pick a zone not currently in use
    const available = ZONES.map((_, i) => i).filter(i => !usedZones.has(i))
    const pool = available.length > 0 ? available : ZONES.map((_, i) => i)
    return pool[Math.floor(Math.random() * pool.length)]
  }

  function spawnCard() {
    if (!running || !getInfo) return

    if (activeCards.length >= maxCards) {
      scheduleNext()
      return
    }

    const info = getInfo()
    if (!info || (!info.fromCode && !info.toCode)) {
      scheduleNext()
      return
    }

    const zoneIdx = pickZone()
    const zone = ZONES[zoneIdx]
    const xFrac = zone.x[0] + Math.random() * (zone.x[1] - zone.x[0])
    const yFrac = zone.y[0] + Math.random() * (zone.y[1] - zone.y[0])
    const x = Math.round(xFrac * window.innerWidth)
    const y = Math.round(yFrac * window.innerHeight)

    const card = document.createElement('div')
    card.style.cssText = [
      'position:fixed',
      `left:${x}px`,
      `top:${y}px`,
      'transform:translate(-50%,-50%)',
      'pointer-events:none',
      'z-index:10',
      'box-sizing:border-box',
      'width:min(192px,calc(100vw - 16px))',
      'padding:10px 11px 9px',
      'background:#0d1c30',
      'border:1px solid rgba(204,183,97,0.72)',
      'color:#f7f8fb',
      `font-family:${font}`,
      'opacity:0',
      'transition:opacity 520ms ease',
    ].join(';')

    card.innerHTML = buildCardHtml(info)
    mountTarget.appendChild(card)
    activeCards.push(card)
    usedZones.add(zoneIdx)

    // Trigger fade-in on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.opacity = '1'
      })
    })

    const visibleMs = minVisibleMs + Math.random() * (maxVisibleMs - minVisibleMs)
    const removeTimer = setTimeout(() => {
      card.style.opacity = '0'
      setTimeout(() => {
        card.remove()
        const idx = activeCards.indexOf(card)
        if (idx >= 0) activeCards.splice(idx, 1)
        usedZones.delete(zoneIdx)
      }, 540)
    }, visibleMs)

    // Keep a reference so we can cancel on stop()
    ;(card as any).__removeTimer = removeTimer

    scheduleNext()
  }

  function scheduleNext() {
    if (!running) return
    const jitter = spawnIntervalMs * (0.6 + Math.random() * 0.8)
    spawnTimer = setTimeout(spawnCard, jitter)
  }

  function start(infoGetter: () => AnimatedCardInfo | null) {
    if (running) return
    running = true
    getInfo = infoGetter
    spawnTimer = setTimeout(spawnCard, 900 + Math.random() * 600)
  }

  function stop() {
    running = false
    getInfo = null
    if (spawnTimer !== null) {
      clearTimeout(spawnTimer)
      spawnTimer = null
    }
    for (const card of [...activeCards]) {
      clearTimeout((card as any).__removeTimer)
      card.style.opacity = '0'
      setTimeout(() => card.remove(), 540)
    }
    activeCards.length = 0
    usedZones.clear()
  }

  return { start, stop }
}
