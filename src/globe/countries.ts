import * as THREE from 'three'
import { scaleThickness } from './thicknessScale'

type LonLat = [number, number]

const BORDER_MASK_WIDTH = 6144
const BORDER_MASK_HEIGHT = 3072
const BASE_STROKE_PX = 2.0

function projectLonLatToUv(lon: number, lat: number) {
  const u = (lon + 180) / 360
  const v = (90 - lat) / 180
  return { u, v }
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

function drawRingStroke(
  ctx: CanvasRenderingContext2D,
  ring: LonLat[],
  width: number,
  height: number,
  xOffset: number
) {
  if (ring.length < 2) return
  const unwrapped = unwrapRingLon(ring)
  if (unwrapped.length < 2) return

  ctx.beginPath()
  for (let i = 0; i < unwrapped.length; i++) {
    const [lon, lat] = unwrapped[i]
    const { u, v } = projectLonLatToUv(lon, lat)
    const x = u * width + xOffset
    const y = v * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
}

function collectCountryRings(geojson: any) {
  const rings: LonLat[][] = []

  for (const feature of geojson.features ?? []) {
    const geom = feature?.geometry
    if (!geom) continue
    const polys: any[] =
      geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : []

    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) continue
      for (const ring of poly) {
        if (!Array.isArray(ring) || ring.length < 2) continue
        const out: LonLat[] = []
        for (const p of ring as any[]) {
          const lon = Number(p?.[0])
          const lat = Number(p?.[1])
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
          out.push([lon, lat])
        }
        if (out.length < 2) continue

        const first = out[0]
        const last = out[out.length - 1]
        if (Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8) {
          out.pop()
        }
        if (out.length >= 2) rings.push(out)
      }
    }
  }

  return rings
}

function createBorderTexture(rings: LonLat[][], initialLineWidth: number) {
  const canvas = document.createElement('canvas')
  canvas.width = BORDER_MASK_WIDTH
  canvas.height = BORDER_MASK_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D canvas context not available (country borders)')
  }
  const context = ctx

  const xOffsets = [-BORDER_MASK_WIDTH, 0, BORDER_MASK_WIDTH]

  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = true
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  function redraw(lineWidth: number) {
    context.clearRect(0, 0, BORDER_MASK_WIDTH, BORDER_MASK_HEIGHT)
    context.strokeStyle = '#ffffff'
    context.globalAlpha = 1
    context.lineWidth = Math.max(0.6, scaleThickness(BASE_STROKE_PX * lineWidth))
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.imageSmoothingEnabled = true

    for (const ring of rings) {
      for (const xOffset of xOffsets) {
        drawRingStroke(context, ring, BORDER_MASK_WIDTH, BORDER_MASK_HEIGHT, xOffset)
      }
    }

    texture.needsUpdate = true
  }

  redraw(initialLineWidth)
  return { texture, redraw }
}

export function createCountries(
  geojson: any,
  radius: number,
  camera: THREE.Camera
) {
  void camera

  let widthHint = 1
  const rings = collectCountryRings(geojson)
  const { texture, redraw } = createBorderTexture(rings, widthHint)

  const geometry = new THREE.SphereGeometry(radius * 1.0035, 96, 96)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture,
    transparent: true,
    opacity: 0.24,
    depthTest: true,
    depthWrite: false
  })

  const lines = new THREE.Mesh(geometry, material)
  lines.name = 'countryBorders'
  lines.renderOrder = 2.2
  lines.frustumCulled = false

  function setStyle(options: { opacity?: number; color?: THREE.ColorRepresentation; lineWidth?: number }) {
    if (typeof options.opacity === 'number') {
      material.opacity = THREE.MathUtils.clamp(options.opacity, 0, 1)
    }
    if (options.color !== undefined) {
      material.color.set(options.color)
    }
    if (typeof options.lineWidth === 'number') {
      widthHint = THREE.MathUtils.clamp(options.lineWidth, 0.35, 4)
      redraw(widthHint)
    }
  }

  return { lines, material, setStyle }
}
