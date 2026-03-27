# Flight Stats — Full Technical Documentation

A complete reference for how **Incoming**, **Outgoing**, and **Total Flights** reach the
country panel, and how flight routes are built, rendered, and filtered on the globe.
Every function that touches these systems is documented in execution order,
with exact code, formulas, and worked examples.

---

## Table of Contents

**Stats pipeline**
1. [Data Source](#1-data-source)
2. [Fetch Chain](#2-fetch-chain)
3. [Worker Parsing — `enrichedFlightsParseWorker.ts`](#3-worker-parsing--enrichedflightsparseworkerts)
4. [Main-Thread Receive — `parseEnrichedFlightsResponse`](#4-main-thread-receive--parseenrichedflightsresponse)
5. [Handoff to Flight System — `createFlightRoutes`](#5-handoff-to-flight-system--createflightroutes)
6. [Country–ISO3 Key Mapping — `buildCountryStatsByIso3`](#6-countryiso3-key-mapping--buildcountrystatsByiso3)
7. [Route Index — `rebuildRoutesByCountryIndex`](#7-route-index--rebuildRoutesByCountryIndex)
8. [Stats Computation — `getCountryFlightStats`](#8-stats-computation--getcountryflightstats)
   - 8A. [Enriched Path — real snapshot data](#8a-enriched-path--real-snapshot-data)
   - 8B. [Synthetic Path — simulation fallback](#8b-synthetic-path--simulation-fallback)
9. [Call Site — `selectCountryFeature`](#9-call-site--selectcountryfeature)
10. [Panel Display — `showCountryPanel`](#10-panel-display--showcountrypanel)
11. [Data Type Reference](#11-data-type-reference)
12. [End-to-End Field Map](#12-end-to-end-field-map)
13. [Known Issues](#13-known-issues)
14. [How It Should Work — Ideal API Contract](#14-how-it-should-work--ideal-api-contract)

**Route building pipeline**
15. [Route Building — Enriched Source (`startEnrichedRouteDataBuild`)](#15-route-building--enriched-source)
16. [Route Building — Synthetic Source](#16-route-building--synthetic-source)
17. [Country Coverage per Route — `collectFlightCountryIso3List`](#17-country-coverage-per-route--collectflightcountryiso3list)
18. [`trafficCount` — How the Baseline Flight Count Is Set](#18-trafficcount--how-the-baseline-flight-count-is-set)

**Rendering & focus pipeline**
19. [Line Geometry — Focus Mask per Segment (`applyFocusMaskToLineLod`)](#19-line-geometry--focus-mask-per-segment)
20. [Plane Geometry — `startPlaneGeometryBuild` and `fillChunk`](#20-plane-geometry--startplanegeometrybuild-and-fillchunk)
21. [Plane Focus Mask — `applyFocusMask` and `finalizePlaneGeometry`](#21-plane-focus-mask--applyfocusmask-and-finalizeplanemgeometry)
22. [Country Focus System — `setFocusCountry`](#22-country-focus-system--setfocuscountry)
23. [Focus Animation — `focusMix` and the Update Loop](#23-focus-animation--focusmix-and-the-update-loop)

---

## 1. Data Source

**There is no live API.** All flight data comes from a single static JSON file shipped
with the app.

```
public/data/flights_enriched.json   (24.5 MB)
```

The file has three top-level keys:

| Key | Contents | Count |
|-----|----------|-------|
| `flights` | One record per real flight at time of snapshot | 14,662 |
| `airports` | Airport metadata keyed by ICAO/IATA code | 3,961 |
| `country_stats` | Aggregated stats keyed by **English country name** | 160 countries |

The snapshot was taken at `2026-02-02T19:00:00Z` and never changes after deployment.
There is no polling, WebSocket, or refresh of any kind.

### `country_stats` structure

Keys are plain English country names (not ISO codes). All value fields are optional integers.

```json
"Croatia": {
  "in_air": 324,   "arr": 5,   "dep": 2,   "dom": 0,   "over": 317,
  "day_total": 2010, "day_arr": 75, "day_dep": 70, "day_dom": 20, "day_over": 1845
},
"India": {
  "in_air": 827,   "arr": 150, "dep": 137, "dom": 102, "over": 438,
  "day_total": 6237, "day_arr": 841, "day_dep": 870, "day_dom": 3111, "day_over": 1415
}
```

### Field meanings

| Field | Layer | Meaning |
|-------|-------|---------|
| `in_air` | Real-time | Total flights in the country's airspace right now |
| `arr` | Real-time | International arrivals currently airborne |
| `dep` | Real-time | International departures currently airborne |
| `dom` | Real-time | Domestic flights currently airborne |
| `over` | Real-time | Overflights — transiting without landing |
| `day_total` | Daily | Total flights in airspace today (as of snapshot) |
| `day_arr` | Daily | International arrivals today |
| `day_dep` | Daily | International departures today |
| `day_dom` | Daily | Domestic flights today |
| `day_over` | Daily | Overflights today |

Approximately 35 countries (~22%) have no entry in `country_stats` at all. For those,
the system falls back entirely to simulation (see §8B).

---

## 2. Fetch Chain

**File**: `src/index.ts` — inside `init()`

```ts
const enrichedFlightsResponsePromise = fetch(resolveAssetPath('data/flights_enriched.json'))
```

`resolveAssetPath` prepends the configured `assetBaseUrl`:

```ts
// src/index.ts ~line 386
const resolveAssetPath = (assetPath: string) => {
  const normalizedAssetPath = assetPath.replace(/^\/+/, '')
  return assetBaseUrl ? `${assetBaseUrl}/${normalizedAssetPath}` : `/${normalizedAssetPath}`
}
```

- **Effective URL**: `/data/flights_enriched.json` (or `/{assetBaseUrl}/data/flights_enriched.json`)
- **Method**: plain `GET`, no custom headers, no auth
- **Called**: once at page load — no retry, no interval, no refresh
- **On failure**: the globe initialises without any flight data

---

## 3. Worker Parsing — `enrichedFlightsParseWorker.ts`

**File**: `src/workers/enrichedFlightsParseWorker.ts` — full file

The worker exists for one reason: `JSON.parse` on a 24.5 MB string blocks the main thread
for ~200–400 ms. Moving it off-thread keeps the globe responsive during startup.

```ts
// lines 1–48 — local type definitions (not exported)
type EnrichedFlightsFile = {
  flights?: Array<{
    id?: string | number
    cs?: string          // callsign
    orig?: string        // origin ICAO
    dest?: string        // destination ICAO
    reg?: string         // aircraft registration
    type?: string        // aircraft type (e.g. "E75L")
    air?: string         // airline code
    olat: number         // origin latitude
    olon: number         // origin longitude
    dlat: number         // destination latitude
    dlon: number         // destination longitude
    path?: Array<[number, number]>     // waypoint path
    segs?: Array<{ country?: string; enter?: string; exit?: string }>
    snap_lat?: number    // position at snapshot time
    snap_lon?: number
    snap_alt?: number    // altitude in feet
  }>
  airports?: Record<string, {
    code?: string; icao?: string; iata?: string; name?: string
    lat?: number; lon?: number; elev?: number; city?: string
    kind?: string; country?: string
  }>
  country_stats?: Record<string, {
    in_air?: number; arr?: number; dep?: number; dom?: number; over?: number
    day_total?: number; day_arr?: number; day_dep?: number; day_dom?: number; day_over?: number
  }>
}

type InMsg = {
  text: string               // the entire raw JSON string
  routeCountLimit: number | null
}

// lines 55–79 — message handler
self.onmessage = (event: MessageEvent<InMsg>) => {
  try {
    const parsed = JSON.parse(event.data.text) as EnrichedFlightsFile

    const flightsSource = Array.isArray(parsed?.flights) ? parsed.flights : []
    const limit = Number.isFinite(event.data.routeCountLimit)
      ? Math.max(1, Math.floor(event.data.routeCountLimit as number))
      : null
    // Optional cap: if routeCountLimit is set, slice the flights array.
    const flights = limit && flightsSource.length > limit
      ? flightsSource.slice(0, limit)
      : flightsSource

    self.postMessage({
      flights,
      airports:     parsed?.airports     && typeof parsed.airports     === 'object' ? parsed.airports     : null,
      countryStats: parsed?.country_stats && typeof parsed.country_stats === 'object' ? parsed.country_stats : null
    })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Failed to parse enriched flights payload'
    })
  }
}
```

**What this function does:**
1. Receives `{ text, routeCountLimit }` from the main thread.
2. Calls `JSON.parse(text)` — the only expensive step.
3. Validates and normalises each top-level key (falls back to `null` if malformed).
4. Posts back `{ flights, airports, countryStats }`.
5. On any exception, posts back `{ error: message }` so the main thread can fall back.

No transformation of `country_stats` occurs here — it is forwarded verbatim.

---

## 4. Main-Thread Receive — `parseEnrichedFlightsResponse`

**File**: `src/index.ts` — lines 1757–1857

This function manages the worker lifecycle: starts it, handles its single response,
and terminates it immediately.

```ts
// lines 1757–1857
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

  const text = await response.text()  // read entire 24.5 MB as string
  const safeRouteCountLimit = Number.isFinite(routeCountLimit)
    ? Math.max(1, Math.floor(routeCountLimit as number))
    : null

  // normalizeParsed: fallback for main-thread parsing (used if Worker is unavailable)
  const normalizeParsed = (parsed: EnrichedFlightsFile | null | undefined) => {
    const flightsSource = Array.isArray(parsed?.flights) ? parsed!.flights! : []
    const flights = safeRouteCountLimit && flightsSource.length > safeRouteCountLimit
      ? flightsSource.slice(0, safeRouteCountLimit)
      : flightsSource
    const airports = parsed?.airports && typeof parsed.airports === 'object'
      ? parsed.airports : null
    const countryStats = parsed?.country_stats && typeof parsed.country_stats === 'object'
      ? parsed.country_stats : null
    return { flights, airports, countryStats }
  }

  // If Web Workers are not available (e.g. certain iframe environments), parse inline.
  if (typeof Worker === 'undefined') {
    return normalizeParsed(JSON.parse(text) as EnrichedFlightsFile)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finishResolve = (value) => { if (!settled) { settled = true; resolve(value) } }
    const finishReject  = (error) => { if (!settled) { settled = true; reject(error) } }

    try {
      // line 1816 — spawn the worker
      const worker = new Worker(
        new URL('./workers/enrichedFlightsParseWorker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (event: MessageEvent<any>) => {
        worker.terminate()   // single-use — killed immediately

        if (event.data?.error) {
          // Worker reported a parse error; try again synchronously on the main thread.
          try { finishResolve(normalizeParsed(JSON.parse(text))) }
          catch (error) { finishReject(error) }
          return
        }

        finishResolve({
          flights:      Array.isArray(event.data?.flights) ? event.data.flights : [],
          airports:     event.data?.airports     && typeof event.data.airports     === 'object' ? event.data.airports     : null,
          countryStats: event.data?.countryStats && typeof event.data.countryStats === 'object' ? event.data.countryStats : null
        })
      }

      worker.onerror = () => {
        worker.terminate()
        try { finishResolve(normalizeParsed(JSON.parse(text))) }
        catch (error) { finishReject(error) }
      }

      // line 1848 — hand the raw text to the worker
      worker.postMessage({ text, routeCountLimit: safeRouteCountLimit })
    } catch {
      // Worker constructor itself failed; fall back to synchronous parsing.
      try { finishResolve(normalizeParsed(JSON.parse(text))) }
      catch (error) { finishReject(error) }
    }
  })
}
```

**What this function does:**
1. Awaits the HTTP response and reads the body as text.
2. Spawns the worker, posts the raw text to it.
3. On success: terminates the worker, resolves with `{ flights, airports, countryStats }`.
4. On worker error / unavailability: falls back to synchronous `JSON.parse` on the main thread.
5. `settled` flag ensures the promise is never resolved or rejected twice.

---

## 5. Handoff to Flight System — `createFlightRoutes`

**File**: `src/index.ts` — `init()` — ~line 2737

After parsing, the three objects are passed into the flight system:

```ts
flightRoutes = createFlightRoutes(
  {
    flights:       enrichedFlights,       // 14,662 records
    airportLookup: enrichedAirports,      // 3,961 records
    countryStats:  enrichedCountryStats   // 160-entry country stats map
  },
  GLOBE_RADIUS,
  countriesGeoJSON,
  { ... }
)
```

Inside `createFlightRoutes` (`src/globe/flights.ts` — lines 1638–1641):

```ts
// line 1638
const countryStatsByIso3 = buildCountryStatsByIso3(
  isEnrichedSource ? source.countryStats : null,
  countriesGeoJSON
)
```

`countryStatsByIso3` is a closure variable — it lives inside `createFlightRoutes` and is
accessed by all inner functions, including `getCountryFlightStats` (see §8).

---

## 6. Country–ISO3 Key Mapping — `buildCountryStatsByIso3`

**File**: `src/globe/flights.ts` — lines 1540–1555

The raw `country_stats` object uses English country names as keys (e.g. `"Croatia"`).
The rest of the system uses **ISO 3166-1 alpha-3 codes** (e.g. `"HRV"`). This function
converts the map once at startup so all runtime lookups are O(1) by ISO3.

```ts
// lines 1540–1555
function buildCountryStatsByIso3(
  countryStats: Record<string, EnrichedCountryStats> | null | undefined,
  countriesGeoJSON: any
) {
  const out = new Map<string, EnrichedCountryStats>()
  if (!countryStats) return out

  const isoByName = buildCountryIsoLookup(countriesGeoJSON)
  // isoByName: Map<lowercase-name, ISO3>  — built from GeoJSON feature properties

  for (const [countryName, stats] of Object.entries(countryStats)) {
    const aliases = getCountryNameAliases(countryName)
    // aliases: string[] — e.g. "United States" → ["United States", "United States of America",
    //                                              "USA", "US", "America", ...]
    const iso3 = aliases
      .map(alias => isoByName.get(alias))
      .find((value): value is string => typeof value === 'string' && value.length > 0)

    if (!iso3) continue   // ⚠ silently dropped — no warning
    out.set(iso3, stats || {})
  }

  return out
}
```

**What this function does:**
1. Calls `buildCountryIsoLookup(countriesGeoJSON)` to build a `Map<lowercase-name → ISO3>`
   from the GeoJSON feature collection.
2. For each entry in `country_stats`, generates a list of name aliases via
   `getCountryNameAliases()` (handles variations like `"United States"` vs
   `"United States of America"` vs `"USA"`).
3. Tries each alias against the GeoJSON lookup.
4. On first match, stores `iso3 → stats` in the output map.
5. If no alias matches, the entry is **silently skipped** — that country will fall through
   to the synthetic path at runtime.

**Output**: `Map<"HRV" → { in_air: 324, arr: 5, ... }>` — used by `getCountryFlightStats`.

---

## 7. Route Index — `rebuildRoutesByCountryIndex`

**File**: `src/globe/flights.ts` — lines 3164–3178

Before stats can be synthesised (Path B), the system needs to know which routes pass through
each country. This index is built once when routes finish loading.

```ts
// line 3164
const routesByCountry = new Map<string, number[]>()

// lines 3166–3178
function rebuildRoutesByCountryIndex() {
  routesByCountry.clear()
  for (let i = 0; i < routeData.length; i++) {
    const r = routeData[i]
    for (let j = 0; j < r.countryIso3List.length; j++) {
      const iso3 = r.countryIso3List[j]
      if (!iso3) continue
      const list = routesByCountry.get(iso3) ?? []
      list.push(i)
      routesByCountry.set(iso3, list)
    }
  }
}
```

**What this function does:**
1. Iterates all routes in `routeData`.
2. For each route, reads `countryIso3List` — a list of ISO3 codes for every country
   the route passes through (origin, destination, and any overflown countries).
3. Appends the route index to each country's list in `routesByCountry`.

**Output**: `Map<"HRV" → [4, 17, 203, ...]>` — route indices that touch Croatia.
Used by `computeCountryFlightsAtTime` in Path B.

---

## 8. Stats Computation — `getCountryFlightStats`

**File**: `src/globe/flights.ts` — lines 3389–3441

This is the main entry point called when a country is selected. It decides which path to
take based on whether enriched data is available.

```ts
// lines 3389–3441
function getCountryFlightStats(iso3: string, timeSeconds: number): CountryFlightStats {
  const key = (iso3 || '').trim()
  const enrichedStats = countryStatsByIso3.get(key)   // O(1) map lookup

  if (enrichedStats) {
    // ── Path A: real data from the snapshot ────────────────────────────────
    // (see §8A)
  }

  // ── Path B: synthetic simulation ───────────────────────────────────────
  // (see §8B)
  const routeIds = key ? routesByCountry.get(key) ?? [] : []
  const nowBreakdown      = computeCountryFlightsAtTime(routeIds, key, timeSeconds)
  const tenMinAgoBreakdown = computeCountryFlightsAtTime(routeIds, key, timeSeconds - 600)

  return {
    now:       nowBreakdown.incoming + nowBreakdown.outgoing,
    tenMinAgo: tenMinAgoBreakdown.incoming + tenMinAgoBreakdown.outgoing,
    routes:    routeIds.length,
    incoming:  nowBreakdown.incoming,
    outgoing:  nowBreakdown.outgoing
    // dayTotal, dayIncoming, dayOutgoing, over — not available in synthetic mode
  }
}
```

---

### 8A. Enriched Path — real snapshot data

Triggered when `countryStatsByIso3.get(key)` returns a value (160 countries).

The enriched path uses two helper functions before assembling the result.

---

#### `distributeDomesticFlights` — lines 3376–3387

The snapshot provides separate counts for international arrivals (`arr`), international
departures (`dep`), and all domestic flights combined (`dom`). Domestic flights are not
split into arrivals and departures, so this function applies a 50/50 heuristic.

```ts
// lines 3376–3387
function distributeDomesticFlights(incoming: number, outgoing: number, domestic: number) {
  const safeIncoming = Math.max(0, Math.round(incoming))
  const safeOutgoing = Math.max(0, Math.round(outgoing))
  const safeDomestic = Math.max(0, Math.round(domestic))

  const domesticIncoming = Math.floor(safeDomestic * 0.5)
  const domesticOutgoing = safeDomestic - domesticIncoming   // gets the extra 1 if odd

  return {
    incoming: safeIncoming + domesticIncoming,
    outgoing: safeOutgoing + domesticOutgoing
  }
}
```

**Formula:**
```
domesticIncoming = ⌊dom × 0.5⌋
domesticOutgoing = dom − ⌊dom × 0.5⌋     (= ⌈dom × 0.5⌉)

incoming = arr + domesticIncoming
outgoing = dep + domesticOutgoing
```

Called **twice** per request: once for real-time fields (`arr`/`dep`/`dom`),
once for daily fields (`day_arr`/`day_dep`/`day_dom`).

**Example — India** (`arr=150, dep=137, dom=102`):
```
domesticIncoming = ⌊102 × 0.5⌋ = 51
domesticOutgoing = 102 − 51    = 51
incoming = 150 + 51 = 201
outgoing = 137 + 51 = 188
```

---

#### Enriched path — full computation (lines 3392–3427)

```ts
if (enrichedStats) {
  const domestic    = Math.max(0, Math.round(Number(enrichedStats.dom     ?? 0)))
  const over        = Math.max(0, Math.round(Number(enrichedStats.over    ?? 0)))
  const dayDomestic = Math.max(0, Math.round(Number(enrichedStats.day_dom ?? 0)))

  // Real-time distribution: arr + ⌊dom/2⌋  /  dep + ⌈dom/2⌉
  const flowNow = distributeDomesticFlights(
    enrichedStats.arr     ?? 0,
    enrichedStats.dep     ?? 0,
    domestic
  )

  // Daily distribution: day_arr + ⌊day_dom/2⌋  /  day_dep + ⌈day_dom/2⌉
  const flowDay = distributeDomesticFlights(
    enrichedStats.day_arr ?? 0,
    enrichedStats.day_dep ?? 0,
    dayDomestic
  )

  // Current total: in_air is a direct headcount and preferred.
  // Fallback: sum the distributed parts + overflights.
  const now = Math.max(0, Math.round(
    Number.isFinite(Number(enrichedStats.in_air))
      ? Number(enrichedStats.in_air)
      : flowNow.incoming + flowNow.outgoing + over
  ))

  // Daily total: day_total is preferred.
  // Fallback: sum daily distributed parts + daily overflights.
  const dayTotal = Math.max(0, Math.round(
    Number.isFinite(Number(enrichedStats.day_total))
      ? Number(enrichedStats.day_total)
      : flowDay.incoming + flowDay.outgoing + Math.max(0, Math.round(Number(enrichedStats.day_over ?? 0)))
  ))

  return {
    now,
    tenMinAgo:   now,                 // ⚠ no historical data — identical to now
    routes:      now,                 // ⚠ not a real route count — reuses now
    incoming:    flowNow.incoming,    // arr  + ⌊dom/2⌋
    outgoing:    flowNow.outgoing,    // dep  + ⌈dom/2⌉
    dayTotal,                         // day_total  OR  day_arr+day_dep+day_dom+day_over
    dayIncoming: flowDay.incoming,    // day_arr + ⌊day_dom/2⌋ — computed but never shown
    dayOutgoing: flowDay.outgoing,    // day_dep + ⌈day_dom/2⌉ — computed but never shown
    over
  }
}
```

**Worked example — Croatia** (`in_air=324, arr=5, dep=2, dom=0, over=317, day_total=2010`):
```
domestic    = 0
flowNow     = distributeDomesticFlights(5, 2, 0) → { incoming: 5, outgoing: 2 }
now         = 324   (in_air present → used directly)
dayTotal    = 2010  (day_total present → used directly)

Result: incoming=5, outgoing=2, now=324, dayTotal=2010, over=317, tenMinAgo=324 (⚠ = now)
```

**Worked example — India** (`in_air=827, arr=150, dep=137, dom=102, day_total=6237, day_dom=3111`):
```
domestic    = 102
flowNow     = distributeDomesticFlights(150, 137, 102)
              → domesticIncoming=51, domesticOutgoing=51
              → { incoming: 201, outgoing: 188 }
dayDomestic = 3111
flowDay     = distributeDomesticFlights(841, 870, 3111)
              → domesticIncoming=1555, domesticOutgoing=1556
              → { incoming: 2396, outgoing: 2426 }
now         = 827   (in_air present → used directly)
dayTotal    = 6237  (day_total present → used directly)

Result: incoming=201, outgoing=188, now=827, dayTotal=6237, over=438, tenMinAgo=827 (⚠ = now)
```

---

### 8B. Synthetic Path — simulation fallback

Triggered when `countryStatsByIso3` has no entry for this ISO3 (the remaining ~35 countries).

Two helper functions do the work.

---

#### `computeRouteFlightsAtTime` — lines 3334–3343

Estimates how many flights are active on a single route at a given moment using a
multi-frequency sine wave to simulate realistic traffic variation.

```ts
// lines 3334–3343
function computeRouteFlightsAtTime(r: Route, timeSeconds: number) {
  // Three sine waves at different frequencies, seeded differently per route.
  const w1 = 0.6  + 0.4  * Math.sin(timeSeconds * 0.019 + r.seed  * 11.7)
  const w2 = 0.65 + 0.35 * Math.sin(timeSeconds * 0.007 + r.phase * Math.PI * 2 + r.seed * 3.9)
  const w3 = 0.75 + 0.25 * Math.sin(timeSeconds * 0.003 + r.id    * 0.8)

  // Weighted blend of the three waves, clamped to [0.18, 1.15]
  const activity = THREE.MathUtils.clamp(
    w1 * 0.46 + w2 * 0.38 + w3 * 0.16,
    0.18,
    1.15
  )

  // Traffic density modifier from the route's base traffic value
  const trafficBoost = THREE.MathUtils.clamp(
    0.85 + (r.traffic - 0.62) * 0.25,
    0.82,
    1.05
  )

  return r.trafficCount * activity * trafficBoost
}
```

**Formula:**
```
w1       = 0.60 + 0.40 × sin(t × 0.019 + seed × 11.7)        period ≈ 330 s  (5.5 min)
w2       = 0.65 + 0.35 × sin(t × 0.007 + phase×2π + seed×3.9) period ≈ 898 s  (15 min)
w3       = 0.75 + 0.25 × sin(t × 0.003 + id × 0.8)           period ≈ 2094 s (35 min)

activity     = clamp(w1×0.46 + w2×0.38 + w3×0.16,  0.18, 1.15)
trafficBoost = clamp(0.85 + (traffic − 0.62) × 0.25, 0.82, 1.05)

flightsNow   = trafficCount × activity × trafficBoost
```

- `trafficCount`: number of real flights on this route in the snapshot
- `activity`: oscillates between roughly 0.18 and 1.15 — simulates busy/quiet periods
- `trafficBoost`: slight multiplier for routes with higher baseline traffic density
- `r.seed`, `r.phase`, `r.id`: per-route constants that de-synchronise the waves so all
  routes don't peak and dip at the same time

---

#### `computeCountryFlightsAtTime` — lines 3345–3374

Sums up all route activity for a given country at a given time.

```ts
// lines 3345–3374
function computeCountryFlightsAtTime(routeIds: number[], iso3: string, timeSeconds: number) {
  let incoming = 0
  let outgoing = 0

  for (let i = 0; i < routeIds.length; i++) {
    const r = routeData[routeIds[i]]
    if (!r) continue

    const flightsNow  = computeRouteFlightsAtTime(r, timeSeconds)
    const isOrigin    = r.isoA3 === iso3    // this country is where the route departs from
    const isDestination = r.isoB3 === iso3  // this country is where the route arrives

    if (isOrigin && isDestination) {
      // Domestic route: both endpoints in the same country → split 50/50
      incoming += flightsNow * 0.5
      outgoing += flightsNow * 0.5
      continue
    }
    if (isDestination) incoming += flightsNow
    if (isOrigin)      outgoing += flightsNow
  }

  return {
    incoming: Math.max(0, Math.round(incoming)),
    outgoing: Math.max(0, Math.round(outgoing))
  }
}
```

**What this function does:**
1. Receives the list of route indices that touch this country (from `routesByCountry`).
2. For each route, calls `computeRouteFlightsAtTime` to get the current simulated count.
3. Classifies each route:
   - Both endpoints in this country → domestic → 50/50 split
   - Destination is this country → add to incoming
   - Origin is this country → add to outgoing
   - A route that merely overflies (neither endpoint) → counted in neither,
     because it won't have this country as `isoA3` or `isoB3`
4. Returns rounded integers.

This function is called **twice** in the synthetic path: once at `timeSeconds` (now) and
once at `timeSeconds − 600` (10 minutes ago), giving a real trend comparison.

---

## 9. Call Site — `selectCountryFeature`

**File**: `src/index.ts` — lines 2260–2293

Called whenever the user clicks a country on the globe.

```ts
// lines 2272–2273
const flightsStats = flightRoutes
  ? flightRoutes.getCountryFlightStats(iso3, performance.now() * 0.001)
  : null

showCountryPanel(feature.properties, flightsStats, 'selected')
```

`performance.now() * 0.001` converts the page uptime from milliseconds to **seconds**.
This value is passed as `timeSeconds` to both `computeRouteFlightsAtTime` waves and the
`tenMinAgo` calculation (`timeSeconds − 600`).

The stats are computed **once at click time** and are not refreshed while the panel is open.
Because the underlying data is a static snapshot, the numbers will not change between clicks
unless the user clicks a different country.

---

## 10. Panel Display — `showCountryPanel`

**File**: `src/scene/camera.ts` — lines 754–855

Receives the `CountryFlightStats` object and renders the HTML panel.

```ts
// lines 754–757
export function showCountryPanel(
  props: any,
  flights?: CountryFlightStats | null,
  mode: CountryPanelMode = 'selected'
) {
```

### Value extraction and formatting (lines 770–785)

```ts
const flightsNow      = Number.isFinite(flights?.now)       ? Number(flights?.now)       : null
const incomingFlights = Number.isFinite(flights?.incoming)  ? Number(flights?.incoming)  : null
const outgoingFlights = Number.isFinite(flights?.outgoing)  ? Number(flights?.outgoing)  : null
const dayTotalFlights = Number.isFinite(flights?.dayTotal)  ? Number(flights?.dayTotal)  : null
const overFlights     = Number.isFinite(flights?.over)      ? Number(flights?.over)      : null

const incomingFlightsLabel        = formatInt(incomingFlights)
const outgoingFlightsLabel        = formatInt(outgoingFlights)
const totalFlightsOverCountryLabel =
  dayTotalFlights !== null ? formatInt(dayTotalFlights)  // preferred: daily total
  : overFlights   !== null ? formatInt(overFlights)      // fallback: overflights
  :                          formatInt(flightsNow)        // last resort: current count
```

`formatInt` (lines 716–719):
```ts
function formatInt(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}
```
Rounds, clamps to ≥ 0, formats with thousands separators, returns `'—'` for any missing or
non-finite value.

### "Total Flights Over Country" — priority chain

| Priority | Source field | Used when |
|----------|-------------|-----------|
| 1 (preferred) | `dayTotal` | Enriched data with `day_total` present |
| 2 | `over` | Enriched data, `day_total` absent, `over` present |
| 3 (last resort) | `now` | Synthetic path (no daily or overflight data) |

### HTML slots rendered (lines 819–843)

```html
<!-- Left stat box -->
<div class="panel-tooltip-stat">
  <span class="panel-tooltip-stat-icon">↙</span>
  <div class="panel-tooltip-stat-label">Incoming</div>
  <div class="panel-tooltip-stat-value">{incomingFlightsLabel}</div>
  <div class="panel-tooltip-stat-sub">Routes Active</div>   <!-- ⚠ wrong label -->
</div>

<!-- Right stat box -->
<div class="panel-tooltip-stat">
  <span class="panel-tooltip-stat-icon">↗</span>
  <div class="panel-tooltip-stat-label">Outgoing</div>
  <div class="panel-tooltip-stat-value">{outgoingFlightsLabel}</div>
  <div class="panel-tooltip-stat-sub">Routes Active</div>   <!-- ⚠ wrong label -->
</div>

<!-- Footer -->
<div class="panel-tooltip-total-label">TOTAL FLIGHTS OVER COUNTRY</div>
<div class="panel-tooltip-total-value">{totalFlightsOverCountryLabel}</div>
```

---

## 11. Data Type Reference

### `EnrichedCountryStats` — raw feed shape
`src/globe/flights.ts` — lines 66–77

```ts
type EnrichedCountryStats = {
  in_air?:    number   // total flights in airspace right now
  arr?:       number   // international arrivals airborne right now
  dep?:       number   // international departures airborne right now
  dom?:       number   // domestic flights airborne right now (not split)
  over?:      number   // overflights right now
  day_total?: number   // total flights in airspace today
  day_arr?:   number   // international arrivals today
  day_dep?:   number   // international departures today
  day_dom?:   number   // domestic flights today (not split)
  day_over?:  number   // overflights today
}
```

### `Route` — per-route record
`src/globe/flights.ts` — lines 87–132 (selected fields)

```ts
type Route = {
  id:             number
  isoA3:          string   // origin country ISO3
  isoB3:          string   // destination country ISO3
  countryIso3List: string[] // all countries touched by this route (incl. overflown)
  trafficCount:   number   // baseline flight count from snapshot
  traffic:        number   // normalised density value [0, 1]
  seed:           number   // random constant for sine-wave de-sync
  phase:          number   // random phase offset for sine-wave de-sync
  // ... geometry, aircraft metadata, etc.
}
```

### `CountryFlightStats` — internal stats object
`src/globe/flights.ts` — lines 134–144

```ts
type CountryFlightStats = {
  now:          number    // flights in airspace right now
  tenMinAgo:    number    // flights 10 min ago (for trend; = now in enriched mode ⚠)
  routes:       number    // route count (= now in enriched mode ⚠; real in synthetic)
  incoming:     number    // arriving flights right now
  outgoing:     number    // departing flights right now
  dayTotal?:    number    // total flights today (enriched path only)
  dayIncoming?: number    // arrivals today (computed but never displayed ⚠)
  dayOutgoing?: number    // departures today (computed but never displayed ⚠)
  over?:        number    // overflights right now (enriched path only)
}
```

---

## 12. End-to-End Field Map

```
Source file field   → Transform                           → Internal name           → Panel slot
────────────────────────────────────────────────────────────────────────────────────────────────
arr               → distributeDomesticFlights (now)       → flowNow.incoming         → Incoming
dep               → distributeDomesticFlights (now)       → flowNow.outgoing         → Outgoing
dom               → split ⌊×0.5⌋ / ⌈×0.5⌉                → merged into above        → (merged in)
in_air            → direct, preferred for now             → now                      → (not directly shown)
over              → direct                                → over                     → Total (fallback)
day_arr           → distributeDomesticFlights (daily)     → flowDay.incoming         → (never shown ⚠)
day_dep           → distributeDomesticFlights (daily)     → flowDay.outgoing         → (never shown ⚠)
day_dom           → split ⌊×0.5⌋ / ⌈×0.5⌉                → merged into above        → (never shown ⚠)
day_total         → direct, preferred for dayTotal        → dayTotal                 → Total (preferred)
day_over          → fallback only (if day_total missing)  → inside dayTotal calc     → (merged in)

[synthetic path — no country_stats entry]
route.trafficCount → sine-wave × activity × trafficBoost  → flightsNow per route     → Incoming / Outgoing / Total
```

---

## 13. Known Issues

| # | Issue | Location |
|---|-------|----------|
| 1 | **Data is frozen** at `2026-02-02T19:00:00Z`. No live updates ever occur. | `public/data/flights_enriched.json` |
| 2 | `tenMinAgo = now` in enriched mode — there is no historical snapshot data, so the trend indicator is always zero | `getCountryFlightStats`, enriched path |
| 3 | `routes = now` in enriched mode — not a real route count; the value is meaningless | same |
| 4 | Sub-label "Routes Active" is displayed for flight counts, not route counts | `showCountryPanel`, lines 826 & 833 |
| 5 | When `in_air` is absent, `now` is computed as `incoming + outgoing + over`. But `incoming`/`outgoing` already include the domestic split from `arr`/`dep`/`dom`, while `over` is separate — the domestic flights are not double-counted in this specific case. However, if `over` is also absent, `now = incoming + outgoing`, which is correct. | `getCountryFlightStats` fallback |
| 6 | `dayIncoming` and `dayOutgoing` are computed every call but never referenced in `showCountryPanel` | `showCountryPanel` |
| 7 | ~35 countries (~22%) have no `country_stats` entry and always use the fully simulated path | `flights_enriched.json` coverage |
| 8 | Country names in the file that do not match any alias in `getCountryNameAliases()` are silently dropped to the synthetic path with no log or warning | `buildCountryStatsByIso3`, line 1551 |
| 9 | Stats are computed once at click time and never refreshed while the panel is open | `selectCountryFeature` |

---

## 14. How It Should Work — Ideal API Contract

### Root problem

The entire pipeline exists to work around one fundamental constraint: the data is a static
file that was not designed for this use case. A proper API would eliminate all heuristics.

### Polling endpoint

```
GET /api/v1/flight-stats
Response-Cache: max-age=60
```

Called on page load and every 60 seconds. Returns fresh aggregated stats per country.

### Ideal response format

```json
{
  "as_of": "2026-03-19T14:32:00Z",
  "country_stats": {
    "HRV": {
      "now":          324,
      "ten_min_ago":  311,
      "incoming":      96,
      "outgoing":      89,
      "over":         317,
      "routes":        48,
      "day_total":   2010,
      "day_incoming": 785,
      "day_outgoing": 760
    },
    "IND": { ... }
  }
}
```

Keys are ISO3 codes. All fields are required integers (`null` if unknown — never omitted).

### Field contract

| Field | Type | Meaning |
|-------|------|---------|
| `now` | `number \| null` | Live flights in airspace right now |
| `ten_min_ago` | `number \| null` | Flights 10 minutes ago — real measurement, not a copy |
| `incoming` | `number \| null` | Arriving flights right now (domestic arrivals already included) |
| `outgoing` | `number \| null` | Departing flights right now (domestic departures already included) |
| `over` | `number \| null` | Overflights right now |
| `routes` | `number \| null` | Distinct active routes touching this country |
| `day_total` | `number \| null` | Total flights today so far |
| `day_incoming` | `number \| null` | Arrivals today |
| `day_outgoing` | `number \| null` | Departures today |

### What the client code becomes

```ts
// The entire computation collapses to a direct mapping — no heuristics.
function getCountryFlightStats(iso3: string): CountryFlightStats | null {
  const raw = countryStatsByIso3.get(iso3)   // keyed by ISO3 directly — no name lookup
  if (!raw) return null
  return {
    now:         raw.now,
    tenMinAgo:   raw.ten_min_ago,    // real measurement
    routes:      raw.routes,          // real distinct count
    incoming:    raw.incoming,        // pre-split by API — no distributeDomesticFlights needed
    outgoing:    raw.outgoing,
    dayTotal:    raw.day_total,
    dayIncoming: raw.day_incoming,    // can now be shown in the panel
    dayOutgoing: raw.day_outgoing,    // can now be shown in the panel
    over:        raw.over,
  }
}
```

### Code that can be deleted

| Current code | Reason it exists | Removed when |
|---|---|---|
| `distributeDomesticFlights()` | API doesn't split domestic flights | API sends `incoming`/`outgoing` pre-split |
| `buildCountryStatsByIso3()` name resolution | Feed uses English names, not ISO3 | API keys by ISO3 |
| `getCountryNameAliases()` + GeoJSON lookup | Same | Same |
| `computeCountryFlightsAtTime()` | No real data for ~22% of countries | API covers all countries |
| `computeRouteFlightsAtTime()` sine modulation | Simulates traffic variation for stats | No longer needed for the stats panel |
| `tenMinAgo: now` placeholder | No history in the snapshot | API sends `ten_min_ago` |
| `routes: now` placeholder | No route count in the snapshot | API sends `routes` |
| `now` fallback sum | `in_air` may be absent | API always sends `now` |
| `dayTotal` fallback sum | `day_total` may be absent | API always sends `day_total` |

### Panel capabilities unlocked

| Slot | Today | With live API |
|------|-------|---------------|
| Incoming | Approximate (domestic heuristic) | Exact |
| Outgoing | Approximate (domestic heuristic) | Exact |
| Total | From frozen snapshot | Live, refreshed every 60 s |
| Trend (now vs 10 min ago) | Always neutral — `tenMinAgo = now` | Real trend arrow |
| Daily incoming | Computed, never shown | Displayable |
| Daily outgoing | Computed, never shown | Displayable |
| Route count | Wrong — shows flight count | Real distinct route count |
| Data age | Frozen Feb 2, 2026 | ~60 s latency |
