type LonLat = [number, number]

const MIN_STROKE_SCALE = 0.64
const MAX_STROKE_SCALE = 1.0
const FOOTPRINT_LOG_MIN = 0.55
const FOOTPRINT_LOG_MAX = 3.05

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function unwrapRingLon(ring: LonLat[]) {
  if (ring.length === 0) return []

  const out: LonLat[] = []
  let prev = ring[0][0]
  let offset = 0
  out.push([prev, ring[0][1]])

  for (let i = 1; i < ring.length; i++) {
    const lon = ring[i][0]
    const lat = ring[i][1]
    let d = lon + offset - prev
    if (d > 180) offset -= 360
    else if (d < -180) offset += 360

    const adj = lon + offset
    out.push([adj, lat])
    prev = adj
  }

  return out
}

function normalizeRingPoints(rawRing: any[]): LonLat[] {
  const points: LonLat[] = []
  for (const p of rawRing) {
    const lon = Number(p?.[0])
    const lat = Number(p?.[1])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    points.push([lon, lat])
  }

  if (points.length < 2) return []

  const first = points[0]
  const last = points[points.length - 1]
  if (Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8) {
    points.pop()
  }
  return points
}

function computeRingFootprint(ring: LonLat[]) {
  const unwrapped = unwrapRingLon(ring)
  if (unwrapped.length < 2) return 0

  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const [lon, lat] of unwrapped) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  const lonSpan = Math.max(0, maxLon - minLon)
  const latSpan = Math.max(0, maxLat - minLat)
  return lonSpan * latSpan
}

function mapFootprintToScale(footprint: number) {
  const footprintLog = Math.log10(Math.max(0, footprint) + 1)
  const normalized = clamp(
    (footprintLog - FOOTPRINT_LOG_MIN) / (FOOTPRINT_LOG_MAX - FOOTPRINT_LOG_MIN),
    0,
    1
  )
  const eased = Math.pow(normalized, 0.68)
  return lerp(MIN_STROKE_SCALE, MAX_STROKE_SCALE, eased)
}

function getGeometry(featureOrGeometry: any) {
  if (!featureOrGeometry || typeof featureOrGeometry !== 'object') return null
  if (featureOrGeometry.geometry && typeof featureOrGeometry.geometry === 'object') {
    return featureOrGeometry.geometry
  }
  return featureOrGeometry
}

export function computeCountryStrokeScale(featureOrGeometry: any) {
  const geom = getGeometry(featureOrGeometry)
  if (!geom) return MAX_STROKE_SCALE

  const polygons =
    geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : []

  let largestFootprint = 0
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0 || !Array.isArray(poly[0])) continue
    const outer = normalizeRingPoints(poly[0] as any[])
    if (outer.length < 2) continue
    const footprint = computeRingFootprint(outer)
    if (footprint > largestFootprint) {
      largestFootprint = footprint
    }
  }

  return mapFootprintToScale(largestFootprint)
}
