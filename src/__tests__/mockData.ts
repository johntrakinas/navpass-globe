/**
 * Mock dataset for globe connection / flight data tests.
 *
 * Coordinate convention:
 *   olat / dlat  — latitude  [-90, 90]
 *   olon / dlon  — longitude [-180, 180]
 *   path entries — [longitude, latitude]  ← note reversed order (lon first)
 */

// ─── Types (mirrors flights.ts) ──────────────────────────────────────────────

export type MockFlightRecord = {
  id?: string | number
  cs?: string
  orig?: string
  dest?: string
  takeoffTime?: string | number
  olat: number
  olon: number
  dlat: number
  dlon: number
  path?: Array<[number, number]>
  segs?: { country?: string; enter?: string; exit?: string }[]
  snap_lat?: number
  snap_lon?: number
  snap_alt?: number
}

export type MockCountryStats = {
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
}

export type MockRoute = {
  id: number
  isoA3: string    // origin country ISO3
  isoB3: string    // destination country ISO3
  trafficCount: number
  traffic: number  // normalised density [0, 1]
}

// ─── Valid flight records ─────────────────────────────────────────────────────

/** International flight: US → UK (two different countries) */
export const flightUStoUK: MockFlightRecord = {
  id: 'AA001',
  cs: 'AAL001',
  orig: 'KJFK',
  dest: 'EGLL',
  takeoffTime: '2026-02-02T19:00:00Z',
  olat: 40.6413,    // JFK — valid lat
  olon: -73.7781,   // JFK — valid lon
  dlat: 51.4775,    // LHR — valid lat
  dlon: -0.4614,    // LHR — valid lon
  path: [[-73.7781, 40.6413], [-30.0, 52.0], [-0.4614, 51.4775]],
}

/** Domestic flight: US → US */
export const flightUSDomestic: MockFlightRecord = {
  id: 'UA123',
  cs: 'UAL123',
  orig: 'KLAX',
  dest: 'KJFK',
  takeoffTime: '2026-02-02T20:00:00Z',
  olat: 33.9425,
  olon: -118.4081,
  dlat: 40.6413,
  dlon: -73.7781,
}

/** Flight at exactly the valid boundary: lat=90, lon=180 */
export const flightAtBoundary: MockFlightRecord = {
  id: 'BND001',
  olat: 90.0,
  olon: 180.0,
  dlat: -90.0,
  dlon: -180.0,
}

/** Flight crossing the antimeridian (lon values near ±180) */
export const flightAntimeridian: MockFlightRecord = {
  id: 'ANT001',
  orig: 'NZAA',
  dest: 'KSFO',
  olat: -36.9975,
  olon: 174.7931,  // Auckland — just under +180
  dlat: 37.6213,
  dlon: -122.379,  // SFO — just over -180 threshold
}

// ─── Invalid / malformed flight records ──────────────────────────────────────

/** Latitude out of range */
export const flightBadLat: MockFlightRecord = {
  id: 'BAD001',
  olat: 95.0,   // ← invalid (>90)
  olon: 10.0,
  dlat: 48.8566,
  dlon: 2.3522,
}

/** Longitude out of range */
export const flightBadLon: MockFlightRecord = {
  id: 'BAD002',
  olat: 48.8566,
  olon: 200.0,  // ← invalid (>180)
  dlat: 40.6413,
  dlon: -73.7781,
}

/** NaN coordinates */
export const flightNaNCoords: MockFlightRecord = {
  id: 'BAD003',
  olat: NaN,
  olon: 10.0,
  dlat: 51.5,
  dlon: 0.0,
}

/** Infinity coordinates */
export const flightInfinityCoords: MockFlightRecord = {
  id: 'BAD004',
  olat: Infinity,
  olon: 10.0,
  dlat: 51.5,
  dlon: 0.0,
}

/** Both origin and destination identical (zero-distance route) */
export const flightZeroDistance: MockFlightRecord = {
  id: 'ZERO001',
  olat: 48.8566,
  olon: 2.3522,
  dlat: 48.8566,
  dlon: 2.3522,
}

/** Missing required coordinate fields (cast to bypass TS) */
export const flightMissingCoords = {
  id: 'MISSING001',
  orig: 'XXXX',
  dest: 'YYYY',
  // olat, olon, dlat, dlon are absent
} as unknown as MockFlightRecord

// ─── Mock route table (for incoming/outgoing logic tests) ────────────────────

export const routeIntlUStoUK: MockRoute = {
  id: 1,
  isoA3: 'USA',
  isoB3: 'GBR',
  trafficCount: 10,
  traffic: 0.8,
}

export const routeIntlUKtoUS: MockRoute = {
  id: 2,
  isoA3: 'GBR',
  isoB3: 'USA',
  trafficCount: 8,
  traffic: 0.7,
}

export const routeDomesticUS: MockRoute = {
  id: 3,
  isoA3: 'USA',
  isoB3: 'USA',
  trafficCount: 20,
  traffic: 0.9,
}

export const routeOverflyUS: MockRoute = {
  id: 4,
  isoA3: 'CAN',
  isoB3: 'MEX',
  trafficCount: 5,
  traffic: 0.5,
}

/** Duplicate of routeIntlUStoUK — used for deduplication tests */
export const routeDuplicateUStoUK: MockRoute = {
  id: 1,   // ← same id
  isoA3: 'USA',
  isoB3: 'GBR',
  trafficCount: 10,
  traffic: 0.8,
}

// ─── Mock country stats ───────────────────────────────────────────────────────

export const statsIndia: MockCountryStats = {
  in_air: 827,
  arr: 150,
  dep: 137,
  dom: 500,
  over: 40,
  day_total: 8200,
  day_arr: 1200,
  day_dep: 1100,
  day_dom: 5200,
  day_over: 700,
}

export const statsMinimal: MockCountryStats = {
  // Only optional fields — all absent
}

export const statsZeros: MockCountryStats = {
  in_air: 0,
  arr: 0,
  dep: 0,
  dom: 0,
  over: 0,
}

export const statsNegative: MockCountryStats = {
  arr: -5,   // ← invalid, should be clamped to 0
  dep: -3,
  dom: -100,
}

// ─── Complete mock dataset ────────────────────────────────────────────────────

export const mockFlightsDataset = {
  snapshot: '2026-02-02T19:00:00Z',
  flights: [flightUStoUK, flightUSDomestic, flightAtBoundary, flightAntimeridian],
  airports: {
    KJFK: { code: 'JFK', icao: 'KJFK', iata: 'JFK', lat: 40.6413, lon: -73.7781, country: 'United States' },
    EGLL: { code: 'LHR', icao: 'EGLL', iata: 'LHR', lat: 51.4775, lon: -0.4614, country: 'United Kingdom' },
    KLAX: { code: 'LAX', icao: 'KLAX', iata: 'LAX', lat: 33.9425, lon: -118.4081, country: 'United States' },
  },
  country_stats: {
    'United States': statsIndia,   // reused shape for brevity
    'United Kingdom': { in_air: 300, arr: 80, dep: 70, dom: 100, over: 20 },
  },
}

export const emptyDataset = {
  snapshot: '2026-02-02T19:00:00Z',
  flights: [] as MockFlightRecord[],
  airports: {} as Record<string, unknown>,
  country_stats: {} as Record<string, MockCountryStats>,
}
