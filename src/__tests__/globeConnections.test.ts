/**
 * Globe connection data — unit test suite
 *
 * Uses Node.js built-in test runner (node:test + node:assert) with tsx.
 * No vite/vitest needed — runs without any bundler transforms.
 *
 * Run with:  npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  flightUStoUK,
  flightUSDomestic,
  flightAtBoundary,
  flightAntimeridian,
  flightBadLat,
  flightBadLon,
  flightNaNCoords,
  flightInfinityCoords,
  flightZeroDistance,
  flightMissingCoords,
  routeIntlUStoUK,
  routeIntlUKtoUS,
  routeDomesticUS,
  routeOverflyUS,
  routeDuplicateUStoUK,
  statsIndia,
  statsMinimal,
  statsZeros,
  statsNegative,
  mockFlightsDataset,
  emptyDataset,
  type MockFlightRecord,
  type MockRoute,
} from './mockData.js'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (extracted from flights.ts — keep in sync with source)
// ─────────────────────────────────────────────────────────────────────────────

function isFiniteFlightRecord(flight: MockFlightRecord): boolean {
  const coords = [flight.olat, flight.olon, flight.dlat, flight.dlon].map(Number)
  return (
    coords.every(Number.isFinite) &&
    Math.abs(coords[0]) <= 90 &&
    Math.abs(coords[1]) <= 180 &&
    Math.abs(coords[2]) <= 90 &&
    Math.abs(coords[3]) <= 180
  )
}

function parseFlightTimeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1e12 ? value : value * 1000
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/
  )
  if (isoMatch) {
    const [, year, month, day, hour, minute, second = '0', fraction = '0'] = isoMatch
    return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, Math.round(+`0.${fraction}` * 1000))
  }
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function distributeDomesticFlights(incoming: number, outgoing: number, domestic: number) {
  const safeIn  = Math.max(0, Math.round(incoming))
  const safeOut = Math.max(0, Math.round(outgoing))
  const safeDom = Math.max(0, Math.round(domestic))
  const domIn   = Math.floor(safeDom * 0.5)
  const domOut  = safeDom - domIn
  return { incoming: safeIn + domIn, outgoing: safeOut + domOut }
}

function computeCountryFlights(routes: MockRoute[], iso3: string): { incoming: number; outgoing: number } {
  let incoming = 0
  let outgoing = 0
  for (const r of routes) {
    const isOrigin = r.isoA3 === iso3
    const isDest   = r.isoB3 === iso3
    if (isOrigin && isDest) {
      incoming += r.trafficCount * 0.5
      outgoing += r.trafficCount * 0.5
      continue
    }
    if (isDest)   incoming += r.trafficCount
    if (isOrigin) outgoing += r.trafficCount
  }
  return {
    incoming: Math.max(0, Math.round(incoming)),
    outgoing: Math.max(0, Math.round(outgoing)),
  }
}

function normalizeCountryKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function getCountryNameAliases(name: string): string[] {
  const key = normalizeCountryKey(name)
  const out = new Set<string>([key])
  if (key === 'united states of america') out.add('united states')
  if (key === 'russian federation')       out.add('russia')
  if (key === 'czech republic')           out.add('czechia')
  if (key === 'south korea')              out.add('republic of korea')
  return [...out]
}

function latLonToXYZ(lat: number, lon: number, r = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return {
    x: -(r * Math.sin(phi) * Math.cos(theta)),
    y:   r * Math.cos(phi),
    z:   r * Math.sin(phi) * Math.sin(theta),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COORDINATE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('isFiniteFlightRecord — coordinate validation', () => {
  it('accepts a valid international flight', () => {
    assert.equal(isFiniteFlightRecord(flightUStoUK), true)
  })

  it('accepts a valid domestic flight', () => {
    assert.equal(isFiniteFlightRecord(flightUSDomestic), true)
  })

  it('accepts coordinates at exact boundary values (lat=±90, lon=±180)', () => {
    assert.equal(isFiniteFlightRecord(flightAtBoundary), true)
  })

  it('accepts antimeridian flight (lon near ±180)', () => {
    assert.equal(isFiniteFlightRecord(flightAntimeridian), true)
  })

  it('accepts a zero-distance flight (same origin and destination)', () => {
    assert.equal(isFiniteFlightRecord(flightZeroDistance), true)
  })

  it('rejects lat > 90', () => {
    assert.equal(isFiniteFlightRecord(flightBadLat), false)
  })

  it('rejects lon > 180', () => {
    assert.equal(isFiniteFlightRecord(flightBadLon), false)
  })

  it('rejects NaN coordinates', () => {
    assert.equal(isFiniteFlightRecord(flightNaNCoords), false)
  })

  it('rejects Infinity coordinates', () => {
    assert.equal(isFiniteFlightRecord(flightInfinityCoords), false)
  })

  it('rejects a record with missing coordinate fields', () => {
    assert.equal(isFiniteFlightRecord(flightMissingCoords), false)
  })

  it('rejects olon=181', () => {
    assert.equal(isFiniteFlightRecord({ olat: 0, olon: 181, dlat: 0, dlon: 0 }), false)
  })

  it('rejects olon=-181', () => {
    assert.equal(isFiniteFlightRecord({ olat: 0, olon: -181, dlat: 0, dlon: 0 }), false)
  })
})

describe('coordinate range — boundary arithmetic', () => {
  it('lat exactly 90 passes', () => {
    assert.equal(isFiniteFlightRecord({ olat: 90, olon: 0, dlat: 0, dlon: 0 }), true)
  })

  it('lat exactly -90 passes', () => {
    assert.equal(isFiniteFlightRecord({ olat: -90, olon: 0, dlat: 0, dlon: 0 }), true)
  })

  it('lon exactly 180 passes', () => {
    assert.equal(isFiniteFlightRecord({ olat: 0, olon: 180, dlat: 0, dlon: 0 }), true)
  })

  it('lon exactly -180 passes', () => {
    assert.equal(isFiniteFlightRecord({ olat: 0, olon: -180, dlat: 0, dlon: 0 }), true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. INCOMING / OUTGOING CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCountryFlights — incoming/outgoing classification', () => {
  it('counts a US→UK route as outgoing for USA', () => {
    const { incoming, outgoing } = computeCountryFlights([routeIntlUStoUK], 'USA')
    assert.equal(outgoing, routeIntlUStoUK.trafficCount)
    assert.equal(incoming, 0)
  })

  it('counts a US→UK route as incoming for GBR', () => {
    const { incoming, outgoing } = computeCountryFlights([routeIntlUStoUK], 'GBR')
    assert.equal(incoming, routeIntlUStoUK.trafficCount)
    assert.equal(outgoing, 0)
  })

  it('handles two-way traffic (US→UK + UK→US) for USA', () => {
    const { incoming, outgoing } = computeCountryFlights([routeIntlUStoUK, routeIntlUKtoUS], 'USA')
    assert.equal(outgoing, routeIntlUStoUK.trafficCount)
    assert.equal(incoming, routeIntlUKtoUS.trafficCount)
  })

  it('splits domestic routes 50/50', () => {
    const { incoming, outgoing } = computeCountryFlights([routeDomesticUS], 'USA')
    assert.equal(incoming + outgoing, routeDomesticUS.trafficCount)
    assert.ok(Math.abs(incoming - outgoing) <= 1)  // rounding tolerance
  })

  it('overflying route (CAN→MEX) is not counted for USA', () => {
    const { incoming, outgoing } = computeCountryFlights([routeOverflyUS], 'USA')
    assert.equal(incoming, 0)
    assert.equal(outgoing, 0)
  })

  it('empty route list returns zeros', () => {
    const { incoming, outgoing } = computeCountryFlights([], 'USA')
    assert.equal(incoming, 0)
    assert.equal(outgoing, 0)
  })

  it('unknown ISO3 returns zeros', () => {
    const { incoming, outgoing } = computeCountryFlights([routeIntlUStoUK], 'ZZZ')
    assert.equal(incoming, 0)
    assert.equal(outgoing, 0)
  })

  it('never returns negative values', () => {
    const negRoute: MockRoute = { id: 99, isoA3: 'USA', isoB3: 'GBR', trafficCount: -5, traffic: 0 }
    const { incoming, outgoing } = computeCountryFlights([negRoute], 'GBR')
    assert.ok(incoming >= 0)
    assert.ok(outgoing >= 0)
  })
})

describe('computeCountryFlights — duplicate route IDs', () => {
  it('counts duplicated routes separately by default (no dedup)', () => {
    const routes = [routeIntlUStoUK, routeDuplicateUStoUK]
    const { outgoing } = computeCountryFlights(routes, 'USA')
    assert.equal(outgoing, routeIntlUStoUK.trafficCount * 2)
  })

  it('deduplication by id removes double-counting', () => {
    const routes = [routeIntlUStoUK, routeDuplicateUStoUK]
    const seen = new Set<number>()
    const deduped = routes.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
    const { outgoing } = computeCountryFlights(deduped, 'USA')
    assert.equal(outgoing, routeIntlUStoUK.trafficCount)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. DOMESTIC FLIGHT DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

describe('distributeDomesticFlights', () => {
  it('splits even domestic count equally', () => {
    const { incoming, outgoing } = distributeDomesticFlights(10, 20, 100)
    assert.equal(incoming, 60)  // 10 + 50
    assert.equal(outgoing, 70)  // 20 + 50
  })

  it('odd domestic count: outgoing gets the extra 1', () => {
    const { incoming, outgoing } = distributeDomesticFlights(0, 0, 9)
    assert.equal(incoming, 4)  // floor(9 * 0.5)
    assert.equal(outgoing, 5)  // 9 - 4
  })

  it('clamps negative inputs to zero', () => {
    const result = distributeDomesticFlights(-10, -5, -100)
    assert.equal(result.incoming, 0)
    assert.equal(result.outgoing, 0)
  })

  it('handles all-zero stats', () => {
    const result = distributeDomesticFlights(0, 0, 0)
    assert.equal(result.incoming, 0)
    assert.equal(result.outgoing, 0)
  })

  it('preserves international flow without distortion', () => {
    const { incoming, outgoing } = distributeDomesticFlights(150, 137, 0)
    assert.equal(incoming, 150)
    assert.equal(outgoing, 137)
  })

  it('rounds fractional inputs before splitting', () => {
    const { incoming, outgoing } = distributeDomesticFlights(0, 0, 0.5)
    assert.equal(incoming + outgoing, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. COUNTRY DATA VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('country stats — malformed data', () => {
  it('handles completely absent stats (all fields undefined)', () => {
    const s = statsMinimal
    const dom = Math.max(0, Math.round(Number(s.dom ?? 0)))
    const result = distributeDomesticFlights(s.arr ?? 0, s.dep ?? 0, dom)
    assert.equal(result.incoming, 0)
    assert.equal(result.outgoing, 0)
  })

  it('handles zero stats without NaN', () => {
    const s = statsZeros
    const result = distributeDomesticFlights(s.arr!, s.dep!, s.dom!)
    assert.ok(Number.isFinite(result.incoming))
    assert.ok(Number.isFinite(result.outgoing))
  })

  it('clamps negative country stats to 0', () => {
    const s = statsNegative
    const dom = Math.max(0, Math.round(Number(s.dom ?? 0)))
    const result = distributeDomesticFlights(s.arr ?? 0, s.dep ?? 0, dom)
    assert.ok(result.incoming >= 0)
    assert.ok(result.outgoing >= 0)
  })
})

describe('country name normalization', () => {
  it('normalises whitespace and casing', () => {
    assert.equal(normalizeCountryKey('  United States  '), 'united states')
  })

  it('collapses internal whitespace', () => {
    assert.equal(normalizeCountryKey('United  Kingdom'), 'united kingdom')
  })

  it('generates alias: "United States of America" → "united states"', () => {
    assert.ok(getCountryNameAliases('United States of America').includes('united states'))
  })

  it('generates alias: "Russian Federation" → "russia"', () => {
    assert.ok(getCountryNameAliases('Russian Federation').includes('russia'))
  })

  it('generates alias: "Czech Republic" → "czechia"', () => {
    assert.ok(getCountryNameAliases('Czech Republic').includes('czechia'))
  })

  it('does not add spurious aliases for unrelated names', () => {
    const aliases = getCountryNameAliases('Germany')
    assert.equal(aliases.length, 1)
    assert.equal(aliases[0], 'germany')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. TIME PARSING
// ─────────────────────────────────────────────────────────────────────────────

describe('parseFlightTimeValue', () => {
  it('parses ISO 8601 string to UTC ms', () => {
    const ms = parseFlightTimeValue('2026-02-02T19:00:00Z')
    assert.equal(ms, Date.UTC(2026, 1, 2, 19, 0, 0))
  })

  it('parses ISO string with space separator', () => {
    const ms = parseFlightTimeValue('2026-02-02 19:00:00')
    assert.equal(ms, Date.UTC(2026, 1, 2, 19, 0, 0))
  })

  it('treats large number (>=1e12) as already ms', () => {
    const ts = 1738522800000
    assert.equal(parseFlightTimeValue(ts), ts)
  })

  it('converts small number (seconds) to ms', () => {
    assert.equal(parseFlightTimeValue(1000), 1_000_000)
  })

  it('returns null for empty string', () => {
    assert.equal(parseFlightTimeValue(''), null)
  })

  it('returns null for null input', () => {
    assert.equal(parseFlightTimeValue(null), null)
  })

  it('returns null for undefined input', () => {
    assert.equal(parseFlightTimeValue(undefined), null)
  })

  it('returns null for random text', () => {
    assert.equal(parseFlightTimeValue('not-a-date'), null)
  })

  it('returns null for Infinity', () => {
    assert.equal(parseFlightTimeValue(Infinity), null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. DATASET-LEVEL EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('empty dataset', () => {
  it('filters to zero valid flights from empty array', () => {
    const valid = emptyDataset.flights.filter(isFiniteFlightRecord)
    assert.equal(valid.length, 0)
  })

  it('returns zero stats for any country when route list is empty', () => {
    const { incoming, outgoing } = computeCountryFlights([], 'USA')
    assert.equal(incoming, 0)
    assert.equal(outgoing, 0)
  })
})

describe('mixed valid/invalid dataset', () => {
  it('filters out all invalid records, keeps valid ones', () => {
    const mixed: MockFlightRecord[] = [
      flightUStoUK,
      flightBadLat,
      flightBadLon,
      flightNaNCoords,
      flightUSDomestic,
      flightMissingCoords,
    ]
    const valid = mixed.filter(isFiniteFlightRecord)
    assert.equal(valid.length, 2)
    assert.deepEqual(valid.map(f => f.id), ['AA001', 'UA123'])
  })

  it('full mock dataset: all 4 valid flights pass', () => {
    const valid = mockFlightsDataset.flights.filter(isFiniteFlightRecord)
    assert.equal(valid.length, 4)
  })
})

describe('path coordinate convention [lon, lat]', () => {
  it('first element is longitude (|val| ≤ 180)', () => {
    const path = flightUStoUK.path!
    const [firstLon, firstLat] = path[0]
    assert.ok(Math.abs(firstLon) <= 180)
    assert.ok(Math.abs(firstLat) <= 90)
  })

  it('JFK origin lon is negative (west hemisphere)', () => {
    const [firstLon] = flightUStoUK.path![0]
    assert.ok(firstLon < 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. RENDER-LEVEL DATA INVARIANTS  (headless, no WebGL)
// ─────────────────────────────────────────────────────────────────────────────

describe('render-level data invariants', () => {
  it('valid coordinates produce finite 3D vectors', () => {
    const { x, y, z } = latLonToXYZ(flightUStoUK.olat, flightUStoUK.olon)
    assert.ok(Number.isFinite(x))
    assert.ok(Number.isFinite(y))
    assert.ok(Number.isFinite(z))
  })

  it('NaN coordinates produce non-finite 3D vectors (rendering guard)', () => {
    const { x } = latLonToXYZ(NaN, NaN)
    assert.equal(Number.isFinite(x), false)
  })

  it('3D vector magnitude ≈ 1 for unit sphere', () => {
    const { x, y, z } = latLonToXYZ(40.6413, -73.7781)
    const mag = Math.sqrt(x * x + y * y + z * z)
    assert.ok(Math.abs(mag - 1) < 1e-10)
  })

  it('traffic normalisation stays in [0, 1] for shader uniform', () => {
    const routes = [routeIntlUStoUK, routeIntlUKtoUS, routeDomesticUS, routeOverflyUS]
    for (const r of routes) {
      assert.ok(r.traffic >= 0, `traffic ${r.traffic} < 0`)
      assert.ok(r.traffic <= 1, `traffic ${r.traffic} > 1`)
    }
  })

  it('trafficCount is a non-negative integer', () => {
    const routes = [routeIntlUStoUK, routeIntlUKtoUS, routeDomesticUS, routeOverflyUS]
    for (const r of routes) {
      assert.ok(r.trafficCount >= 0)
      assert.ok(Number.isInteger(r.trafficCount))
    }
  })

  it('incoming + outgoing flow is close to in_air (within 15%)', () => {
    const s = statsIndia
    const dom = Math.max(0, Math.round(s.dom ?? 0))
    const { incoming, outgoing } = distributeDomesticFlights(s.arr!, s.dep!, dom)
    const totalFlow = incoming + outgoing + (s.over ?? 0)
    const tolerance = s.in_air! * 0.15
    assert.ok(Math.abs(totalFlow - s.in_air!) < tolerance,
      `totalFlow=${totalFlow} differs from in_air=${s.in_air} by more than 15%`)
  })
})
