import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { createLineFadeMaterial } from './lineFadeMaterial'
import { GOOGLE_COLORS } from '../theme/googleColors'

type LonLat = [number, number]

const SEGMENT_PRECISION = 1e4

function pointKey(lon: number, lat: number) {
  const qLon = Math.round(lon * SEGMENT_PRECISION)
  const qLat = Math.round(lat * SEGMENT_PRECISION)
  return `${qLon},${qLat}`
}

function segmentKey(a: LonLat, b: LonLat) {
  const ka = pointKey(a[0], a[1])
  const kb = pointKey(b[0], b[1])
  if (ka === kb) return ''
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

function buildSharedBorderPositions(geojson: any, radius: number) {
  const segmentMap = new Map<string, { count: number; a: LonLat; b: LonLat }>()

  for (const feature of geojson.features ?? []) {
    const geom = feature?.geometry
    if (!geom) continue
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a: LonLat = [Number(ring[i]?.[0]), Number(ring[i]?.[1])]
          const b: LonLat = [Number(ring[i + 1]?.[0]), Number(ring[i + 1]?.[1])]

          if (!Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) {
            continue
          }

          const key = segmentKey(a, b)
          if (!key) continue

          const prev = segmentMap.get(key)
          if (prev) {
            prev.count += 1
          } else {
            segmentMap.set(key, { count: 1, a, b })
          }
        }
      }
    }
  }

  const positions: number[] = []
  for (const { count, a, b } of segmentMap.values()) {
    // Keep only shared segments (country-to-country borders).
    // Coastlines (land-ocean edges) usually appear once and are skipped.
    if (count < 2) continue

    const v1 = latLongToVector3(a[1], a[0], radius * 1.002)
    const v2 = latLongToVector3(b[1], b[0], radius * 1.002)
    positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z)
  }

  return positions
}

export function createCountries(
  geojson: any,
  radius: number,
  camera: THREE.Camera
) {
  const positions = buildSharedBorderPositions(geojson, radius)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )

  // Subtle base borders (internal/frontiers only, no coastline edge).
  const material = createLineFadeMaterial(GOOGLE_COLORS.white, 0.16, 0.2, 0.7)

  const lines = new THREE.LineSegments(geometry, material)
  lines.renderOrder = 2
  lines.frustumCulled = false
  lines.visible = true
  lines.onBeforeRender = () => {
    material.uniforms.uCameraPos.value.copy((camera as any).position)
    material.uniforms.uOpacity.value = material.opacity
  }

  return { lines, material }
}
