type Coord = [number, number] // [lon, lat]

type IndexedFeature = {
  feature: any
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

const countryIndexCache = new WeakMap<any, IndexedFeature[]>()

function pointInRing(point: Coord, ring: Coord[]) {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

function pointInPolygon(point: Coord, polygon: Coord[][]) {
  // polygon = [outerRing, hole1, hole2...]
  if (!polygon.length) return false

  // deve estar dentro do contorno externo
  if (!pointInRing(point, polygon[0])) return false

  // não pode estar dentro de buracos
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false
  }

  return true
}

function updateBBox(lon: number, lat: number, box: { minLat: number; maxLat: number; minLon: number; maxLon: number }) {
  box.minLat = Math.min(box.minLat, lat)
  box.maxLat = Math.max(box.maxLat, lat)
  box.minLon = Math.min(box.minLon, lon)
  box.maxLon = Math.max(box.maxLon, lon)
}

function buildCountryIndex(geojson: any) {
  const features = geojson?.features ?? []
  const index: IndexedFeature[] = []

  for (const feature of features) {
    const geom = feature?.geometry
    if (!geom) continue

    const box = {
      minLat: Infinity,
      maxLat: -Infinity,
      minLon: Infinity,
      maxLon: -Infinity
    }

    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates ?? []) {
        for (const coord of ring ?? []) {
          const lon = Number(coord?.[0])
          const lat = Number(coord?.[1])
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
          updateBBox(lon, lat, box)
        }
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates ?? []) {
        for (const ring of polygon ?? []) {
          for (const coord of ring ?? []) {
            const lon = Number(coord?.[0])
            const lat = Number(coord?.[1])
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
            updateBBox(lon, lat, box)
          }
        }
      }
    } else {
      continue
    }

    if (!Number.isFinite(box.minLat) || !Number.isFinite(box.maxLat) || !Number.isFinite(box.minLon) || !Number.isFinite(box.maxLon)) {
      continue
    }

    index.push({
      feature,
      minLat: box.minLat,
      maxLat: box.maxLat,
      minLon: box.minLon,
      maxLon: box.maxLon
    })
  }

  countryIndexCache.set(geojson, index)
  return index
}

function getCountryIndex(geojson: any) {
  if (!geojson) return []
  const cached = countryIndexCache.get(geojson)
  if (cached) return cached
  return buildCountryIndex(geojson)
}

/**
 * Retorna o feature do país que contém o ponto (lat, lon)
 */
export function findCountryFeature(
  geojson: any,
  lat: number,
  lon: number
) {
  const point: Coord = [lon, lat]
  const candidates = getCountryIndex(geojson)

  for (const item of candidates) {
    if (lat < item.minLat || lat > item.maxLat) continue
    if (lon < item.minLon || lon > item.maxLon) continue
    const feature = item.feature
    const geom = feature.geometry
    if (!geom) continue

    if (geom.type === 'Polygon') {
      if (pointInPolygon(point, geom.coordinates)) {
        return feature
      }
    }

    if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        if (pointInPolygon(point, polygon)) {
          return feature
        }
      }
    }
  }

  return null
}
