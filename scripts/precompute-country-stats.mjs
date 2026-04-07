/**
 * Precomputes per-country flight statistics from the static data files and writes
 * public/data/country_flight_stats.json so the globe can show numbers instantly
 * on load instead of waiting for the 24MB flights file to parse.
 *
 * Run:  node scripts/precompute-country-stats.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, '../public/data')

// ─── helpers (mirrors src/globe/flights.ts) ───────────────────────────────────

function normalizeCountryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCountryNameAliases(name) {
  const key = normalizeCountryKey(name)
  const out = new Set([key])

  if (key === 'united states of america') out.add('united states')
  if (key === 'united states') out.add('united states of america')
  if (key === 'russian federation') out.add('russia')
  if (key === 'russia') out.add('russian federation')
  if (key === 'ivory coast') out.add('cote d ivoire')
  if (key === 'cote d ivoire') out.add('ivory coast')
  if (key === 'czech republic') out.add('czechia')
  if (key === 'czechia') out.add('czech republic')
  if (key === 'republic of korea') out.add('south korea')
  if (key === 'south korea') out.add('republic of korea')
  if (key === 'dem rep korea') out.add('north korea')
  if (key === 'north korea') out.add('dem rep korea')
  if (key === 'republic of the congo') out.add('congo')
  if (key === 'congo') out.add('republic of the congo')
  if (key === 'democratic republic of the congo') out.add('dem rep congo')
  if (key === 'dem rep congo') out.add('democratic republic of the congo')
  if (key === 'turkiye') out.add('turkey')
  if (key === 'turkey') out.add('turkiye')
  if (key === 'myanmar') out.add('burma')
  if (key === 'burma') out.add('myanmar')
  if (key === 'bolivia, plurinational state of') out.add('bolivia')
  if (key === 'bolivia') out.add('bolivia, plurinational state of')
  if (key === 'congo, the democratic republic of the') { out.add('democratic republic of the congo'); out.add('dem rep congo') }
  if (key === 'democratic republic of the congo' || key === 'dem rep congo') out.add('congo, the democratic republic of the')
  if (key === 'iran, islamic republic of') out.add('iran')
  if (key === 'iran') out.add('iran, islamic republic of')
  if (key === "korea, democratic people's republic of") { out.add('north korea'); out.add('dem rep korea') }
  if (key === 'north korea' || key === 'dem rep korea') out.add("korea, democratic people's republic of")
  if (key === 'korea, republic of') { out.add('south korea'); out.add('republic of korea') }
  if (key === 'south korea' || key === 'republic of korea') out.add('korea, republic of')
  if (key === "lao people's democratic republic") out.add('laos')
  if (key === 'laos') out.add("lao people's democratic republic")
  if (key === 'macedonia, republic of') { out.add('north macedonia'); out.add('macedonia') }
  if (key === 'north macedonia' || key === 'macedonia') out.add('macedonia, republic of')
  if (key === 'moldova, republic of') out.add('moldova')
  if (key === 'moldova') out.add('moldova, republic of')
  if (key === 'syrian arab republic') out.add('syria')
  if (key === 'syria') out.add('syrian arab republic')
  if (key === 'tanzania, united republic of') out.add('tanzania')
  if (key === 'tanzania') out.add('tanzania, united republic of')
  if (key === 'venezuela, bolivarian republic of') out.add('venezuela')
  if (key === 'venezuela') out.add('venezuela, bolivarian republic of')

  return [...out]
}

function buildCountryIsoLookup(features) {
  const out = new Map()
  for (const feature of features ?? []) {
    const props = feature?.properties || {}
    const iso3Candidates = [props.ISO_A3, props.ADM0_A3, props.BRK_A3, props.SU_A3]
    const iso3 = iso3Candidates.find(v => typeof v === 'string' && v.length > 0 && v !== '-99')
    if (!iso3) continue
    const names = [props.NAME_LONG, props.NAME_EN, props.ADMIN, props.NAME]
      .filter(v => typeof v === 'string' && v.trim().length > 0)
    for (const name of names) {
      for (const alias of getCountryNameAliases(name)) {
        if (alias) out.set(alias, iso3)
      }
    }
  }
  return out
}

function distributeDomesticFlights(incoming, outgoing, domestic) {
  const safeIn  = Math.max(0, Math.round(incoming))
  const safeOut = Math.max(0, Math.round(outgoing))
  const safeDom = Math.max(0, Math.round(domestic))
  const domIn   = Math.floor(safeDom * 0.5)
  const domOut  = safeDom - domIn
  return { incoming: safeIn + domIn, outgoing: safeOut + domOut }
}

// ─── load files ──────────────────────────────────────────────────────────────

console.log('Reading data files…')

const geojson      = JSON.parse(readFileSync(`${DATA}/ne_110m_admin_0_countries.geojson`, 'utf8'))
const airportsFile = JSON.parse(readFileSync(`${DATA}/airports.json`, 'utf8'))
const enriched     = JSON.parse(readFileSync(`${DATA}/flights_enriched.json`, 'utf8'))

const geoFeatures = geojson.features ?? []
const isoByName   = buildCountryIsoLookup(geoFeatures)

// ─── airport count per ISO3 (from airports.json) ─────────────────────────────

const airportCountByIso3 = new Map()
for (const ap of airportsFile.records ?? []) {
  const iso3 = ap.iso_3_code
  if (typeof iso3 === 'string' && iso3.length > 0) {
    airportCountByIso3.set(iso3, (airportCountByIso3.get(iso3) ?? 0) + 1)
  }
}
console.log(`Airport counts: ${airportCountByIso3.size} countries`)

// ─── ICAO → ISO3 from the enriched flights airport dict ──────────────────────

const icaoToIso3 = new Map()
const enrichedAirports = enriched.airports ?? {}
for (const [icao, ap] of Object.entries(enrichedAirports)) {
  if (!ap.country) continue
  const aliases = getCountryNameAliases(String(ap.country))
  const iso3 = aliases.map(a => isoByName.get(a)).find(v => typeof v === 'string' && v.length > 0)
  if (iso3) icaoToIso3.set(icao, iso3)
}
console.log(`Airport ICAO→ISO3: ${icaoToIso3.size} mapped`)

// ─── route counts per ISO3 (arr / dep / dom / over) ──────────────────────────

const routeCountsByIso3 = new Map()   // Map<iso3, {arr,dep,dom,over}>
const routesByCountry   = new Map()   // Map<iso3, routeIndex[]>

const flights = Array.isArray(enriched.flights) ? enriched.flights : []
let skipped = 0

for (let i = 0; i < flights.length; i++) {
  const f = flights[i]

  const isoA = icaoToIso3.get(f.orig) ?? ''
  const isoB = icaoToIso3.get(f.dest) ?? ''

  // Collect all countries this flight touches
  const seen = new Set()
  if (isoA) seen.add(isoA)
  if (isoB) seen.add(isoB)

  // Use segs if present for overflight countries
  if (Array.isArray(f.segs)) {
    for (const seg of f.segs) {
      if (!seg?.country) continue
      const aliases = getCountryNameAliases(String(seg.country))
      const iso3 = aliases.map(a => isoByName.get(a)).find(v => typeof v === 'string' && v.length > 0)
      if (iso3) seen.add(iso3)
    }
  }

  if (seen.size === 0) { skipped++; continue }

  const trafficCount = 1 // uniform weight — same as unscored routes

  for (const iso3 of seen) {
    // routesByCountry
    const list = routesByCountry.get(iso3) ?? []
    list.push(i)
    routesByCountry.set(iso3, list)

    // arr/dep/dom/over
    let s = routeCountsByIso3.get(iso3)
    if (!s) { s = { arr: 0, dep: 0, dom: 0, over: 0 }; routeCountsByIso3.set(iso3, s) }

    const isOrig = isoA === iso3
    const isDest = isoB === iso3
    if (isOrig && isDest) s.dom += trafficCount
    else if (isOrig)      s.dep += trafficCount
    else if (isDest)      s.arr += trafficCount
    else                  s.over += trafficCount
  }
}

console.log(`Routes indexed: ${flights.length - skipped} / ${flights.length} (${skipped} skipped — unknown airports)`)

// ─── enriched country_stats → ISO3 ──────────────────────────────────────────

const countryStatsByIso3 = new Map()
const rawCountryStats = enriched.country_stats ?? {}

for (const [countryName, stats] of Object.entries(rawCountryStats)) {
  const aliases = getCountryNameAliases(countryName)
  const iso3 = aliases.map(a => isoByName.get(a)).find(v => typeof v === 'string' && v.length > 0)
  if (iso3) countryStatsByIso3.set(iso3, stats)
}
console.log(`Country stats mapped: ${countryStatsByIso3.size} / ${Object.keys(rawCountryStats).length}`)

// ─── compute final stats for every known country ──────────────────────────────

const allKeys = new Set([
  ...routeCountsByIso3.keys(),
  ...countryStatsByIso3.keys(),
  ...airportCountByIso3.keys(),
])

const output = {}

for (const key of allKeys) {
  const airports  = airportCountByIso3.get(key)
  const computed  = routeCountsByIso3.get(key)
  const arr       = computed?.arr  ?? 0
  const dep       = computed?.dep  ?? 0
  const domestic  = computed?.dom  ?? 0
  const over      = computed?.over ?? 0
  const flow      = distributeDomesticFlights(arr, dep, domestic)

  const enrichedStats = countryStatsByIso3.get(key)
  if (enrichedStats) {
    const now = Math.max(
      0,
      Math.round(
        Number.isFinite(Number(enrichedStats.in_air))
          ? Number(enrichedStats.in_air)
          : flow.incoming + flow.outgoing + over
      )
    )
    const dayDomestic = Math.max(0, Math.round(Number(enrichedStats.day_dom ?? 0)))
    const flowDay = distributeDomesticFlights(
      enrichedStats.day_arr ?? 0,
      enrichedStats.day_dep ?? 0,
      dayDomestic
    )
    output[key] = {
      now,
      tenMinAgo:   now,
      routes:      now,
      incoming:    flow.incoming,
      outgoing:    flow.outgoing,
      dayTotal:    Math.max(0, Math.round(
        Number.isFinite(Number(enrichedStats.day_total))
          ? Number(enrichedStats.day_total)
          : flowDay.incoming + flowDay.outgoing + Math.max(0, Math.round(Number(enrichedStats.day_over ?? 0)))
      )),
      dayIncoming: flowDay.incoming,
      dayOutgoing: flowDay.outgoing,
      over,
      ...(airports !== undefined ? { airports } : {}),
    }
  } else {
    const routeIds = routesByCountry.get(key) ?? []
    output[key] = {
      now:       flow.incoming + flow.outgoing + over,
      tenMinAgo: flow.incoming + flow.outgoing + over,
      routes:    routeIds.length,
      incoming:  flow.incoming,
      outgoing:  flow.outgoing,
      over,
      ...(airports !== undefined ? { airports } : {}),
    }
  }
}

// ─── write output ─────────────────────────────────────────────────────────────

const outPath = resolve(__dirname, '../src/data/country_flight_stats.json')
writeFileSync(outPath, JSON.stringify(output))

const kb = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1)
console.log(`Written ${outPath}  (${Object.keys(output).length} countries, ${kb} KB)`)
