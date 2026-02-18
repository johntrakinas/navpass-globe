import { findCountryFeature } from './countryLookUp'

type Airport = {
  name?: string
  latitude: number
  longitude: number
}

type BuildOptions = {
  targetCount?: number
  minSpacingDeg?: number
}

const LAT_LIMIT = 89
const DEFAULT_TARGET = 5200
const DEFAULT_SPACING_DEG = 0.5
const SOUTH_TARGET_SHARE = 0.44
const LAND_CACHE_CELL_DEG = 0.12
const SOUTH_POLAR_BAND_LAT = -70
const SOUTH_POLAR_TARGET_SHARE = 0.08
const SYNTHETIC_SEED = 0x51f2b7ad

function clampLat(lat: number) {
  return Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat))
}

function wrapLon(lon: number) {
  let v = lon
  while (v > 180) v -= 360
  while (v < -180) v += 360
  return v
}

function normLonDelta(a: number, b: number) {
  let d = Math.abs(a - b)
  if (d > 180) d = 360 - d
  return d
}

function isValidAirport(a: any): a is Airport {
  const lat = Number(a?.latitude)
  const lon = Number(a?.longitude)
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

function isOnLand(lat: number, lon: number, countriesGeoJSON: any) {
  if (!countriesGeoJSON?.features?.length) return true
  return Boolean(findCountryFeature(countriesGeoJSON, lat, lon))
}

function cellKey(lat: number, lon: number, cellDeg: number) {
  const latIdx = Math.floor((lat + 90) / cellDeg)
  const lonIdx = Math.floor((lon + 180) / cellDeg)
  return `${latIdx}:${lonIdx}`
}

function landCellKey(lat: number, lon: number) {
  const latIdx = Math.floor((lat + 90) / LAND_CACHE_CELL_DEG)
  const lonIdx = Math.floor((lon + 180) / LAND_CACHE_CELL_DEG)
  return `${latIdx}:${lonIdx}`
}

function parseKey(key: string) {
  const [a, b] = key.split(':')
  return { latIdx: Number(a), lonIdx: Number(b) }
}

function mulberry32(seed: number) {
  let s = seed >>> 0
  return function rand() {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function inflateAirportsDataset(
  baseAirports: Airport[] | unknown,
  countriesGeoJSON: any,
  options: BuildOptions = {}
): Airport[] {
  const targetCount = Math.max(1, Math.floor(options.targetCount ?? DEFAULT_TARGET))
  const minSpacingDeg = Math.max(0.15, Number(options.minSpacingDeg ?? DEFAULT_SPACING_DEG))
  const cellDeg = minSpacingDeg * 0.9

  const source = Array.isArray(baseAirports) ? baseAirports : []
  const valid = source.filter(isValidAirport)
  if (valid.length === 0) return []
  // Deterministic pseudo-random seed: random look, stable across reloads.
  const rand = mulberry32(SYNTHETIC_SEED ^ (valid.length << 10) ^ targetCount)

  const out: Airport[] = []
  const grid = new Map<string, Airport[]>()
  const landCache = new Map<string, boolean>()
  let syntheticId = 1
  let northCount = 0
  let southCount = 0
  let southPolarCount = 0
  const southTarget = Math.floor(targetCount * SOUTH_TARGET_SHARE)
  const northTarget = targetCount - southTarget

  function hasSpacing(lat: number, lon: number) {
    const key = cellKey(lat, lon, cellDeg)
    const { latIdx, lonIdx } = parseKey(key)
    const cosLat = Math.max(0.18, Math.cos((lat * Math.PI) / 180))
    const minSq = minSpacingDeg * minSpacingDeg

    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const nk = `${latIdx + di}:${lonIdx + dj}`
        const bucket = grid.get(nk)
        if (!bucket) continue
        for (let i = 0; i < bucket.length; i++) {
          const p = bucket[i]
          const dLat = lat - p.latitude
          const dLon = normLonDelta(lon, p.longitude) * cosLat
          const dSq = dLat * dLat + dLon * dLon
          if (dSq < minSq) return false
        }
      }
    }
    return true
  }

  function isLandCached(lat: number, lon: number) {
    if (!countriesGeoJSON?.features?.length) return true
    const k = landCellKey(lat, lon)
    const cached = landCache.get(k)
    if (typeof cached === 'boolean') return cached
    const ok = isOnLand(lat, lon, countriesGeoJSON)
    landCache.set(k, ok)
    return ok
  }

  function add(lat: number, lon: number, name?: string) {
    const nLat = clampLat(lat)
    const nLon = wrapLon(lon)
    if (!isLandCached(nLat, nLon)) return false
    if (!hasSpacing(nLat, nLon)) return false

    const item: Airport = {
      name: name || `LND-${String(syntheticId++).padStart(5, '0')}`,
      latitude: nLat,
      longitude: nLon
    }

    out.push(item)
    if (nLat < 0) southCount++
    else northCount++
    if (nLat <= SOUTH_POLAR_BAND_LAT) southPolarCount++
    const key = cellKey(nLat, nLon, cellDeg)
    const arr = grid.get(key) ?? []
    arr.push(item)
    grid.set(key, arr)
    return true
  }

  function hemisphereAccept(lat: number) {
    const isSouth = lat < 0
    const desired = isSouth ? southTarget : northTarget
    const current = isSouth ? southCount : northCount
    const pressure = (desired - current) / Math.max(1, desired)
    const probability = Math.max(0.12, Math.min(1.0, 0.52 + pressure * 0.9))
    return rand() <= probability
  }

  function shuffleInPlace<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = arr[i]
      arr[i] = arr[j]
      arr[j] = tmp
    }
  }

  // 1) Keep a balanced subset of real airports (prevents north-heavy initial bias).
  const maxRealKeep = Math.min(valid.length, Math.max(120, Math.floor(targetCount * 0.04)))
  const southReal = valid.filter(a => Number(a.latitude) < 0)
  const northReal = valid.filter(a => Number(a.latitude) >= 0)
  shuffleInPlace(southReal)
  shuffleInPlace(northReal)

  let keptReal = 0
  while (keptReal < maxRealKeep && (southReal.length > 0 || northReal.length > 0)) {
    const southRatio = southCount / Math.max(1, southTarget)
    const northRatio = northCount / Math.max(1, northTarget)
    const pickSouth =
      (southRatio <= northRatio && southReal.length > 0) || northReal.length === 0
    const src = pickSouth ? southReal.pop()! : northReal.pop()!
    if (add(Number(src.latitude), Number(src.longitude), String(src.name || `REAL-${keptReal + 1}`))) {
      keptReal++
    }
  }

  if (out.length >= targetCount) return out.slice(0, targetCount)

  // 2) Guarantee coverage in the Antarctic band so the south pole doesn't look empty.
  const southPolarTarget = Math.floor(targetCount * SOUTH_POLAR_TARGET_SHARE)
  let polarAttempts = 0
  const polarMaxAttempts = Math.max(7000, targetCount * 24)
  while (out.length < targetCount && southPolarCount < southPolarTarget && polarAttempts < polarMaxAttempts) {
    polarAttempts++
    const lat = SOUTH_POLAR_BAND_LAT - rand() * (LAT_LIMIT - Math.abs(SOUTH_POLAR_BAND_LAT))
    const lon = rand() * 360 - 180
    add(lat, lon)
  }

  // 2) Land-only global distribution (quasi-uniform) so points stay well spread.
  const spreadTarget = Math.min(targetCount, Math.floor(targetCount * 0.96))
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const globalIters = Math.max(spreadTarget * 14, 70000)
  const globalOffset = Math.floor(rand() * globalIters)
  const globalStep = 7919 // co-prime with most practical globalIters values
  const thetaOffset = rand() * Math.PI * 2
  for (let i = 0; i < globalIters && out.length < spreadTarget; i++) {
    const ii = (globalOffset + i * globalStep) % globalIters
    const y = 1 - (2 * (ii + 0.5)) / globalIters
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = goldenAngle * ii + thetaOffset

    const lat =
      (Math.asin(y) * 180) / Math.PI +
      (rand() - 0.5) * minSpacingDeg * 0.62
    const lon =
      (Math.atan2(r * Math.sin(theta), r * Math.cos(theta)) * 180) / Math.PI +
      (rand() - 0.5) * minSpacingDeg * 1.12

    if (Math.abs(lat) > LAT_LIMIT) continue
    if (!hemisphereAccept(lat)) continue
    add(lat, lon)
  }

  // 3) Random gap fill (deterministic): avoids geometric grid/ring patterns.
  if (out.length < targetCount) {
    const randomMaxAttempts = Math.max(targetCount * 40, 50000)
    let randomAttempts = 0
    while (out.length < targetCount && randomAttempts < randomMaxAttempts) {
      randomAttempts++
      const y = rand() * 2 - 1
      const lat = ((Math.asin(y) * 180) / Math.PI) * (LAT_LIMIT / 90)
      const lon = rand() * 360 - 180
      if (!hemisphereAccept(lat)) continue
      add(lat, lon)
    }
  }

  // 4) Final random fill (land-only + spacing) to hit target in sparse geographies.
  if (out.length < targetCount) {
    const maxAttempts = Math.max(targetCount * 12, 22000)
    let attempts = 0
    while (out.length < targetCount && attempts < maxAttempts) {
      attempts++
      const y = rand() * 2 - 1
      const lat = ((Math.asin(y) * 180) / Math.PI) * (LAT_LIMIT / 90)
      const lon = rand() * 360 - 180
      if (!hemisphereAccept(lat)) continue
      add(lat, lon)
    }

    // If strict balancing couldn't hit the target, relax the gate.
    let relaxed = 0
    const relaxedMax = Math.max(5000, Math.floor(targetCount * 1.2))
    while (out.length < targetCount && relaxed < relaxedMax) {
      relaxed++
      const y = rand() * 2 - 1
      const lat = ((Math.asin(y) * 180) / Math.PI) * (LAT_LIMIT / 90)
      const lon = rand() * 360 - 180
      add(lat, lon)
    }
  }

  return out
}
