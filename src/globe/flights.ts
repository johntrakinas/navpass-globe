import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { GOOGLE_COLORS } from '../theme/googleColors'
import { findCountryFeature } from './countryLookUp'
import { vector3ToLatLon } from './math'
import { scaleThickness } from './thicknessScale'

import flightLinesVert from '../shaders/flightLines.vert?raw'
import flightLinesFrag from '../shaders/flightLines.frag?raw'
import flightPlanesVert from '../shaders/flightPlanes.vert?raw'
import flightPlanesFrag from '../shaders/flightPlanes.frag?raw'
import flightEndpointsVert from '../shaders/flightEndpoints.vert?raw'
import flightEndpointsFrag from '../shaders/flightEndpoints.frag?raw'
import flightPinVert from '../shaders/flightPin.vert?raw'
import flightPinFrag from '../shaders/flightPin.frag?raw'
import flightHeatmapVert from '../shaders/flightHeatmap.vert?raw'
import flightHeatmapFrag from '../shaders/flightHeatmap.frag?raw'
import pointsVert from '../shaders/points.vert?raw'
import pointsFrag from '../shaders/points.frag?raw'

type Airport = {
  name?: string
  latitude: number
  longitude: number
}

type EnrichedFlightRecord = {
  id?: string | number
  cs?: string
  orig?: string
  dest?: string
  takeoffTime?: string | number
  reg?: string
  type?: string
  air?: string
  olat: number
  olon: number
  dlat: number
  dlon: number
  path?: Array<[number, number]>
  segs?: EnrichedFlightSegment[]
  snap_lat?: number
  snap_lon?: number
  snap_alt?: number
}

type EnrichedFlightSegment = {
  country?: string
  enter?: string
  exit?: string
}

type EnrichedAirportMeta = {
  code?: string
  icao?: string
  iata?: string
  name?: string
  lat?: number
  lon?: number
  elev?: number
  city?: string
  kind?: string
  country?: string
}

type EnrichedCountryStats = {
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

type FlightRoutesSource =
  | Airport[]
  | {
      flights: EnrichedFlightRecord[]
      airportLookup?: Record<string, EnrichedAirportMeta> | null
      countryStats?: Record<string, EnrichedCountryStats> | null
    }

type Route = {
  id: number
  p0x: number
  p0y: number
  p0z: number
  p1x: number
  p1y: number
  p1z: number
  p2x: number
  p2y: number
  p2z: number
  speed: number
  phase: number
  seed: number
  size: number
  dir: number
  traffic: number
  trafficCount: number
  hub: number
  density01: number
  corridorKeep01: number
  corridorGroup01: number
  importance01: number
  arcHeight: number
  lateralOffsetRad: number
  loopSweepRad: number
  altitude01: number
  distanceKm: number
  flightName: string
  fromName: string
  toName: string
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  isoA3: string
  isoB3: string
  countryIso3List: string[]
  callsign: string
  airline: string
  aircraftType: string
  registration: string
  sourceMode: 'synthetic' | 'enriched'
}

type CountryFlightStats = {
  now: number
  tenMinAgo: number
  routes: number
  incoming: number
  outgoing: number
  dayTotal?: number
  dayIncoming?: number
  dayOutgoing?: number
  over?: number
}

export type FlightRouteMaterials = {
  line: THREE.ShaderMaterial
  plane: THREE.ShaderMaterial
  heatmap: THREE.ShaderMaterial
  endpoints: THREE.ShaderMaterial
  pin: THREE.ShaderMaterial
  hubs: THREE.ShaderMaterial | null
}

export type FlightVisualizationMode = 'legacy' | 'reengineered'

export type CreateFlightRoutesOptions = {
  routeCount?: number
  planesPerRoute?: number
  planeDensityScale?: number
  currentTimeSeconds?: number
}

export type FlightRoutesLayer = {
  group: THREE.Group
  lines: THREE.LineSegments
  planes: THREE.Points
  materials: FlightRouteMaterials
  update: (deltaSeconds: number, timeSeconds: number, cameraDistance: number) => void
  setFocusCountry: (iso3: string | null) => void
  setHoverRoute: (routeId: number | null) => void
  setSelectedRoute: (routeId: number | null) => void
  getRouteInfo: (routeId: number) => any | null
  getCountryFlightStats: (iso3: string, timeSeconds: number) => CountryFlightStats
  setHeatmapEnabled: (enabled: boolean) => void
  setVisualizationMode: (mode: FlightVisualizationMode) => void
}

type KernelTap = { dx: number; dy: number; w: number }
type RouteScoreBuffers = {
  density: Float32Array
  corridorKeep: Float32Array
  corridorGroup: Float32Array
  importance: Float32Array
}

function buildGaussianKernel(radius: number, sigma: number): KernelTap[] {
  const taps: KernelTap[] = []
  const denom = 2 * sigma * sigma
  let sum = 0

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy
      const w = Math.exp(-d2 / denom)
      taps.push({ dx, dy, w })
      sum += w
    }
  }

  // Normalize so total contribution per stamp stays stable.
  if (sum > 0) {
    for (let i = 0; i < taps.length; i++) {
      taps[i].w /= sum
    }
  }

  return taps
}

function scheduleDeferredWork(work: (deadline?: IdleDeadline) => void, delayMs = 0) {
  const run = () => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback((deadline) => work(deadline), { timeout: 180 })
      return
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => work(undefined))
      return
    }
    setTimeout(() => work(undefined), 16)
  }

  if (delayMs > 0 && typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(run, delayMs)
    return
  }

  run()
}

function buildFlightHeatmapTexture(routeData: Route[], width: number, height: number) {
  const heat = new Float32Array(width * height)
  const kernel = buildGaussianKernel(4, 2.15)
  const samplesPerRoute = routeData.length > 12000 ? 24 : routeData.length > 5000 ? 42 : 84
  const tmp = new THREE.Vector3()
  const tmpRoutePoint: number[] = [0, 0, 0]

  for (let i = 0; i < routeData.length; i++) {
    const r = routeData[i]
    const traffic01 = THREE.MathUtils.clamp((r.traffic - 0.62) / (1.22 - 0.62), 0, 1)
    const routeWeight = r.trafficCount * (0.75 + traffic01 * 0.55)
    const perSample = routeWeight / samplesPerRoute

    for (let s = 0; s < samplesPerRoute; s++) {
      const t = s / (samplesPerRoute - 1)
      routePointParam(tmpRoutePoint, r, t)
      tmp.set(tmpRoutePoint[0], tmpRoutePoint[1], tmpRoutePoint[2]).normalize()
      const { lat, lon } = vector3ToLatLon(tmp)
      let u = (lon + 180) / 360
      let v = (lat + 90) / 180

      // wrap U; clamp V
      u = u - Math.floor(u)
      v = THREE.MathUtils.clamp(v, 0, 1)

      const cx = Math.floor(u * width)
      const cy = Math.floor(v * height)

      for (let k = 0; k < kernel.length; k++) {
        const tap = kernel[k]
        const xx = (cx + tap.dx + width) % width
        const yy = Math.max(0, Math.min(height - 1, cy + tap.dy))
        heat[yy * width + xx] += perSample * tap.w
      }
    }
  }

  let max = 0
  for (let i = 0; i < heat.length; i++) max = Math.max(max, heat[i])
  max = Math.max(1e-6, max)

  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < heat.length; i++) {
    let v = heat[i] / max
    v = Math.min(1, Math.max(0, v))
    // Lift mids for a nicer ramp without nuking highlights.
    v = Math.pow(v, 0.55)

    const b = Math.round(v * 255)
    const o = i * 4
    data[o + 0] = b
    data[o + 1] = b
    data[o + 2] = b
    data[o + 3] = 255
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.needsUpdate = true
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

function buildEmptyHeatTexture(width: number, height: number) {
  const data = new Uint8Array(width * height * 4)
  // Keep alpha opaque (texture uses .r, but this keeps debugging easier).
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 3] = 255
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.needsUpdate = true
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

function buildFlightHeatmapTextureAsync(routeData: Route[], width: number, height: number) {
  const tex = buildEmptyHeatTexture(width, height)

  const applyFallback = () => {
    const fallback = buildFlightHeatmapTexture(routeData, width, height)
    ;(tex.image as any).data = (fallback.image as any).data
    tex.needsUpdate = true
  }

  scheduleDeferredWork(() => {
    if (typeof Worker === 'undefined') {
      scheduleDeferredWork(() => applyFallback(), 40)
      return
    }

    try {
      const stride = 14 // p0/p1/p2 (9) + curve (3) + traffic (1) + trafficCount (1)
      const packed = new Float32Array(routeData.length * stride)
      for (let i = 0; i < routeData.length; i++) {
        const r = routeData[i]
        const o = i * stride
        packed[o + 0] = r.p0x
        packed[o + 1] = r.p0y
        packed[o + 2] = r.p0z
        packed[o + 3] = r.p1x
        packed[o + 4] = r.p1y
        packed[o + 5] = r.p1z
        packed[o + 6] = r.p2x
        packed[o + 7] = r.p2y
        packed[o + 8] = r.p2z
        packed[o + 9] = r.arcHeight
        packed[o + 10] = r.lateralOffsetRad
        packed[o + 11] = r.loopSweepRad
        packed[o + 12] = r.traffic
        packed[o + 13] = r.trafficCount
      }

      const worker = new Worker(new URL('../workers/flightHeatmapWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (ev: MessageEvent<any>) => {
        const buf: ArrayBuffer | undefined = ev.data?.data
        if (buf) {
          const out = new Uint8Array(buf)
          if ((tex.image as any)?.data && out.length === (tex.image as any).data.length) {
            ;(tex.image as any).data = out
            tex.needsUpdate = true
          }
        }
        worker.terminate()
      }
      worker.onerror = () => {
        worker.terminate()
        scheduleDeferredWork(() => applyFallback(), 40)
      }

      worker.postMessage({ routes: packed, width, height }, [packed.buffer])
    } catch {
      scheduleDeferredWork(() => applyFallback(), 40)
    }
  }, 100)

  return tex
}

function isFiniteLatLon(a: Airport) {
  const lat = Number(a.latitude)
  const lon = Number(a.longitude)
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

function pickRouteIndices(airports: Airport[], count: number) {
  const valid: Airport[] = []
  const dirs: Array<[number, number, number]> = []

  for (const a of airports) {
    if (!isFiniteLatLon(a)) continue
    valid.push(a)
    const dir = latLongToVector3(Number(a.latitude), Number(a.longitude), 1).normalize()
    dirs.push([dir.x, dir.y, dir.z])
  }

  const routes: Array<[number, number]> = []
  const used = new Set<string>()

  function dotOf(i: number, j: number) {
    const a = dirs[i]
    const b = dirs[j]
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  }

  // Pick some "global hubs" with farthest-point sampling so we get a realistic
  // mixture of hub-to-hub, hub-to-spoke and regional connections.
  function chooseHubs(hubCount: number) {
    const hubs: number[] = []
    if (valid.length === 0) return hubs
    hubs.push(Math.floor(Math.random() * valid.length))

    const best = new Float32Array(valid.length)
    best.fill(0)

    for (let k = 1; k < hubCount; k++) {
      let bestIdx = 0
      let bestScore = -1

      for (let i = 0; i < valid.length; i++) {
        let minDist = Infinity
        for (let h = 0; h < hubs.length; h++) {
          // dist ~ 1 - dot (0 close, 2 opposite)
          const d = 1 - dotOf(i, hubs[h])
          if (d < minDist) minDist = d
        }
        best[i] = minDist
        if (minDist > bestScore) {
          bestScore = minDist
          bestIdx = i
        }
      }

      hubs.push(bestIdx)
    }

    return hubs
  }

  const hubCount = Math.min(12, Math.max(6, Math.floor(valid.length / 10)))
  const hubs = chooseHubs(hubCount)

  function tryAdd(ia: number, ib: number) {
    if (ia === ib) return false
    const a = Math.min(ia, ib)
    const b = Math.max(ia, ib)
    const key = `${a}-${b}`
    if (used.has(key)) return false
    used.add(key)
    routes.push([a, b])
    return true
  }

  const maxTries = Math.max(800, count * 140)
  for (let i = 0; i < maxTries && routes.length < count; i++) {
    const r = Math.random()

    // 0) hub-hub long haul
    if (r < 0.34 && hubs.length >= 2) {
      const ia = hubs[Math.floor(Math.random() * hubs.length)]
      const ib = hubs[Math.floor(Math.random() * hubs.length)]
      if (ia === ib) continue
      const dot = dotOf(ia, ib)
      // prefer longer angles (smaller dot)
      if (dot > 0.65) continue
      const accept = THREE.MathUtils.clamp(0.35 + (1.0 - dot) * 0.75, 0.35, 0.98)
      if (Math.random() > accept) continue
      tryAdd(ia, ib)
      continue
    }

    // 1) hub-spoke (global + medium haul)
    if (r < 0.72 && hubs.length >= 1) {
      const hub = hubs[Math.floor(Math.random() * hubs.length)]
      const other = Math.floor(Math.random() * valid.length)
      if (hub === other) continue
      const dot = dotOf(hub, other)
      // avoid ultra-short hops for this bucket
      if (dot > 0.92) continue
      const accept = THREE.MathUtils.clamp(0.25 + (1.0 - dot) * 0.55, 0.25, 0.92)
      if (Math.random() > accept) continue
      tryAdd(hub, other)
      continue
    }

    // 2) regional / short haul
    const ia = Math.floor(Math.random() * valid.length)
    const ib = Math.floor(Math.random() * valid.length)
    if (ia === ib) continue
    const dot = dotOf(ia, ib)
    // keep short-ish, but not tiny
    if (dot < 0.72 || dot > 0.975) continue
    const accept = THREE.MathUtils.clamp(0.35 + (dot - 0.72) * 0.35, 0.35, 0.85)
    if (Math.random() > accept) continue
    tryAdd(ia, ib)
  }

  // Fallback: if we couldn't fill enough, relax constraints.
  if (routes.length < count) {
    const fallbackTries = Math.max(300, (count - routes.length) * 80)
    for (let i = 0; i < fallbackTries && routes.length < count; i++) {
      const ia = Math.floor(Math.random() * valid.length)
      const ib = Math.floor(Math.random() * valid.length)
      if (ia === ib) continue
      const dot = dotOf(ia, ib)
      if (dot > 0.985) continue
      const accept = THREE.MathUtils.clamp(0.22 + (1.0 - dot) * 0.5, 0.22, 0.9)
      if (Math.random() > accept) continue
      tryAdd(ia, ib)
    }
  }

  return { valid, routes }
}

function buildRouteArcHeight(radius: number, distanceKm: number) {
  const routeSpan01 = THREE.MathUtils.clamp((distanceKm - 180) / 9200, 0, 1)
  const eased = Math.pow(routeSpan01, 0.82)
  return radius * THREE.MathUtils.lerp(0.018, 0.132, eased)
}

function buildRouteLateralOffsetRad(overlap: RouteOverlapInfo, distanceKm: number) {
  if (overlap.count <= 1 || Math.abs(overlap.slot) < 1e-6) return 0
  const routeSpan01 = THREE.MathUtils.clamp((distanceKm - 250) / 9000, 0, 1)
  const stepAngleRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(0.42, 0.2, routeSpan01))
  const maxSpreadRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(1.6, 1.0, routeSpan01))
  return THREE.MathUtils.clamp(overlap.slot * stepAngleRad, -maxSpreadRad, maxSpreadRad)
}

function buildRouteLoopSweepRad(distanceKm: number) {
  const loop01 = THREE.MathUtils.clamp((distanceKm - 40) / 600, 0, 1)
  return THREE.MathUtils.degToRad(THREE.MathUtils.lerp(6.5, 11.5, loop01))
}

function buildBezierControlPoint(
  startDir: THREE.Vector3,
  endDir: THREE.Vector3,
  hintDir: THREE.Vector3,
  radius: number,
  arcBoost: number,
  arcHeight: number
) {
  const controlDir = hintDir.clone()
  if (controlDir.lengthSq() < 1e-6) {
    controlDir.copy(startDir).add(endDir)
  }
  if (controlDir.lengthSq() < 1e-6) {
    const axis = new THREE.Vector3(0, 1, 0).cross(startDir)
    if (axis.lengthSq() < 1e-6) {
      axis.set(1, 0, 0).cross(startDir)
    }
    axis.normalize()
    controlDir.copy(startDir).applyAxisAngle(axis, Math.PI * 0.5)
  }

  controlDir.normalize()

  const antipodalBoost = THREE.MathUtils.smoothstep(arcBoost, 0.95, 1.25)
  const controlRadius = Math.max(
    radius * (1.10 + arcBoost * 0.20 + antipodalBoost * 0.16),
    radius + arcHeight * 1.9
  )

  return controlDir.multiplyScalar(controlRadius)
}

function routePointParam(out: number[], r: Route, t: number) {
  const omt = 1 - t
  const omt2 = omt * omt
  const tt = t * t
  const k0 = omt2
  const k1 = 2 * omt * t
  const k2 = tt

  out[0] = r.p0x * k0 + r.p1x * k1 + r.p2x * k2
  out[1] = r.p0y * k0 + r.p1y * k1 + r.p2y * k2
  out[2] = r.p0z * k0 + r.p1z * k1 + r.p2z * k2

  const minShell =
    Math.min(
      Math.hypot(r.p0x, r.p0y, r.p0z),
      Math.hypot(r.p2x, r.p2y, r.p2z)
    ) * 0.995
  const len = Math.hypot(out[0], out[1], out[2])
  if (len < 1e-6) {
    const fx = r.p0x + r.p2x
    const fy = r.p0y + r.p2y
    const fz = r.p0z + r.p2z
    const fl = Math.hypot(fx, fy, fz)
    if (fl > 1e-6) {
      out[0] = (fx / fl) * minShell
      out[1] = (fy / fl) * minShell
      out[2] = (fz / fl) * minShell
    } else {
      const p0l = Math.hypot(r.p0x, r.p0y, r.p0z)
      const sx = p0l > 1e-6 ? r.p0x / p0l : 0
      const sy = p0l > 1e-6 ? r.p0y / p0l : 1
      const sz = p0l > 1e-6 ? r.p0z / p0l : 0
      out[0] = sx * minShell
      out[1] = sy * minShell
      out[2] = sz * minShell
    }
  } else if (len < minShell) {
    const scale = minShell / len
    out[0] *= scale
    out[1] *= scale
    out[2] *= scale
  }
}

function buildRouteSamplePositions(r: Route, segmentsPerRoute: number) {
  const sampleCount = segmentsPerRoute + 1
  const positions = new Float32Array(sampleCount * 3)
  const tmp: number[] = [0, 0, 0]

  for (let i = 0; i < sampleCount; i++) {
    routePointParam(tmp, r, i / segmentsPerRoute)
    const o = i * 3
    positions[o + 0] = tmp[0]
    positions[o + 1] = tmp[1]
    positions[o + 2] = tmp[2]
  }

  return positions
}

function buildRouteDensityScores(routeData: Route[]) {
  if (routeData.length === 0) return

  const width = routeData.length > 10000 ? 192 : 160
  const height = Math.floor(width / 2)
  const counts = new Uint16Array(width * height)
  const sampleCount = routeData.length > 12000 ? 6 : routeData.length > 6000 ? 8 : 10
  const tmp: number[] = [0, 0, 0]
  const tmpVec = new THREE.Vector3()

  const countIndex = (lat: number, lon: number) => {
    const u = ((lon + 180) / 360 + 1) % 1
    const v = THREE.MathUtils.clamp((lat + 90) / 180, 0, 1)
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)))
    const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)))
    return y * width + x
  }

  for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
    const r = routeData[rIndex]
    for (let i = 0; i < sampleCount; i++) {
      const t = sampleCount <= 1 ? 0 : i / (sampleCount - 1)
      routePointParam(tmp, r, t)
      tmpVec.set(tmp[0], tmp[1], tmp[2]).normalize()
      const { lat, lon } = vector3ToLatLon(tmpVec)
      const idx = countIndex(lat, lon)
      counts[idx] = Math.min(65535, counts[idx] + 1)
    }
  }

  const rawScores = new Float32Array(routeData.length)
  let maxRaw = 0

  for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
    const r = routeData[rIndex]
    let sum = 0
    let maxCell = 0

    for (let i = 0; i < sampleCount; i++) {
      const t = sampleCount <= 1 ? 0 : i / (sampleCount - 1)
      routePointParam(tmp, r, t)
      tmpVec.set(tmp[0], tmp[1], tmp[2]).normalize()
      const { lat, lon } = vector3ToLatLon(tmpVec)
      const cellCount = Math.max(0, counts[countIndex(lat, lon)] - 1)
      sum += cellCount
      maxCell = Math.max(maxCell, cellCount)
    }

    const avgCell = sum / sampleCount
    const raw = avgCell * 0.68 + maxCell * 0.32
    rawScores[rIndex] = raw
    maxRaw = Math.max(maxRaw, raw)
  }

  const normDenom = Math.log1p(Math.max(1, maxRaw))
  for (let i = 0; i < routeData.length; i++) {
    routeData[i].density01 =
      normDenom > 1e-6
        ? THREE.MathUtils.clamp(Math.pow(Math.log1p(rawScores[i]) / normDenom, 0.9), 0, 1)
        : 0
  }
}

function buildRouteCorridorScores(routeData: Route[]) {
  if (routeData.length === 0) return

  const stepDeg = routeData.length > 14000 ? 3.5 : routeData.length > 9000 ? 3.0 : routeData.length > 5000 ? 2.5 : 2.0
  const groups = new Map<string, Route[]>()
  const tmp: number[] = [0, 0, 0]
  const tmpVec = new THREE.Vector3()

  const quantizeCell = (lat: number, lon: number) => {
    const latKey = Math.round(lat / stepDeg)
    const lonKey = Math.round(lon / stepDeg)
    return `${latKey},${lonKey}`
  }

  for (let i = 0; i < routeData.length; i++) {
    const r = routeData[i]
    routePointParam(tmp, r, 0.5)
    tmpVec.set(tmp[0], tmp[1], tmp[2]).normalize()
    const { lat: midLat, lon: midLon } = vector3ToLatLon(tmpVec)

    const fromCell = quantizeCell(r.fromLat, r.fromLon)
    const toCell = quantizeCell(r.toLat, r.toLon)
    const midCell = quantizeCell(midLat, midLon)
    const edgeA = fromCell < toCell ? fromCell : toCell
    const edgeB = fromCell < toCell ? toCell : fromCell
    const key = `${edgeA}|${edgeB}|${midCell}`

    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  for (const routes of groups.values()) {
    routes.sort((a, b) => {
      const trafficA = THREE.MathUtils.clamp((a.traffic - 0.62) / (1.22 - 0.62), 0, 1)
      const trafficB = THREE.MathUtils.clamp((b.traffic - 0.62) / (1.22 - 0.62), 0, 1)
      const distanceA = THREE.MathUtils.clamp((a.distanceKm - 350) / 9000, 0, 1)
      const distanceB = THREE.MathUtils.clamp((b.distanceKm - 350) / 9000, 0, 1)
      const scoreA = a.hub * 0.34 + a.altitude01 * 0.24 + distanceA * 0.22 + trafficA * 0.20
      const scoreB = b.hub * 0.34 + b.altitude01 * 0.24 + distanceB * 0.22 + trafficB * 0.20
      if (scoreA !== scoreB) return scoreB - scoreA
      return a.id - b.id
    })

    const group01 = THREE.MathUtils.clamp((routes.length - 1) / 8, 0, 1)
    for (let i = 0; i < routes.length; i++) {
      routes[i].corridorKeep01 = THREE.MathUtils.clamp(1 - i / Math.max(1, routes.length), 0, 1)
      routes[i].corridorGroup01 = group01
    }
  }
}

function countRouteMetadataSignals(route: Route) {
  let signals = route.sourceMode === 'enriched' ? 1 : 0
  if (route.airline.trim()) signals += 1
  if (route.callsign.trim()) signals += 1
  if (route.aircraftType.trim()) signals += 1
  if (route.registration.trim()) signals += 1
  return THREE.MathUtils.clamp(signals / 5, 0, 1)
}

function buildRouteImportanceScores(routeData: Route[]) {
  if (routeData.length === 0) return

  let maxTrafficCount = 1
  for (let i = 0; i < routeData.length; i++) {
    maxTrafficCount = Math.max(maxTrafficCount, routeData[i].trafficCount)
  }

  const rawScores = new Float32Array(routeData.length)
  let rawMin = Number.POSITIVE_INFINITY
  let rawMax = Number.NEGATIVE_INFINITY

  for (let i = 0; i < routeData.length; i++) {
    const route = routeData[i]
    const traffic01 = THREE.MathUtils.clamp((route.traffic - 0.68) / (1.34 - 0.68), 0, 1)
    const trafficCount01 = THREE.MathUtils.clamp(
      (route.trafficCount - 1) / Math.max(1, maxTrafficCount - 1),
      0,
      1
    )
    const distance01 = THREE.MathUtils.clamp((route.distanceKm - 350) / 9000, 0, 1)
    const corridorRep = THREE.MathUtils.clamp(
      route.corridorKeep01 * (0.62 + route.corridorGroup01 * 0.38),
      0,
      1
    )
    const metadata01 = countRouteMetadataSignals(route)
    const raw =
      route.hub * 0.19 +
      traffic01 * 0.22 +
      trafficCount01 * 0.08 +
      corridorRep * 0.18 +
      route.density01 * 0.14 +
      route.altitude01 * 0.07 +
      distance01 * 0.06 +
      metadata01 * 0.16

    rawScores[i] = raw
    rawMin = Math.min(rawMin, raw)
    rawMax = Math.max(rawMax, raw)
  }

  const span = rawMax - rawMin
  for (let i = 0; i < routeData.length; i++) {
    const normalized = span > 1e-6 ? (rawScores[i] - rawMin) / span : 0.5
    routeData[i].importance01 = THREE.MathUtils.clamp(Math.pow(normalized, 0.82), 0, 1)
  }
}

function applyRouteScoreBuffers(routeData: Route[], scores: RouteScoreBuffers) {
  const count = Math.min(
    routeData.length,
    scores.density.length,
    scores.corridorKeep.length,
    scores.corridorGroup.length,
    scores.importance.length
  )

  for (let i = 0; i < count; i++) {
    const route = routeData[i]
    route.density01 = scores.density[i]
    route.corridorKeep01 = scores.corridorKeep[i]
    route.corridorGroup01 = scores.corridorGroup[i]
    route.importance01 = scores.importance[i]
  }
}

function buildRouteScoresAsync(routeData: Route[], onReady: () => void) {
  if (routeData.length === 0) {
    onReady()
    return
  }

  const runFallback = () => {
    scheduleDeferredWork(() => {
      buildRouteDensityScores(routeData)
      buildRouteCorridorScores(routeData)
      buildRouteImportanceScores(routeData)
      onReady()
    }, 40)
  }

  scheduleDeferredWork(() => {
    if (typeof Worker === 'undefined') {
      runFallback()
      return
    }

    try {
      const stride = 19
      const packed = new Float32Array(routeData.length * stride)
      for (let i = 0; i < routeData.length; i++) {
        const route = routeData[i]
        const offset = i * stride
        packed[offset + 0] = route.p0x
        packed[offset + 1] = route.p0y
        packed[offset + 2] = route.p0z
        packed[offset + 3] = route.p1x
        packed[offset + 4] = route.p1y
        packed[offset + 5] = route.p1z
        packed[offset + 6] = route.p2x
        packed[offset + 7] = route.p2y
        packed[offset + 8] = route.p2z
        packed[offset + 9] = route.fromLat
        packed[offset + 10] = route.fromLon
        packed[offset + 11] = route.toLat
        packed[offset + 12] = route.toLon
        packed[offset + 13] = route.traffic
        packed[offset + 14] = route.trafficCount
        packed[offset + 15] = route.hub
        packed[offset + 16] = route.altitude01
        packed[offset + 17] = route.distanceKm
        packed[offset + 18] = countRouteMetadataSignals(route)
      }

      const worker = new Worker(new URL('../workers/flightScoresWorker.ts', import.meta.url), { type: 'module' })
      let handled = false

      const finish = () => {
        if (handled) return
        handled = true
        onReady()
      }

      worker.onmessage = (ev: MessageEvent<any>) => {
        const densityBuffer: ArrayBuffer | undefined = ev.data?.density
        const corridorKeepBuffer: ArrayBuffer | undefined = ev.data?.corridorKeep
        const corridorGroupBuffer: ArrayBuffer | undefined = ev.data?.corridorGroup
        const importanceBuffer: ArrayBuffer | undefined = ev.data?.importance

        if (densityBuffer && corridorKeepBuffer && corridorGroupBuffer && importanceBuffer) {
          applyRouteScoreBuffers(routeData, {
            density: new Float32Array(densityBuffer),
            corridorKeep: new Float32Array(corridorKeepBuffer),
            corridorGroup: new Float32Array(corridorGroupBuffer),
            importance: new Float32Array(importanceBuffer)
          })
          worker.terminate()
          finish()
          return
        } else {
          worker.terminate()
          if (handled) return
          handled = true
          runFallback()
          return
        }
      }

      worker.onerror = () => {
        worker.terminate()
        if (handled) return
        handled = true
        runFallback()
      }

      worker.postMessage({ routes: packed }, [packed.buffer])
    } catch {
      runFallback()
    }
  }, 110)
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371 // km
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function compactFlightToken(name: string) {
  const raw = String(name || '').trim().toUpperCase()
  if (!raw) return 'FLIGHT'

  const normalized = raw
    .replace(/\bINTERNATIONAL\b/g, '')
    .replace(/\bAIRPORT\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const collapsed = normalized.replace(/[^A-Z0-9]+/g, '')
  if (collapsed.length >= 3) {
    return collapsed.slice(0, 6)
  }

  const fallback = raw.replace(/[^A-Z0-9]+/g, '')
  return fallback.slice(0, 6) || 'FLIGHT'
}

function buildFlightName(fromName: string, toName: string) {
  return `${compactFlightToken(fromName)}-${compactFlightToken(toName)}`
}

function normalizeCountryKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCountryNameAliases(name: string) {
  const key = normalizeCountryKey(name)
  const out = new Set<string>([key])

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

  return [...out]
}

function hashString01(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function isEnrichedFlightSource(source: FlightRoutesSource): source is Exclude<FlightRoutesSource, Airport[]> {
  return !Array.isArray(source)
}

function isFiniteFlightRecord(flight: EnrichedFlightRecord) {
  const coords = [flight.olat, flight.olon, flight.dlat, flight.dlon].map(Number)
  return (
    coords.every(Number.isFinite) &&
    Math.abs(coords[0]) <= 90 &&
    Math.abs(coords[1]) <= 180 &&
    Math.abs(coords[2]) <= 90 &&
    Math.abs(coords[3]) <= 180
  )
}

function parseFlightTimeValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1e12 ? value : value * 1000
  }

  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const isoLikeMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/
  )
  if (isoLikeMatch) {
    const [, year, month, day, hour, minute, second = '0', fraction = '0'] = isoLikeMatch
    const milliseconds = Math.round(Number(`0.${fraction}`) * 1000)
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      milliseconds
    )
  }

  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function getFlightTakeoffTimeMs(flight: EnrichedFlightRecord) {
  const rawFlight = flight as EnrichedFlightRecord & Record<string, unknown>
  const candidates: unknown[] = [
    flight.takeoffTime,
    rawFlight.takeoff_time,
    rawFlight.departureTime,
    rawFlight.departure_time,
    rawFlight.startTime,
    rawFlight.start_time,
    Array.isArray(flight.segs) ? flight.segs[0]?.enter : undefined
  ]

  for (const value of candidates) {
    const parsed = parseFlightTimeValue(value)
    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function sortFlightsByTakeoffTime(flights: EnrichedFlightRecord[]) {
  return flights
    .map((flight, index) => ({
      flight,
      index,
      takeoffTimeMs: getFlightTakeoffTimeMs(flight)
    }))
    .sort((a, b) => {
      const timeA = a.takeoffTimeMs ?? Number.POSITIVE_INFINITY
      const timeB = b.takeoffTimeMs ?? Number.POSITIVE_INFINITY
      if (timeA !== timeB) return timeA - timeB
      return a.index - b.index
    })
    .map(({ flight }) => flight)
}

type FlightPathPoint = {
  lat: number
  lon: number
}

type FlightPathMetrics = {
  points: FlightPathPoint[]
  cumulativeKm: Float32Array
  totalKm: number
}

type RouteOverlapInfo = {
  slot: number
  count: number
}

function flightAirportKey(code: string | undefined, lat: number, lon: number, role: 'orig' | 'dest') {
  const normalized = String(code || '').trim().toUpperCase()
  if (normalized) return normalized
  return `${role}:${lat.toFixed(3)},${lon.toFixed(3)}`
}

function resolveAirportDisplayName(
  code: string | undefined,
  airportLookup?: Record<string, EnrichedAirportMeta> | null,
  fallback = 'Airport'
) {
  const normalized = String(code || '').trim().toUpperCase()
  const meta = normalized ? airportLookup?.[normalized] : null
  return String(meta?.name || normalized || fallback)
}

function normalizeWrappedLongitude(lon: number) {
  return THREE.MathUtils.euclideanModulo(lon + 180, 360) - 180
}

function unwrapLongitudeNear(lon: number, referenceLon: number) {
  let out = normalizeWrappedLongitude(lon)
  const delta = out - referenceLon
  if (delta > 180) out -= 360
  else if (delta < -180) out += 360
  return out
}

function interpolateFlightPathPoint(a: FlightPathPoint, b: FlightPathPoint, t: number): FlightPathPoint {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1)
  if (clampedT <= 1e-6) return { lat: a.lat, lon: normalizeWrappedLongitude(a.lon) }
  if (clampedT >= 1 - 1e-6) return { lat: b.lat, lon: normalizeWrappedLongitude(b.lon) }

  const aDir = latLongToVector3(a.lat, a.lon, 1).normalize()
  const bDir = latLongToVector3(b.lat, b.lon, 1).normalize()
  const dot = THREE.MathUtils.clamp(aDir.dot(bDir), -1, 1)

  if (dot > 0.9995 || dot < -0.9995) {
    const lerpedLon = a.lon + (b.lon - a.lon) * clampedT
    return {
      lat: THREE.MathUtils.lerp(a.lat, b.lat, clampedT),
      lon: normalizeWrappedLongitude(lerpedLon)
    }
  }

  const theta = Math.acos(dot)
  const sinTheta = Math.sin(theta)
  if (sinTheta < 1e-6) {
    const lerpedLon = a.lon + (b.lon - a.lon) * clampedT
    return {
      lat: THREE.MathUtils.lerp(a.lat, b.lat, clampedT),
      lon: normalizeWrappedLongitude(lerpedLon)
    }
  }

  const weightA = Math.sin((1 - clampedT) * theta) / sinTheta
  const weightB = Math.sin(clampedT * theta) / sinTheta
  const dir = aDir.multiplyScalar(weightA).addScaledVector(bDir, weightB).normalize()
  return vector3ToLatLon(dir)
}

function isFlightPathEndpointOutlier(
  endpoint: FlightPathPoint,
  neighbor: FlightPathPoint,
  reference: FlightPathPoint,
  airportLat: number,
  airportLon: number
) {
  const jumpKm = haversineKm(endpoint.lat, endpoint.lon, neighbor.lat, neighbor.lon)
  const neighborKm = haversineKm(neighbor.lat, neighbor.lon, reference.lat, reference.lon)
  const endpointToAirportKm = haversineKm(endpoint.lat, endpoint.lon, airportLat, airportLon)
  const neighborToAirportKm = haversineKm(neighbor.lat, neighbor.lon, airportLat, airportLon)

  const airportSnap =
    endpointToAirportKm <= 12 &&
    jumpKm > Math.max(25, neighborKm * 5) &&
    neighborToAirportKm > endpointToAirportKm + 12

  const wrongWayJump =
    jumpKm > Math.max(120, neighborKm * 6) &&
    endpointToAirportKm > neighborToAirportKm + 30

  return airportSnap || wrongWayJump
}

function trimFlightPathEndpointOutliers(
  points: FlightPathPoint[],
  airportLat: number,
  airportLon: number,
  atStart: boolean
) {
  while (points.length >= 3) {
    const endpoint = atStart ? points[0] : points[points.length - 1]
    const neighbor = atStart ? points[1] : points[points.length - 2]
    const reference = atStart ? points[2] : points[points.length - 3]
    if (!isFlightPathEndpointOutlier(endpoint, neighbor, reference, airportLat, airportLon)) break
    if (atStart) points.shift()
    else points.pop()
  }
}

function normalizeFlightPathPoints(flight: EnrichedFlightRecord) {
  const out: FlightPathPoint[] = []
  const path = flight.path
  if (!Array.isArray(path) || path.length < 2) return out

  for (let i = 0; i < path.length; i++) {
    const point = path[i]
    const rawLon = Number(point?.[0])
    const lat = Number(point?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(rawLon)) continue
    if (Math.abs(lat) > 90 || Math.abs(rawLon) > 180) continue

    const prev = out[out.length - 1]
    const lon = prev ? unwrapLongitudeNear(rawLon, prev.lon) : normalizeWrappedLongitude(rawLon)
    if (prev && Math.abs(prev.lat - lat) < 1e-6 && Math.abs(prev.lon - lon) < 1e-6) {
      continue
    }

    out.push({ lat, lon })
  }

  trimFlightPathEndpointOutliers(out, Number(flight.dlat), Number(flight.dlon), false)

  return out
}

function buildFlightPathMetrics(flight: EnrichedFlightRecord): FlightPathMetrics | null {
  const points = normalizeFlightPathPoints(flight)
  if (points.length < 2) return null

  const cumulativeKm = new Float32Array(points.length)
  let totalKm = 0
  for (let i = 1; i < points.length; i++) {
    totalKm += haversineKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
    cumulativeKm[i] = totalKm
  }

  return {
    points,
    cumulativeKm,
    totalKm
  }
}

function sampleFlightPathPoint(metrics: FlightPathMetrics | null, progress01: number) {
  if (!metrics || metrics.points.length === 0) return null
  if (metrics.points.length === 1 || metrics.totalKm <= 1e-3) {
    const point = metrics.points[Math.min(metrics.points.length - 1, Math.max(0, Math.round(progress01 * (metrics.points.length - 1))))]
    return { lat: point.lat, lon: normalizeWrappedLongitude(point.lon) }
  }

  const targetKm = THREE.MathUtils.clamp(progress01, 0, 1) * metrics.totalKm
  for (let i = 1; i < metrics.points.length; i++) {
    if (metrics.cumulativeKm[i] >= targetKm) {
      const segmentStartKm = metrics.cumulativeKm[i - 1]
      const segmentKm = metrics.cumulativeKm[i] - segmentStartKm
      const segmentT = segmentKm > 1e-6 ? (targetKm - segmentStartKm) / segmentKm : 1
      return interpolateFlightPathPoint(metrics.points[i - 1], metrics.points[i], segmentT)
    }
  }

  const last = metrics.points[metrics.points.length - 1]
  return { lat: last.lat, lon: normalizeWrappedLongitude(last.lon) }
}

function estimatePathProgress(
  flight: EnrichedFlightRecord,
  snapLat: number,
  snapLon: number,
  pathMetrics?: FlightPathMetrics | null
) {
  if (!Number.isFinite(snapLat) || !Number.isFinite(snapLon)) return null

  const metrics = pathMetrics ?? buildFlightPathMetrics(flight)
  if (!metrics || metrics.points.length < 2 || metrics.totalKm <= 1e-3) return null

  let bestProgress = 0
  let bestDist = Infinity

  for (let i = 1; i < metrics.points.length; i++) {
    const a = metrics.points[i - 1]
    const b = metrics.points[i]
    const segmentStartKm = metrics.cumulativeKm[i - 1]
    const segmentKm = metrics.cumulativeKm[i] - segmentStartKm

    let segmentT = 1
    if (segmentKm > 1e-6) {
      const lonCenter = (a.lon + b.lon) * 0.5
      const snapLonUnwrapped = unwrapLongitudeNear(snapLon, lonCenter)
      const meanLatRad = THREE.MathUtils.degToRad((a.lat + b.lat + snapLat) / 3)
      const cosLat = Math.max(0.15, Math.cos(meanLatRad))
      const ax = a.lon * cosLat
      const ay = a.lat
      const bx = b.lon * cosLat
      const by = b.lat
      const sx = snapLonUnwrapped * cosLat
      const sy = snapLat
      const dx = bx - ax
      const dy = by - ay
      const denom = dx * dx + dy * dy

      if (denom > 1e-8) {
        segmentT = THREE.MathUtils.clamp(((sx - ax) * dx + (sy - ay) * dy) / denom, 0, 1)
      }
    }

    const sample = interpolateFlightPathPoint(a, b, segmentT)
    const d = haversineKm(sample.lat, sample.lon, snapLat, snapLon)
    if (d < bestDist) {
      bestDist = d
      bestProgress = (segmentStartKm + segmentKm * segmentT) / metrics.totalKm
    }
  }

  return THREE.MathUtils.clamp(bestProgress, 0, 1)
}

function estimateFlightProgress(flight: EnrichedFlightRecord, pathMetrics?: FlightPathMetrics | null) {
  const pathProgress = estimatePathProgress(
    flight,
    Number(flight.snap_lat),
    Number(flight.snap_lon),
    pathMetrics
  )
  if (typeof pathProgress === 'number' && Number.isFinite(pathProgress)) {
    return THREE.MathUtils.clamp(pathProgress, 0.01, 0.99)
  }

  const totalKm = haversineKm(Number(flight.olat), Number(flight.olon), Number(flight.dlat), Number(flight.dlon))
  if (!Number.isFinite(totalKm) || totalKm <= 1e-3) return 0.0

  const snapLat = Number(flight.snap_lat)
  const snapLon = Number(flight.snap_lon)
  if (Number.isFinite(snapLat) && Number.isFinite(snapLon)) {
    const flownKm = haversineKm(Number(flight.olat), Number(flight.olon), snapLat, snapLon)
    return THREE.MathUtils.clamp(flownKm / totalKm, 0.01, 0.99)
  }

  return 0.0
}

function buildFlightStableKey(flight: EnrichedFlightRecord, fallbackIndex: number) {
  const snapLat = Number(flight.snap_lat)
  const snapLon = Number(flight.snap_lon)
  return [
    String(flight.id ?? ''),
    String(flight.cs ?? ''),
    String(flight.reg ?? ''),
    String(flight.type ?? ''),
    Number.isFinite(snapLat) ? snapLat.toFixed(4) : '',
    Number.isFinite(snapLon) ? snapLon.toFixed(4) : '',
    String(fallbackIndex).padStart(6, '0')
  ].join('|')
}

function buildRouteOverlapLookup(flights: EnrichedFlightRecord[]) {
  const grouped = new Map<string, Array<{ flight: EnrichedFlightRecord; sortKey: string }>>()

  for (let i = 0; i < flights.length; i++) {
    const flight = flights[i]
    const originKey = flightAirportKey(flight.orig, Number(flight.olat), Number(flight.olon), 'orig')
    const destKey = flightAirportKey(flight.dest, Number(flight.dlat), Number(flight.dlon), 'dest')
    const routeKey = `${originKey}>${destKey}`
    const entries = grouped.get(routeKey) ?? []
    entries.push({
      flight,
      sortKey: buildFlightStableKey(flight, i)
    })
    grouped.set(routeKey, entries)
  }

  const overlapLookup = new Map<EnrichedFlightRecord, RouteOverlapInfo>()
  for (const entries of grouped.values()) {
    entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    const center = (entries.length - 1) * 0.5
    for (let i = 0; i < entries.length; i++) {
      overlapLookup.set(entries[i].flight, {
        slot: i - center,
        count: entries.length
      })
    }
  }

  return overlapLookup
}

function buildControlDirection(
  p0Dir: THREE.Vector3,
  p2Dir: THREE.Vector3,
  pathMetrics: FlightPathMetrics | null,
  overlap: RouteOverlapInfo,
  distanceKm: number,
  seed: number
) {
  const defaultMidDir = p0Dir.clone().add(p2Dir)
  if (defaultMidDir.lengthSq() < 1e-6) {
    const axis = new THREE.Vector3(0, 1, 0).cross(p0Dir)
    if (axis.lengthSq() < 1e-6) {
      axis.set(1, 0, 0).cross(p0Dir)
    }
    axis.normalize()
    defaultMidDir.copy(p0Dir).applyAxisAngle(axis, Math.PI * 0.5).normalize()
  } else {
    defaultMidDir.normalize()
  }

  const controlDir = defaultMidDir.clone()
  if (pathMetrics) {
    const sampleProgresses = [0.32, 0.5, 0.68]
    const sampleWeights = [0.25, 0.5, 0.25]
    const blendedPathDir = new THREE.Vector3()

    for (let i = 0; i < sampleProgresses.length; i++) {
      const point = sampleFlightPathPoint(pathMetrics, sampleProgresses[i])
      if (!point) continue
      const pointDir = latLongToVector3(point.lat, point.lon, 1).normalize()
      blendedPathDir.addScaledVector(pointDir, sampleWeights[i])
    }

    if (blendedPathDir.lengthSq() > 1e-6) {
      blendedPathDir.normalize()

      // The enriched path only nudges the simplified quadratic arc.
      // If its derived midpoint points too far away from the geodesic midpoint,
      // the data is not trustworthy for this representation and creates long-side
      // detours / orbital-looking arcs. In that case, fall back to the default
      // globe-consistent midpoint.
      if (blendedPathDir.dot(defaultMidDir) >= 0.25) {
        controlDir.copy(blendedPathDir)
      }
    }
  }

  if (overlap.count <= 1 || Math.abs(overlap.slot) < 1e-6) {
    return controlDir
  }

  let lateral = p0Dir.clone().cross(p2Dir)
  lateral.addScaledVector(controlDir, -lateral.dot(controlDir))
  if (lateral.lengthSq() < 1e-8) {
    lateral = defaultMidDir.clone().cross(controlDir)
    lateral.addScaledVector(controlDir, -lateral.dot(controlDir))
  }
  if (lateral.lengthSq() < 1e-8) {
    lateral = new THREE.Vector3(0, 1, 0).cross(controlDir)
    lateral.addScaledVector(controlDir, -lateral.dot(controlDir))
  }
  if (lateral.lengthSq() < 1e-8) {
    lateral = new THREE.Vector3(1, 0, 0).cross(controlDir)
    lateral.addScaledVector(controlDir, -lateral.dot(controlDir))
  }
  if (lateral.lengthSq() < 1e-8) {
    return controlDir
  }

  lateral.normalize()

  const routeSpan01 = THREE.MathUtils.clamp((distanceKm - 250) / 9000, 0, 1)
  const stepAngleRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(0.55, 0.28, routeSpan01))
  const maxSpreadRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(2.4, 1.5, routeSpan01))
  const signedSpreadRad = THREE.MathUtils.clamp(overlap.slot * stepAngleRad, -maxSpreadRad, maxSpreadRad)

  // Keep same-route offsets deterministic and lightweight: separate only by a
  // small lateral tangent shift on the path-informed control direction.
  return controlDir
    .clone()
    .addScaledVector(lateral, Math.tan(signedSpreadRad) * (0.96 + seed * 0.08))
    .normalize()
}

function buildCountryIsoLookup(countriesGeoJSON: any) {
  const out = new Map<string, string>()
  for (const feature of countriesGeoJSON?.features ?? []) {
    const props = feature?.properties || {}
    const iso3Candidates = [props.ISO_A3, props.ADM0_A3, props.BRK_A3, props.SU_A3]
    const iso3 = iso3Candidates.find(
      (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value !== '-99'
    )
    if (!iso3) continue

    const names = [props.NAME_LONG, props.NAME_EN, props.ADMIN, props.NAME]
      .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)

    for (const name of names) {
      const aliases = getCountryNameAliases(name)
      for (const alias of aliases) {
        if (alias) out.set(alias, iso3)
      }
    }
  }
  return out
}

function buildCountryStatsByIso3(
  countryStats: Record<string, EnrichedCountryStats> | null | undefined,
  countriesGeoJSON: any
) {
  const out = new Map<string, EnrichedCountryStats>()
  if (!countryStats) return out

  const isoByName = buildCountryIsoLookup(countriesGeoJSON)
  for (const [countryName, stats] of Object.entries(countryStats)) {
    const aliases = getCountryNameAliases(countryName)
    const iso3 = aliases.map(alias => isoByName.get(alias)).find((value): value is string => typeof value === 'string' && value.length > 0)
    if (!iso3) continue
    out.set(iso3, stats || {})
  }

  return out
}

export function createFlightRoutes(
  source: FlightRoutesSource,
  radius: number,
  countriesGeoJSON: any | null,
  options: CreateFlightRoutesOptions | number = 180
): FlightRoutesLayer {
  const resolvedOptions: CreateFlightRoutesOptions =
    typeof options === 'number' ? { routeCount: options } : (options ?? {})
  const isEnrichedSource = isEnrichedFlightSource(source)
  const sourceFlights = isEnrichedSource
    ? sortFlightsByTakeoffTime(source.flights.filter(isFiniteFlightRecord))
    : []
  const defaultRouteCount = isEnrichedSource ? sourceFlights.length : 180
  const routeCount = isEnrichedSource
    ? THREE.MathUtils.clamp(
        Number.isFinite(Number(resolvedOptions.routeCount))
          ? Math.round(Number(resolvedOptions.routeCount))
          : defaultRouteCount,
        1,
        Math.max(1, sourceFlights.length)
      )
    : THREE.MathUtils.clamp(
        Number.isFinite(Number(resolvedOptions.routeCount)) ? Math.round(Number(resolvedOptions.routeCount)) : defaultRouteCount,
        20,
        2000
      )
  const planesPerRoute = THREE.MathUtils.clamp(
    Number.isFinite(Number(resolvedOptions.planesPerRoute))
      ? Math.round(Number(resolvedOptions.planesPerRoute))
      : (isEnrichedSource ? 1 : 3),
    1,
    8
  )
  const planeDensityScale = THREE.MathUtils.clamp(
    Number.isFinite(Number(resolvedOptions.planeDensityScale))
      ? Number(resolvedOptions.planeDensityScale)
      : (isEnrichedSource ? 1.0 : 0.74),
    0.2,
    2.5
  )
  const currentTimeSeconds = Number.isFinite(Number(resolvedOptions.currentTimeSeconds))
    ? Number(resolvedOptions.currentTimeSeconds)
    : 0
  const selectedEnrichedFlights = isEnrichedSource ? sourceFlights.slice(0, routeCount) : []
  const enrichedAirportLookup = isEnrichedSource ? source.airportLookup ?? null : null

  const group = new THREE.Group()
  group.name = 'flightRoutes'
  const TRAFFIC_LEVELS = isEnrichedSource ? 1 : planesPerRoute
  const PLANE_DENSITY_SCALE = planeDensityScale
  const SHOW_ROUTE_ENDPOINTS = false
  const SHOW_HOVER_ENDPOINTS = false
  const SHOW_ROUTE_PIN = false
  const SHOW_ROUTE_PLANES = true
  const SHOW_ROUTE_HUBS = false
  const AIRCRAFT_CRUISE_KMH_MIN = 720
  const AIRCRAFT_CRUISE_KMH_MAX = 900
  const AIRCRAFT_SIM_HOURS_PER_REAL_SECOND = 0.12
  const MIN_ROUTE_TRAVEL_SECONDS = 9
  const MAX_ROUTE_TRAVEL_SECONDS = 84
  // Keep route arcs visually rounded instead of visibly faceted when zoomed out.
  const LINE_SEGMENTS_COARSE = isEnrichedSource
    ? (routeCount > 14000 ? 12 : routeCount > 6000 ? 18 : 32)
    : 32
  const LINE_SEGMENTS_FINE = isEnrichedSource
    ? (routeCount > 14000 ? 32 : routeCount > 6000 ? 56 : 96)
    : 96
  const LINE_LOD_FINE_IN = 0.44
  const LINE_LOD_COARSE_OUT = 0.26
  const PLANE_BUILD_CHUNK_ROUTES = isEnrichedSource ? 720 : 240

  const routeData: Route[] = []
  const countryIsoLookup = buildCountryIsoLookup(countriesGeoJSON)
  const countryStatsByIso3 = buildCountryStatsByIso3(
    isEnrichedSource ? source.countryStats : null,
    countriesGeoJSON
  )

  function getISO3FromFeature(feature: any) {
    const props = feature?.properties || {}
    const candidates = [props.ISO_A3, props.ADM0_A3, props.BRK_A3, props.SU_A3]
    for (const value of candidates) {
      if (typeof value === 'string' && value && value !== '-99') {
        return value
      }
    }
    return ''
  }
  const hasCountryLookup = Boolean(countriesGeoJSON?.features?.length)
  let validAirports: Airport[] = []
  let airportDegree = new Int32Array(0)
  let maxDegree = 1
  let airportTraffic = new Float32Array(0)
  const airportIso3Cache = new Map<string, string>()
  const pathIso3Cache = new Map<string, string>()
  let routeBuildState: 'idle' | 'building' | 'ready' = isEnrichedSource ? 'idle' : 'ready'

  function getAirportIso3(lat: number, lon: number, code: string | undefined, role: 'orig' | 'dest') {
    if (!hasCountryLookup) return ''
    const key = flightAirportKey(code, lat, lon, role)
    const cached = airportIso3Cache.get(key)
    if (typeof cached === 'string') return cached
    const feature = findCountryFeature(countriesGeoJSON, lat, lon)
    const iso3 = feature ? getISO3FromFeature(feature) : ''
    airportIso3Cache.set(key, iso3)
    return iso3
  }

  function getCountryNameIso3(countryName: string) {
    const aliases = getCountryNameAliases(countryName)
    return aliases
      .map(alias => countryIsoLookup.get(alias))
      .find((value): value is string => typeof value === 'string' && value.length > 0) ?? ''
  }

  function getPathPointIso3(lat: number, lon: number) {
    if (!hasCountryLookup) return ''
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
    const cached = pathIso3Cache.get(key)
    if (typeof cached === 'string') return cached
    const feature = findCountryFeature(countriesGeoJSON, lat, lon)
    const iso3 = feature ? getISO3FromFeature(feature) : ''
    pathIso3Cache.set(key, iso3)
    return iso3
  }

  function collectFlightCountryIso3List(
    flight: EnrichedFlightRecord,
    originIso3: string,
    destIso3: string
  ) {
    const seen = new Set<string>()
    if (originIso3) seen.add(originIso3)
    if (destIso3) seen.add(destIso3)

    const segs = Array.isArray(flight.segs) ? flight.segs : []
    let usedSegs = false
    for (let i = 0; i < segs.length; i++) {
      const iso3 = getCountryNameIso3(String(segs[i]?.country || ''))
      if (iso3) {
        seen.add(iso3)
        usedSegs = true
      }
    }

    if (!usedSegs) {
      const path = Array.isArray(flight.path) ? flight.path : []
      if (path.length > 0) {
        const step = Math.max(1, Math.floor(path.length / 24))
        for (let i = 0; i < path.length; i += step) {
          const point = path[i]
          const lon = Number(point?.[0])
          const lat = Number(point?.[1])
          const iso3 = getPathPointIso3(lat, lon)
          if (iso3) seen.add(iso3)
        }

        const last = path[path.length - 1]
        const lastIso3 = getPathPointIso3(Number(last?.[1]), Number(last?.[0]))
        if (lastIso3) seen.add(lastIso3)
      }

      const snapIso3 = getPathPointIso3(Number(flight.snap_lat), Number(flight.snap_lon))
      if (snapIso3) seen.add(snapIso3)
    }

    return [...seen]
  }

  if (isEnrichedSource) {
  } else {
    const { valid, routes } = pickRouteIndices(source, routeCount)
    validAirports = valid

    airportDegree = new Int32Array(valid.length)
    for (let i = 0; i < routes.length; i++) {
      const [ia, ib] = routes[i]
      airportDegree[ia]++
      airportDegree[ib]++
    }
    for (let i = 0; i < airportDegree.length; i++) maxDegree = Math.max(maxDegree, airportDegree[i])
    airportTraffic = new Float32Array(valid.length)

    const airportIso3: string[] = new Array(valid.length).fill('')
    if (hasCountryLookup) {
      for (let i = 0; i < valid.length; i++) {
        const a = valid[i]
        const feature = findCountryFeature(countriesGeoJSON, Number(a.latitude), Number(a.longitude))
        airportIso3[i] = feature ? getISO3FromFeature(feature) : ''
      }
    }

    for (const [ia, ib] of routes) {
      const a = valid[ia]
      const b = valid[ib]
      if (!a || !b) continue

      const p0 = latLongToVector3(Number(a.latitude), Number(a.longitude), radius * 1.01)
      const p2 = latLongToVector3(Number(b.latitude), Number(b.longitude), radius * 1.01)
      const p0Dir = p0.clone().normalize()
      const p2Dir = p2.clone().normalize()

      const phase = Math.random()
      const seed = Math.random()

      const chord = p0.distanceTo(p2)
      const arcBoost = THREE.MathUtils.clamp(chord / (radius * 1.35), 0.25, 1.25)
      const midDir = p0Dir.clone().add(p2Dir)
      if (midDir.lengthSq() < 1e-6) {
        const axis = new THREE.Vector3(0, 1, 0).cross(p0Dir)
        if (axis.lengthSq() < 1e-6) {
          axis.set(1, 0, 0).cross(p0Dir)
        }
        axis.normalize()
        const sign = seed < 0.5 ? 1 : -1
        midDir.copy(p0Dir).applyAxisAngle(axis, sign * Math.PI * 0.5).normalize()
      } else {
        midDir.normalize()
      }

      const distanceKm = haversineKm(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude))
      const arcHeight = buildRouteArcHeight(radius, distanceKm)
      const controlPoint = buildBezierControlPoint(p0Dir, p2Dir, midDir, radius, arcBoost, arcHeight)
      const lateralOffsetRad = 0
      const loopSweepRad = buildRouteLoopSweepRad(distanceKm)
      const altitude01 = THREE.MathUtils.clamp((arcBoost - 0.25) / (1.25 - 0.25), 0, 1)
      const routeSpan01 = THREE.MathUtils.clamp((distanceKm - 400) / 9000, 0, 1)
      const cruiseKmhBase = THREE.MathUtils.lerp(AIRCRAFT_CRUISE_KMH_MIN, AIRCRAFT_CRUISE_KMH_MAX, routeSpan01)
      const cruiseKmh = cruiseKmhBase * THREE.MathUtils.lerp(0.96, 1.04, seed)
      const visualDistanceKm = distanceKm * (1.02 + (arcHeight / Math.max(1e-6, radius)) * 0.42)
      const travelSeconds = THREE.MathUtils.clamp(
        visualDistanceKm / Math.max(1e-3, cruiseKmh * AIRCRAFT_SIM_HOURS_PER_REAL_SECOND),
        MIN_ROUTE_TRAVEL_SECONDS,
        MAX_ROUTE_TRAVEL_SECONDS
      )

      const speed = 1 / travelSeconds
      const size = 3.1 + arcBoost * 1.25
      const dir = seed < 0.5 ? 1 : -1
      const trafficBase = THREE.MathUtils.clamp((arcBoost - 0.25) / 1.0, 0, 1)
      const traffic = THREE.MathUtils.clamp(0.68 + trafficBase * 0.72 + (seed - 0.5) * 0.14, 0.68, 1.34)
      const traffic01 = THREE.MathUtils.clamp((traffic - 0.68) / (1.34 - 0.68), 0, 0.9999)
      const trafficCount = 1 + Math.floor(traffic01 * TRAFFIC_LEVELS)
      const hub = THREE.MathUtils.clamp((airportDegree[ia] + airportDegree[ib]) / (2 * maxDegree), 0, 1)

      airportTraffic[ia] += trafficCount * traffic
      airportTraffic[ib] += trafficCount * traffic

      routeData.push({
        id: routeData.length,
        p0x: p0.x,
        p0y: p0.y,
        p0z: p0.z,
        p1x: controlPoint.x,
        p1y: controlPoint.y,
        p1z: controlPoint.z,
        p2x: p2.x,
        p2y: p2.y,
        p2z: p2.z,
        speed,
        phase,
        seed,
        size,
        dir,
        traffic,
        trafficCount,
        hub,
        density01: 0,
        corridorKeep01: 1,
        corridorGroup01: 0,
        importance01: 0,
        arcHeight,
        lateralOffsetRad,
        loopSweepRad,
        altitude01,
        distanceKm,
        flightName: buildFlightName(String(a.name || 'Origin'), String(b.name || 'Destination')),
        fromName: String(a.name || 'Origin'),
        toName: String(b.name || 'Destination'),
        fromLat: Number(a.latitude),
        fromLon: Number(a.longitude),
        toLat: Number(b.latitude),
        toLon: Number(b.longitude),
        isoA3: airportIso3[ia] ?? '',
        isoB3: airportIso3[ib] ?? '',
        countryIso3List: [airportIso3[ia], airportIso3[ib]].filter((value): value is string => Boolean(value)),
        callsign: '',
        airline: '',
        aircraftType: '',
        registration: '',
        sourceMode: 'synthetic'
      })
    }
  }

  function startEnrichedRouteDataBuild(onReady: () => void) {
    if (!isEnrichedSource || routeBuildState !== 'idle') return
    routeBuildState = 'building'

    const routeOverlapLookup = new Map<EnrichedFlightRecord, RouteOverlapInfo>()
    const airportDegreeMap = new Map<string, number>()
    const ROUTE_DEGREE_CHUNK = 1200
    const ROUTE_BUILD_CHUNK = 18
    let nextDegreeIndex = 0
    let nextRouteIndex = 0

    const buildRouteChunk = (deadline?: IdleDeadline) => {
      const chunkDeadline = deadline ? Math.max(1.5, deadline.timeRemaining()) : 4.5
      const chunkStart = typeof performance !== 'undefined' ? performance.now() : 0
      let processedRoutes = 0

      while (nextRouteIndex < selectedEnrichedFlights.length) {
        const flight = selectedEnrichedFlights[nextRouteIndex]
        const fromLat = Number(flight.olat)
        const fromLon = Number(flight.olon)
        const toLat = Number(flight.dlat)
        const toLon = Number(flight.dlon)
        const pathMetrics = buildFlightPathMetrics(flight)
        const p0 = latLongToVector3(fromLat, fromLon, radius * 1.01)
        const p2 = latLongToVector3(toLat, toLon, radius * 1.01)
        const p0Dir = p0.clone().normalize()
        const p2Dir = p2.clone().normalize()

        const seed = hashString01(
          `${String(flight.id ?? nextRouteIndex)}|${String(flight.cs || '')}|${String(flight.orig || '')}|${String(flight.dest || '')}`
        )
        const chord = p0.distanceTo(p2)
        const arcBoost = THREE.MathUtils.clamp(chord / (radius * 1.35), 0.25, 1.25)
        const distanceKm = haversineKm(fromLat, fromLon, toLat, toLon)
        const overlap = routeOverlapLookup.get(flight) ?? { slot: 0, count: 1 }
        const arcHeight = buildRouteArcHeight(radius, distanceKm)
        const hintDir = buildControlDirection(p0Dir, p2Dir, pathMetrics, overlap, distanceKm, seed)
        const controlPoint = buildBezierControlPoint(p0Dir, p2Dir, hintDir, radius, arcBoost, arcHeight)
        const lateralOffsetRad = buildRouteLateralOffsetRad(overlap, distanceKm)
        const loopSweepRad = buildRouteLoopSweepRad(distanceKm)
        const altitude01 = THREE.MathUtils.clamp((arcBoost - 0.25) / (1.25 - 0.25), 0, 1)
        const routeSpan01 = THREE.MathUtils.clamp((distanceKm - 400) / 9000, 0, 1)
        const cruiseKmhBase = THREE.MathUtils.lerp(AIRCRAFT_CRUISE_KMH_MIN, AIRCRAFT_CRUISE_KMH_MAX, routeSpan01)
        const cruiseKmh = cruiseKmhBase * THREE.MathUtils.lerp(0.98, 1.02, seed)
        const visualDistanceKm = distanceKm * (1.02 + (arcHeight / Math.max(1e-6, radius)) * 0.42)
        const travelSeconds = THREE.MathUtils.clamp(
          visualDistanceKm / Math.max(1e-3, cruiseKmh * AIRCRAFT_SIM_HOURS_PER_REAL_SECOND),
          MIN_ROUTE_TRAVEL_SECONDS,
          MAX_ROUTE_TRAVEL_SECONDS
        )
        const speed = 1 / travelSeconds
        const progress = estimateFlightProgress(flight, pathMetrics)
        const phase = ((progress - currentTimeSeconds * speed) % 1 + 1) % 1
        const originKey = flightAirportKey(flight.orig, fromLat, fromLon, 'orig')
        const destKey = flightAirportKey(flight.dest, toLat, toLon, 'dest')
        const hub = THREE.MathUtils.clamp(
          ((airportDegreeMap.get(originKey) ?? 1) + (airportDegreeMap.get(destKey) ?? 1)) / (2 * maxDegree),
          0,
          1
        )
        const flightName = String(flight.cs || `${String(flight.orig || 'ORIG')}-${String(flight.dest || 'DEST')}`)
        const originIso3 = getAirportIso3(fromLat, fromLon, flight.orig, 'orig')
        const destIso3 = getAirportIso3(toLat, toLon, flight.dest, 'dest')
        const countryIso3List = collectFlightCountryIso3List(flight, originIso3, destIso3)

        routeData.push({
          id: routeData.length,
          p0x: p0.x,
          p0y: p0.y,
          p0z: p0.z,
          p1x: controlPoint.x,
          p1y: controlPoint.y,
          p1z: controlPoint.z,
          p2x: p2.x,
          p2y: p2.y,
          p2z: p2.z,
          speed,
          phase,
          seed,
          size: 2.35 + arcBoost * 0.7,
          dir: 1,
          traffic: 1.0,
          trafficCount: 1,
          hub,
          density01: 0,
          corridorKeep01: 1,
          corridorGroup01: 0,
          importance01: 0,
          arcHeight,
          lateralOffsetRad,
          loopSweepRad,
          altitude01,
          distanceKm,
          flightName,
          fromName: resolveAirportDisplayName(flight.orig, enrichedAirportLookup, 'Origin'),
          toName: resolveAirportDisplayName(flight.dest, enrichedAirportLookup, 'Destination'),
          fromLat,
          fromLon,
          toLat,
          toLon,
          isoA3: originIso3,
          isoB3: destIso3,
          countryIso3List,
          callsign: String(flight.cs || ''),
          airline: String(flight.air || ''),
          aircraftType: String(flight.type || ''),
          registration: String(flight.reg || ''),
          sourceMode: 'enriched'
        })

        nextRouteIndex += 1
        processedRoutes += 1

        const timeSpent =
          typeof performance !== 'undefined' ? performance.now() - chunkStart : processedRoutes
        if (
          processedRoutes >= ROUTE_BUILD_CHUNK ||
          timeSpent >= chunkDeadline ||
          (deadline && deadline.timeRemaining() < 1.5)
        ) {
          break
        }
      }

      if (nextRouteIndex < selectedEnrichedFlights.length) {
        commitIncrementalFlightBootstrap(nextRouteIndex)
        scheduleDeferredWork(buildRouteChunk)
        return
      }

      commitIncrementalFlightBootstrap(nextRouteIndex)
      onReady()
    }

    const buildDegreeChunk = (deadline?: IdleDeadline) => {
      const chunkDeadline = deadline ? Math.max(1.25, deadline.timeRemaining()) : 4
      const chunkStart = typeof performance !== 'undefined' ? performance.now() : 0
      let processed = 0

      while (nextDegreeIndex < selectedEnrichedFlights.length) {
        const flight = selectedEnrichedFlights[nextDegreeIndex]
        const originKey = flightAirportKey(flight.orig, Number(flight.olat), Number(flight.olon), 'orig')
        const destKey = flightAirportKey(flight.dest, Number(flight.dlat), Number(flight.dlon), 'dest')
        airportDegreeMap.set(originKey, (airportDegreeMap.get(originKey) ?? 0) + 1)
        airportDegreeMap.set(destKey, (airportDegreeMap.get(destKey) ?? 0) + 1)
        nextDegreeIndex += 1
        processed += 1

        const timeSpent = typeof performance !== 'undefined' ? performance.now() - chunkStart : processed
        if (
          processed >= ROUTE_DEGREE_CHUNK ||
          timeSpent >= chunkDeadline ||
          (deadline && deadline.timeRemaining() < 1.25)
        ) {
          break
        }
      }

      if (nextDegreeIndex < selectedEnrichedFlights.length) {
        scheduleDeferredWork(buildDegreeChunk)
        return
      }

      maxDegree = 1
      for (const value of airportDegreeMap.values()) {
        maxDegree = Math.max(maxDegree, value)
      }
      scheduleDeferredWork(buildRouteChunk, 20)
    }

    scheduleDeferredWork(() => {
      const overlapLookup = buildRouteOverlapLookup(selectedEnrichedFlights)
      for (const [flight, overlap] of overlapLookup.entries()) {
        routeOverlapLookup.set(flight, overlap)
      }
      scheduleDeferredWork(buildDegreeChunk, 20)
    }, 40)
  }

  // ---------------------------
  // Airport hubs (subtle, Google-style)
  // ---------------------------
  let hubsPoints: THREE.Points | null = null
  let hubsMat: THREE.ShaderMaterial | null = null
  if (SHOW_ROUTE_HUBS) {
    let maxTraffic = 1e-6
    for (let i = 0; i < airportTraffic.length; i++) maxTraffic = Math.max(maxTraffic, airportTraffic[i])

    const scored: Array<{ idx: number; score: number; deg01: number; traf01: number }> = []
    for (let i = 0; i < validAirports.length; i++) {
      const deg = airportDegree[i]
      if (deg <= 0) continue
      const deg01 = THREE.MathUtils.clamp(deg / maxDegree, 0, 1)
      const traf01 = THREE.MathUtils.clamp(airportTraffic[i] / maxTraffic, 0, 1)
      const score = deg01 * 0.62 + traf01 * 0.38
      scored.push({ idx: i, score, deg01, traf01 })
    }
    scored.sort((a, b) => b.score - a.score)
    const HUB_COUNT = Math.min(140, Math.max(40, Math.floor(Math.sqrt(routeData.length) * 8)))
    const hubs = scored.slice(0, HUB_COUNT)

    const hubPositions = new Float32Array(hubs.length * 3)
    const hubColors = new Float32Array(hubs.length * 3)
    const hubSizes = new Float32Array(hubs.length)
    const hubSeeds = new Float32Array(hubs.length)

    const col = new THREE.Color()
    for (let i = 0; i < hubs.length; i++) {
      const h = hubs[i]
      const a = validAirports[h.idx]
      const lat = Number(a.latitude)
      const lon = Number(a.longitude)
      const v = latLongToVector3(lat, lon, radius * 1.012)

      hubPositions[i * 3 + 0] = v.x
      hubPositions[i * 3 + 1] = v.y
      hubPositions[i * 3 + 2] = v.z

      // Slightly whiter for stronger hubs, but keep the golden palette.
      const w = THREE.MathUtils.clamp(h.score, 0, 1)
      col.copy(GOOGLE_COLORS.yellow).lerp(GOOGLE_COLORS.white, 0.35 + w * 0.55)
      col.multiplyScalar(0.55 + w * 0.55)
      hubColors[i * 3 + 0] = col.r
      hubColors[i * 3 + 1] = col.g
      hubColors[i * 3 + 2] = col.b

      hubSizes[i] = 3.8 + w * 5.8
      hubSeeds[i] = Math.random()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(hubPositions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(hubColors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(hubSizes, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(hubSeeds, 1))
    geo.computeBoundingSphere()

    hubsMat = new THREE.ShaderMaterial({
      vertexShader: pointsVert,
      fragmentShader: pointsFrag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: {
        uTime: { value: 0 },
        uCameraDistance: { value: 25 },
        uColorMul: { value: GOOGLE_COLORS.yellow.clone() },
        uAlphaMul: { value: 0.9 },
        uFlowSpeed: { value: 0.054 },
        uFlowWidth: { value: 0.18 },
        uFlowStrength: { value: 0.72 },
        uFlowColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.16) },
        uFlowDir: { value: new THREE.Vector3(0.74, 0.18, 0.65).normalize() },
        uFlowScale: { value: 0.16 },
        uSizeMul: { value: scaleThickness(1.0) },
        uRevealProgress: { value: 0.0 }
      }
    })

    hubsPoints = new THREE.Points(geo, hubsMat)
    hubsPoints.name = 'airportHubs'
    hubsPoints.renderOrder = 4.2
    hubsPoints.frustumCulled = false
    group.add(hubsPoints)
  }

  // ---------------------------
  // Heatmap (route proximity / density)
  // ---------------------------
  const heatTexture = buildFlightHeatmapTextureAsync(routeData, 512, 256)
  const heatGeo = new THREE.SphereGeometry(radius * 1.001, 96, 64)
  const heatMat = new THREE.ShaderMaterial({
    vertexShader: flightHeatmapVert,
    fragmentShader: flightHeatmapFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uHeat: { value: heatTexture },
      uTime: { value: 0 },
      uCameraDistance: { value: 25 },
      uOpacity: { value: 0.18 },
      // Keep it clean, but let a bit more of the mid-density show through.
      uThreshold: { value: 0.085 },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 256) },
      uEdgeStrength: { value: 0.85 },
      uColdColor: { value: GOOGLE_COLORS.deepBlue.clone().multiplyScalar(0.34) },
      uMidColor: { value: GOOGLE_COLORS.lightBlue.clone().multiplyScalar(1.02) },
      uHotColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.32) },
      uEdgeAccentColor: { value: GOOGLE_COLORS.white.clone() }
    }
  })
  const heatmap = new THREE.Mesh(heatGeo, heatMat)
  heatmap.name = 'flightHeatmap'
  heatmap.renderOrder = 1.5
  heatmap.frustumCulled = false
  heatmap.visible = false
  group.add(heatmap)

  // ---------------------------
  // Lines (batch in 1 draw call)
  // ---------------------------
  type LineLodGeometry = {
    geometry: THREE.BufferGeometry
    positionAttr: THREE.BufferAttribute
    positionData: Float32Array
    anim0Attr: THREE.BufferAttribute
    anim0Data: Float32Array
    focusAttr: THREE.BufferAttribute
    focusData: Float32Array
    hubAttr: THREE.BufferAttribute
    hubData: Float32Array
    altitudeAttr: THREE.BufferAttribute
    altitudeData: Float32Array
    densityAttr: THREE.BufferAttribute
    densityData: Float32Array
    corridorKeepAttr: THREE.BufferAttribute
    corridorKeepData: Float32Array
    corridorGroupAttr: THREE.BufferAttribute
    corridorGroupData: Float32Array
    vertexCount: number
    verticesPerRoute: number
    routeCapacity: number
    committedRouteCount: number
  }

  function markLineAttributeRange(attr: THREE.BufferAttribute, startVertex: number, vertexCount: number) {
    if (vertexCount <= 0) return
    if (typeof (attr as any).clearUpdateRanges === 'function') {
      ;(attr as any).clearUpdateRanges()
    }
    if (typeof (attr as any).addUpdateRange === 'function') {
      ;(attr as any).addUpdateRange(startVertex * attr.itemSize, vertexCount * attr.itemSize)
    }
    attr.needsUpdate = true
  }

  function populateLineLodRoutes(
    lod: LineLodGeometry,
    routeStartIndex: number,
    routeEndIndex: number,
    focusIso3Value = ''
  ) {
    const safeEndIndex = Math.min(routeEndIndex, routeData.length, lod.routeCapacity)
    if (safeEndIndex <= routeStartIndex) return

    for (let rIndex = routeStartIndex; rIndex < safeEndIndex; rIndex++) {
      const r = routeData[rIndex]
      const routeSamples = buildRouteSamplePositions(r, lod.verticesPerRoute * 0.5)
      const baseVertex = rIndex * lod.verticesPerRoute
      const focusHit = !focusIso3Value || r.countryIso3List.includes(focusIso3Value) ? 1 : 0

      for (let i = 0; i < lod.verticesPerRoute * 0.5; i++) {
        const t0 = i / (lod.verticesPerRoute * 0.5)
        const t1 = (i + 1) / (lod.verticesPerRoute * 0.5)
        const s0 = i * 3
        const s1 = (i + 1) * 3

        const vi0 = baseVertex + i * 2
        const vi1 = vi0 + 1

        lod.positionData[vi0 * 3 + 0] = routeSamples[s0 + 0]
        lod.positionData[vi0 * 3 + 1] = routeSamples[s0 + 1]
        lod.positionData[vi0 * 3 + 2] = routeSamples[s0 + 2]
        const lo0 = vi0 * 4
        lod.anim0Data[lo0 + 0] = t0
        lod.anim0Data[lo0 + 1] = r.speed
        lod.anim0Data[lo0 + 2] = r.phase
        lod.anim0Data[lo0 + 3] = r.seed
        lod.focusData[lo0 + 0] = r.traffic
        lod.focusData[lo0 + 1] = focusHit
        lod.focusData[lo0 + 2] = r.id
        lod.focusData[lo0 + 3] = r.dir
        lod.hubData[vi0] = r.hub
        lod.altitudeData[vi0] = r.altitude01
        lod.densityData[vi0] = r.density01
        lod.corridorKeepData[vi0] = r.corridorKeep01
        lod.corridorGroupData[vi0] = r.corridorGroup01

        lod.positionData[vi1 * 3 + 0] = routeSamples[s1 + 0]
        lod.positionData[vi1 * 3 + 1] = routeSamples[s1 + 1]
        lod.positionData[vi1 * 3 + 2] = routeSamples[s1 + 2]
        const lo1 = vi1 * 4
        lod.anim0Data[lo1 + 0] = t1
        lod.anim0Data[lo1 + 1] = r.speed
        lod.anim0Data[lo1 + 2] = r.phase
        lod.anim0Data[lo1 + 3] = r.seed
        lod.focusData[lo1 + 0] = r.traffic
        lod.focusData[lo1 + 1] = focusHit
        lod.focusData[lo1 + 2] = r.id
        lod.focusData[lo1 + 3] = r.dir
        lod.hubData[vi1] = r.hub
        lod.altitudeData[vi1] = r.altitude01
        lod.densityData[vi1] = r.density01
        lod.corridorKeepData[vi1] = r.corridorKeep01
        lod.corridorGroupData[vi1] = r.corridorGroup01
      }
    }

    const startVertex = routeStartIndex * lod.verticesPerRoute
    const vertexCount = (safeEndIndex - routeStartIndex) * lod.verticesPerRoute
    markLineAttributeRange(lod.positionAttr, startVertex, vertexCount)
    markLineAttributeRange(lod.anim0Attr, startVertex, vertexCount)
    markLineAttributeRange(lod.focusAttr, startVertex, vertexCount)
    markLineAttributeRange(lod.hubAttr, startVertex, vertexCount)
    markLineAttributeRange(lod.altitudeAttr, startVertex, vertexCount)
    markLineAttributeRange(lod.densityAttr, startVertex, vertexCount)
    markLineAttributeRange(lod.corridorKeepAttr, startVertex, vertexCount)
    markLineAttributeRange(lod.corridorGroupAttr, startVertex, vertexCount)

    lod.committedRouteCount = safeEndIndex
    lod.geometry.setDrawRange(0, safeEndIndex * lod.verticesPerRoute)
  }

  function buildLineLodGeometry(
    segmentsPerRoute: number,
    routeCapacity = routeData.length,
    initialRouteCount = routeData.length
  ): LineLodGeometry {
    const safeRouteCapacity = Math.max(routeCapacity, initialRouteCount, 1)
    const lineVertexCount = safeRouteCapacity * segmentsPerRoute * 2
    const linePositions = new Float32Array(lineVertexCount * 3)
    const lineAnim0 = new Float32Array(lineVertexCount * 4) // t, speed, phase, seed
    const lineAnim1 = new Float32Array(lineVertexCount * 4) // traffic, focus, routeId, dir
    const lineHub = new Float32Array(lineVertexCount)
    const lineAltitude = new Float32Array(lineVertexCount)
    const lineDensity = new Float32Array(lineVertexCount)
    const lineCorridorKeep = new Float32Array(lineVertexCount)
    const lineCorridorGroup = new Float32Array(lineVertexCount)

    const geo = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(linePositions, 3)
    positionAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', positionAttr)
    const anim0Attr = new THREE.BufferAttribute(lineAnim0, 4)
    anim0Attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aAnim0', anim0Attr)
    const anim1Attr = new THREE.BufferAttribute(lineAnim1, 4)
    anim1Attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aAnim1', anim1Attr)
    const hubAttr = new THREE.BufferAttribute(lineHub, 1)
    hubAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aHub', hubAttr)
    const altitudeAttr = new THREE.BufferAttribute(lineAltitude, 1)
    altitudeAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aAltitude', altitudeAttr)
    const densityAttr = new THREE.BufferAttribute(lineDensity, 1)
    densityAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aDensity', densityAttr)
    const corridorKeepAttr = new THREE.BufferAttribute(lineCorridorKeep, 1)
    corridorKeepAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aCorridorKeep', corridorKeepAttr)
    const corridorGroupAttr = new THREE.BufferAttribute(lineCorridorGroup, 1)
    corridorGroupAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aCorridorGroup', corridorGroupAttr)
    geo.setDrawRange(0, 0)
    geo.computeBoundingSphere()

    const lod: LineLodGeometry = {
      geometry: geo,
      positionAttr,
      positionData: linePositions,
      anim0Attr,
      anim0Data: lineAnim0,
      focusAttr: anim1Attr,
      focusData: lineAnim1,
      hubAttr,
      hubData: lineHub,
      altitudeAttr,
      altitudeData: lineAltitude,
      densityAttr,
      densityData: lineDensity,
      corridorKeepAttr,
      corridorKeepData: lineCorridorKeep,
      corridorGroupAttr,
      corridorGroupData: lineCorridorGroup,
      vertexCount: lineVertexCount,
      verticesPerRoute: segmentsPerRoute * 2,
      routeCapacity: safeRouteCapacity,
      committedRouteCount: 0
    }

    if (initialRouteCount > 0) {
      populateLineLodRoutes(lod, 0, initialRouteCount)
    }

    return lod
  }

  let lineCoarse = buildLineLodGeometry(
    LINE_SEGMENTS_COARSE,
    isEnrichedSource ? selectedEnrichedFlights.length : routeData.length,
    routeData.length
  )
  let lineFine: LineLodGeometry | null = null
  const lineLods: LineLodGeometry[] = [lineCoarse]
  let activeLineLod: 'coarse' | 'fine' = 'coarse'
  let lineFineBuildState: 'idle' | 'building' | 'ready' = 'idle'
  let routeScoresBuildState: 'idle' | 'building' | 'ready' = 'idle'
  const startupRouteCount = Math.max(1, isEnrichedSource ? routeCount : routeData.length)
  const airportStartupDelaySeconds = 0.18
  const flightStartupDelaySeconds = 0.42
  const lineRevealDurationSeconds = THREE.MathUtils.clamp(
    1.15 + Math.log10(startupRouteCount + 10) * 0.48,
    1.35,
    2.4
  )
  const planeStartupDelaySeconds = flightStartupDelaySeconds + 0.42
  let flightStartupElapsedSeconds = 0
  let flightStartupActive = false

  const lineMat = new THREE.ShaderMaterial({
    vertexShader: flightLinesVert,
    fragmentShader: flightLinesFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCameraDistance: { value: 25 },
      uHeadColor: { value: GOOGLE_COLORS.white.clone() },
      uTailColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.16) },
      uBaseColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.28) },
      uAccentColor: { value: GOOGLE_COLORS.white.clone() },
      uBaseAlpha: { value: 0.092 },
      uGlowAlpha: { value: 0.70 },
      uTailLength: { value: 0.26 },
      uHeadWidth: { value: 0.034 },
      uFocusMix: { value: 0.0 },
      uRouteKeep: { value: 1.0 },
      uAltitudeLodMix: { value: 1.0 },
      uRepresentationMix: { value: 0.0 },
      uStartupReveal: { value: 0.0 },
      uStartupFade: { value: 0.0 },
      uHoverRouteId: { value: -999 },
      uHoverMix: { value: 0.0 },
      uSelectedRouteId: { value: -999 },
      uSelectedMix: { value: 0.0 }
    }
  })

  const lines = new THREE.LineSegments(lineCoarse.geometry, lineMat)
  lines.renderOrder = 5
  lines.frustumCulled = false
  group.add(lines)

  function commitLineGeometryProgress(committedRouteCount: number) {
    const clampedRouteCount = THREE.MathUtils.clamp(committedRouteCount, 0, Math.min(routeData.length, lineCoarse.routeCapacity))
    if (clampedRouteCount <= lineCoarse.committedRouteCount) return
    populateLineLodRoutes(lineCoarse, lineCoarse.committedRouteCount, clampedRouteCount, focusIso3)
  }

  function syncLineScoreAttributes(lod: LineLodGeometry) {
    for (let routeIndex = 0; routeIndex < routeData.length; routeIndex++) {
      const route = routeData[routeIndex]
      const base = routeIndex * lod.verticesPerRoute
      for (let vertexIndex = 0; vertexIndex < lod.verticesPerRoute; vertexIndex++) {
        const idx = base + vertexIndex
        lod.densityData[idx] = route.density01
        lod.corridorKeepData[idx] = route.corridorKeep01
        lod.corridorGroupData[idx] = route.corridorGroup01
      }
    }

    lod.densityAttr.needsUpdate = true
    lod.corridorKeepAttr.needsUpdate = true
    lod.corridorGroupAttr.needsUpdate = true
  }

  function resetFlightStartupAnimation() {
    flightStartupElapsedSeconds = 0
    planeRevealProgress = 0
    lineMat.uniforms.uStartupReveal.value = 0
    lineMat.uniforms.uStartupFade.value = 0
    planeMat.uniforms.uRevealProgress.value = 0
    planeMat.uniforms.uStartupFade.value = 0
    if (hubsMat) {
      hubsMat.uniforms.uRevealProgress.value = 0
    }
  }

  function activateFlightStartupAnimation() {
    if (flightStartupActive) return
    resetFlightStartupAnimation()
    flightStartupActive = true
  }

  function syncPlaneScoreAttributes(routeStartIndex = 0, routeCountToSync = routeData.length - routeStartIndex) {
    if (!planeAttributeRefs || !planeFocusRouteData || routeCountToSync <= 0) return
    const routeEndIndex = Math.min(routeData.length, routeStartIndex + routeCountToSync, Math.max(routeStartIndex, planeBuiltRouteCount))
    if (routeEndIndex <= routeStartIndex) return

    const densityArray = planeAttributeRefs.density.array as Float32Array
    const corridorKeepArray = planeAttributeRefs.corridorKeep.array as Float32Array
    const corridorGroupArray = planeAttributeRefs.corridorGroup.array as Float32Array
    const revealPriorityArray = planeAttributeRefs.revealPriority.array as Float32Array

    for (let routeIndex = routeStartIndex; routeIndex < routeEndIndex; routeIndex++) {
      const route = routeData[routeIndex]
      const base = routeIndex * MAX_PLANES_PER_ROUTE
      for (let planeIndex = 0; planeIndex < MAX_PLANES_PER_ROUTE; planeIndex++) {
        const idx = base + planeIndex
        const enabled = planeIndex < route.trafficCount ? 1 : 0
        densityArray[idx] = route.density01
        corridorKeepArray[idx] = route.corridorKeep01
        corridorGroupArray[idx] = route.corridorGroup01
        revealPriorityArray[idx] = computePlaneRevealPriority(route, planeIndex, enabled)
      }
    }

    const startPlaneIndex = routeStartIndex * MAX_PLANES_PER_ROUTE
    const planeSpan = (routeEndIndex - routeStartIndex) * MAX_PLANES_PER_ROUTE
    markPlaneAttributeRange(planeAttributeRefs.density, startPlaneIndex, planeSpan)
    markPlaneAttributeRange(planeAttributeRefs.corridorKeep, startPlaneIndex, planeSpan)
    markPlaneAttributeRange(planeAttributeRefs.corridorGroup, startPlaneIndex, planeSpan)
    markPlaneAttributeRange(planeAttributeRefs.revealPriority, startPlaneIndex, planeSpan)
  }

  function commitPlaneGeometryProgress(committedRouteCount: number) {
    if (!planeAttributeRefs) return
    const clampedRouteCount = THREE.MathUtils.clamp(committedRouteCount, 0, routeData.length)
    if (clampedRouteCount <= planeBuiltRouteCount) return

    const startPlaneIndex = planeBuiltRouteCount * MAX_PLANES_PER_ROUTE
    const committedPlaneCount = clampedRouteCount * MAX_PLANES_PER_ROUTE
    const deltaPlaneCount = committedPlaneCount - startPlaneIndex

    markPlaneAttributeRange(planeAttributeRefs.position, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.p0, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.p1, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.p2, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.curve, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.animA, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.animB, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.focusRoute, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.altitude, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.hub, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.density, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.corridorKeep, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.corridorGroup, startPlaneIndex, deltaPlaneCount)
    markPlaneAttributeRange(planeAttributeRefs.revealPriority, startPlaneIndex, deltaPlaneCount)

    planeGeo.setDrawRange(0, committedPlaneCount)
    planeBuiltRouteCount = clampedRouteCount
    planeGeometryVisible = planeBuiltRouteCount > 0
    if (planeGeometryVisible) {
      planes.visible = visualizationMode !== 'legacy' && SHOW_ROUTE_PLANES
    }
  }

  function rebuildHeatTextureFromRoutes() {
    const nextHeatTexture = buildFlightHeatmapTextureAsync(routeData, 512, 256)
    const previousHeatTexture = heatMat.uniforms.uHeat.value as THREE.Texture | null
    heatMat.uniforms.uHeat.value = nextHeatTexture
    if (previousHeatTexture && previousHeatTexture !== nextHeatTexture) {
      previousHeatTexture.dispose()
    }
  }

  function applyFocusMaskToLineLod(lod: LineLodGeometry) {
    if (!focusIso3) {
      for (let i = 0; i < lod.vertexCount; i++) {
        lod.focusData[i * 4 + 1] = 1
      }
    } else {
      for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
        const r = routeData[rIndex]
        const hit = r.countryIso3List.includes(focusIso3) ? 1 : 0
        const base = rIndex * lod.verticesPerRoute
        for (let j = 0; j < lod.verticesPerRoute; j++) {
          lod.focusData[(base + j) * 4 + 1] = hit
        }
      }
    }

    lod.focusAttr.needsUpdate = true
  }

  function ensureFineLineLod() {
    if (lineFineBuildState !== 'idle' || routeData.length === 0) return
    if (isEnrichedSource && routeBuildState !== 'ready') return
    lineFineBuildState = 'building'
    scheduleDeferredWork(() => {
      const built = buildLineLodGeometry(LINE_SEGMENTS_FINE)
      lineFine = built
      lineLods.push(built)
      applyFocusMaskToLineLod(built)
      lineFineBuildState = 'ready'
      if (activeLineLod === 'fine') {
        lines.geometry = built.geometry
      }
    }, 120)
  }

  function startRouteScoreBuild() {
    if (routeScoresBuildState !== 'idle' || routeData.length === 0) return
    routeScoresBuildState = 'building'

    buildRouteScoresAsync(routeData, () => {
      for (let lodIndex = 0; lodIndex < lineLods.length; lodIndex++) {
        syncLineScoreAttributes(lineLods[lodIndex])
      }
      routeScoresBuildState = 'ready'
      if (planeBuildState !== 'idle') {
        syncPlaneScoreAttributes()
      }
    })
  }

  function setActiveLineLod(next: 'coarse' | 'fine') {
    if (routeData.length === 0) {
      activeLineLod = next
      lines.geometry = lineCoarse.geometry
      return
    }
    if (activeLineLod === next && (next !== 'fine' || lineFine)) return
    activeLineLod = next
    if (next === 'fine') {
      if (lineFine) {
        lines.geometry = lineFine.geometry
      } else {
        lines.geometry = lineCoarse.geometry
        ensureFineLineLod()
      }
      return
    }
    lines.geometry = lineCoarse.geometry
  }

  // ---------------------------
  // Planes (batch in 1 draw call)
  // ---------------------------
  const planeGeo = new THREE.BufferGeometry()
  const MAX_PLANES_PER_ROUTE = TRAFFIC_LEVELS
  let planeCount = Math.max(1, routeData.length * MAX_PLANES_PER_ROUTE)
  let planeFocusRouteAttr: THREE.BufferAttribute | null = null
  let planeFocusRouteData: Float32Array | null = null
  let planeAttributeRefs: {
    position: THREE.BufferAttribute
    p0: THREE.BufferAttribute
    p1: THREE.BufferAttribute
    p2: THREE.BufferAttribute
    curve: THREE.BufferAttribute
    animA: THREE.BufferAttribute
    animB: THREE.BufferAttribute
    focusRoute: THREE.BufferAttribute
    altitude: THREE.BufferAttribute
    hub: THREE.BufferAttribute
    density: THREE.BufferAttribute
    corridorKeep: THREE.BufferAttribute
    corridorGroup: THREE.BufferAttribute
    revealPriority: THREE.BufferAttribute
  } | null = null
  let planeGeometryReady = false
  let planeGeometryVisible = false
  let planeBuildState: 'idle' | 'building' | 'ready' = 'idle'
  let planeBuiltRouteCount = 0
  const planeRevealDurationSeconds = THREE.MathUtils.clamp(
    6.8 + Math.sqrt(startupRouteCount) * 0.055,
    7.5,
    13.5
  )
  let planeRevealProgress = 0

  function fract01(v: number) {
    return v - Math.floor(v)
  }

  function markPlaneAttributeRange(attr: THREE.BufferAttribute, startItem: number, itemCount: number) {
    if (itemCount <= 0) return
    if (typeof (attr as any).clearUpdateRanges === 'function') {
      ;(attr as any).clearUpdateRanges()
    }
    if (typeof (attr as any).addUpdateRange === 'function') {
      ;(attr as any).addUpdateRange(startItem * attr.itemSize, itemCount * attr.itemSize)
    }
    attr.needsUpdate = true
  }

  function getPlaneBaseImportance(route: Route) {
    if (routeScoresBuildState === 'ready') {
      return route.importance01
    }

    const traffic01 = THREE.MathUtils.clamp((route.traffic - 0.68) / (1.34 - 0.68), 0, 1)
    return THREE.MathUtils.clamp(
      route.hub * 0.34 +
      traffic01 * 0.28 +
      route.altitude01 * 0.14 +
      (1 - route.seed) * 0.16 +
      THREE.MathUtils.clamp((route.distanceKm - 350) / 9000, 0, 1) * 0.08,
      0,
      1
    )
  }

  function computePlaneRevealPriority(route: Route, planeIndex: number, enabled: number) {
    if (enabled <= 0) return 1
    const enabledPlaneRank = planeIndex < route.trafficCount ? planeIndex / Math.max(1, route.trafficCount - 1) : 1
    const revealNoise = (fract01(route.seed * 29.0 + planeIndex * 4.7) - 0.5) * 0.04
    return THREE.MathUtils.clamp(
      (1 - getPlaneBaseImportance(route)) * 0.88 + enabledPlaneRank * 0.18 + revealNoise,
      0,
      1
    )
  }

  function setPlaneGeometryAttributes(attrs: {
    position: Float32Array
    p0: Float32Array
    p1: Float32Array
    p2: Float32Array
    curve: Float32Array
    animA: Float32Array
    animB: Float32Array
    focusRoute: Float32Array
    altitude: Float32Array
    hub: Float32Array
    density: Float32Array
    corridorKeep: Float32Array
    corridorGroup: Float32Array
    revealPriority: Float32Array
  }) {
    const positionAttr = new THREE.BufferAttribute(attrs.position, 3)
    positionAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('position', positionAttr)
    const p0Attr = new THREE.BufferAttribute(attrs.p0, 3)
    p0Attr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aP0', p0Attr)
    const p1Attr = new THREE.BufferAttribute(attrs.p1, 3)
    p1Attr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aP1', p1Attr)
    const p2Attr = new THREE.BufferAttribute(attrs.p2, 3)
    p2Attr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aP2', p2Attr)
    const curveAttr = new THREE.BufferAttribute(attrs.curve, 3)
    curveAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aCurve', curveAttr)
    const animAAttr = new THREE.BufferAttribute(attrs.animA, 4)
    animAAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aAnimA', animAAttr)
    const animBAttr = new THREE.BufferAttribute(attrs.animB, 4)
    animBAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aAnimB', animBAttr)
    planeFocusRouteAttr = new THREE.BufferAttribute(attrs.focusRoute, 2)
    planeFocusRouteAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aFocusRoute', planeFocusRouteAttr)
    const altitudeAttr = new THREE.BufferAttribute(attrs.altitude, 1)
    altitudeAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aAltitude', altitudeAttr)
    const hubAttr = new THREE.BufferAttribute(attrs.hub, 1)
    hubAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aHub', hubAttr)
    const densityAttr = new THREE.BufferAttribute(attrs.density, 1)
    densityAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aDensity', densityAttr)
    const corridorKeepAttr = new THREE.BufferAttribute(attrs.corridorKeep, 1)
    corridorKeepAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aCorridorKeep', corridorKeepAttr)
    const corridorGroupAttr = new THREE.BufferAttribute(attrs.corridorGroup, 1)
    corridorGroupAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aCorridorGroup', corridorGroupAttr)
    const revealPriorityAttr = new THREE.BufferAttribute(attrs.revealPriority, 1)
    revealPriorityAttr.setUsage(THREE.DynamicDrawUsage)
    planeGeo.setAttribute('aRevealPriority', revealPriorityAttr)
    planeFocusRouteData = attrs.focusRoute
    planeAttributeRefs = {
      position: positionAttr,
      p0: p0Attr,
      p1: p1Attr,
      p2: p2Attr,
      curve: curveAttr,
      animA: animAAttr,
      animB: animBAttr,
      focusRoute: planeFocusRouteAttr,
      altitude: altitudeAttr,
      hub: hubAttr,
      density: densityAttr,
      corridorKeep: corridorKeepAttr,
      corridorGroup: corridorGroupAttr,
      revealPriority: revealPriorityAttr
    }
    planeGeo.computeBoundingSphere()
  }

  setPlaneGeometryAttributes({
    position: new Float32Array(3),
    p0: new Float32Array(3),
    p1: new Float32Array(3),
    p2: new Float32Array(3),
    curve: new Float32Array(3),
    animA: new Float32Array(4),
    animB: new Float32Array([0, 0, 0, 0]),
    focusRoute: new Float32Array([1, -999]),
    altitude: new Float32Array(1),
    hub: new Float32Array(1),
    density: new Float32Array(1),
    corridorKeep: new Float32Array(1),
    corridorGroup: new Float32Array(1),
    revealPriority: new Float32Array([1])
  })

  const planeMat = new THREE.ShaderMaterial({
    vertexShader: flightPlanesVert,
    fragmentShader: flightPlanesFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCameraDistance: { value: 25 },
      uCoreColor: { value: GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.yellow, 0.22) },
      uGlowColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.16) },
      uTintColor: { value: GOOGLE_COLORS.yellow.clone().multiplyScalar(1.0) },
      uAccentColor: { value: GOOGLE_COLORS.white.clone() },
      uAlpha: { value: 1.14 },
      uFocusMix: { value: 0.0 },
      uRouteKeep: { value: 1.0 },
      uPlaneDensity: { value: 1.0 },
      uAltitudeLodMix: { value: 1.0 },
      uRepresentationMix: { value: 0.0 },
      uRevealProgress: { value: 0.0 },
      uStartupFade: { value: 0.0 },
      uHoverRouteId: { value: -999 },
      uHoverMix: { value: 0.0 },
      uSelectedRouteId: { value: -999 },
      uSelectedMix: { value: 0.0 },
      uSizeMul: { value: scaleThickness(1.0) }
    }
  })

  const planes = new THREE.Points(planeGeo, planeMat)
  planes.renderOrder = 6
  planes.frustumCulled = false
  planes.visible = false
  group.add(planes)

  function finalizePlaneGeometry(attrs: {
    position: Float32Array
    p0: Float32Array
    p1: Float32Array
    p2: Float32Array
    curve: Float32Array
    animA: Float32Array
    animB: Float32Array
    focusRoute: Float32Array
    altitude: Float32Array
    hub: Float32Array
    density: Float32Array
    corridorKeep: Float32Array
    corridorGroup: Float32Array
    revealPriority: Float32Array
  }) {
    if (planeFocusRouteData !== attrs.focusRoute) {
      setPlaneGeometryAttributes(attrs)
    }
    planeGeo.setDrawRange(0, routeData.length * MAX_PLANES_PER_ROUTE)
    planeGeometryReady = true
    planeGeometryVisible = routeData.length > 0
    planeBuildState = 'ready'
    planeBuiltRouteCount = routeData.length
    applyFocusMask()
    planes.visible = visualizationMode !== 'legacy' && SHOW_ROUTE_PLANES
  }

  function startPlaneGeometryBuild() {
    if (planeBuildState !== 'idle') return
    planeBuildState = 'building'
    const planeRouteCapacity = isEnrichedSource ? Math.max(1, selectedEnrichedFlights.length) : Math.max(1, routeData.length)
    planeCount = planeRouteCapacity * MAX_PLANES_PER_ROUTE
    planeBuiltRouteCount = 0
    planeGeometryVisible = false

    const attrs = {
      position: new Float32Array(planeCount * 3),
      p0: new Float32Array(planeCount * 3),
      p1: new Float32Array(planeCount * 3),
      p2: new Float32Array(planeCount * 3),
      curve: new Float32Array(planeCount * 3),
      animA: new Float32Array(planeCount * 4),
      animB: new Float32Array(planeCount * 4),
      focusRoute: new Float32Array(planeCount * 2),
      altitude: new Float32Array(planeCount),
      hub: new Float32Array(planeCount),
      density: new Float32Array(planeCount),
      corridorKeep: new Float32Array(planeCount),
      corridorGroup: new Float32Array(planeCount),
      revealPriority: new Float32Array(planeCount)
    }

    setPlaneGeometryAttributes(attrs)
    planeGeo.setDrawRange(0, 0)
    applyFocusMask()

    let nextRouteIndex = 0

    const fillChunk = (deadline?: IdleDeadline) => {
      const chunkDeadline = deadline ? Math.max(1.25, deadline.timeRemaining()) : 4
      const chunkStart = typeof performance !== 'undefined' ? performance.now() : 0
      let processedRoutes = 0

      while (nextRouteIndex < routeData.length) {
        const r = routeData[nextRouteIndex]
        const base = nextRouteIndex * MAX_PLANES_PER_ROUTE

        for (let j = 0; j < MAX_PLANES_PER_ROUTE; j++) {
          const idx = base + j

          attrs.position[idx * 3 + 0] = r.p0x
          attrs.position[idx * 3 + 1] = r.p0y
          attrs.position[idx * 3 + 2] = r.p0z

          attrs.p0[idx * 3 + 0] = r.p0x
          attrs.p0[idx * 3 + 1] = r.p0y
          attrs.p0[idx * 3 + 2] = r.p0z
          attrs.p1[idx * 3 + 0] = r.p1x
          attrs.p1[idx * 3 + 1] = r.p1y
          attrs.p1[idx * 3 + 2] = r.p1z
          attrs.p2[idx * 3 + 0] = r.p2x
          attrs.p2[idx * 3 + 1] = r.p2y
          attrs.p2[idx * 3 + 2] = r.p2z
          attrs.curve[idx * 3 + 0] = r.arcHeight
          attrs.curve[idx * 3 + 1] = r.lateralOffsetRad
          attrs.curve[idx * 3 + 2] = r.loopSweepRad

          const po = idx * 4
          attrs.animA[po + 0] = r.speed
          attrs.animA[po + 1] = r.phase
          attrs.animA[po + 3] = r.dir

          const enabled = j < r.trafficCount ? 1 : 0
          attrs.animB[po + 3] = enabled

          const denom = Math.max(1, r.trafficCount)
          const baseOffset = j === 0 ? 0 : j / denom
          const jitter = j === 0 ? 0 : (fract01(r.seed * 17.0 + j * 3.1) - 0.5) * 0.06
          attrs.animA[po + 2] = fract01(baseOffset + jitter)

          const sizeJitter = 0.94 - j * 0.06 + (fract01(r.seed * 11.0 + j * 1.7) - 0.5) * 0.08
          attrs.animB[po + 0] = r.size * sizeJitter
          attrs.animB[po + 1] = fract01(r.seed + j * 0.23)
          attrs.animB[po + 2] = r.traffic

          const ps = idx * 2
          attrs.focusRoute[ps + 0] = 1
          attrs.focusRoute[ps + 1] = r.id
          attrs.altitude[idx] = r.altitude01
          attrs.hub[idx] = r.hub
          attrs.density[idx] = r.density01
          attrs.corridorKeep[idx] = r.corridorKeep01
          attrs.corridorGroup[idx] = r.corridorGroup01

          attrs.revealPriority[idx] = computePlaneRevealPriority(r, j, enabled)
        }

        nextRouteIndex += 1
        processedRoutes += 1

        const timeSpent =
          typeof performance !== 'undefined' ? performance.now() - chunkStart : processedRoutes
        if (
          processedRoutes >= PLANE_BUILD_CHUNK_ROUTES ||
          timeSpent >= chunkDeadline ||
          (deadline && deadline.timeRemaining() < 1.25)
        ) {
          break
        }
      }

      if (nextRouteIndex > planeBuiltRouteCount) {
        commitPlaneGeometryProgress(nextRouteIndex)
      }

      if (nextRouteIndex < routeData.length) {
        scheduleDeferredWork(fillChunk)
        return
      }

      if (routeBuildState !== 'ready') {
        scheduleDeferredWork(fillChunk, 24)
        return
      }

      finalizePlaneGeometry(attrs)
    }

    scheduleDeferredWork(fillChunk, 36)
  }

  // ---------------------------
  // Endpoints (hover/selected)
  // ---------------------------
  const endpointsGeo = new THREE.BufferGeometry()
  const endpointPositions = new Float32Array(4 * 3) // 0..1 hover, 2..3 selected
  const endpointKind = new Float32Array([0, 0, 1, 1])
  const endpointRole = new Float32Array([0, 1, 0, 1]) // origin, dest
  const endpointSeed = new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()])

  endpointsGeo.setAttribute('position', new THREE.BufferAttribute(endpointPositions, 3))
  endpointsGeo.setAttribute('aKind', new THREE.BufferAttribute(endpointKind, 1))
  endpointsGeo.setAttribute('aRole', new THREE.BufferAttribute(endpointRole, 1))
  endpointsGeo.setAttribute('aSeed', new THREE.BufferAttribute(endpointSeed, 1))
  endpointsGeo.computeBoundingSphere()

  const endpointsMat = new THREE.ShaderMaterial({
    vertexShader: flightEndpointsVert,
    fragmentShader: flightEndpointsFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCameraDistance: { value: 25 },
      uHoverMix: { value: 0.0 },
      uSelectedMix: { value: 0.0 },
      uOriginColor: { value: GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.yellow, 0.08) },
      uDestColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.18) },
      uAccentColor: { value: GOOGLE_COLORS.white.clone() },
      uAlpha: { value: 1.1 }
    }
  })

  const endpoints = new THREE.Points(endpointsGeo, endpointsMat)
  endpoints.renderOrder = 7
  endpoints.frustumCulled = false
  endpoints.visible = SHOW_ROUTE_ENDPOINTS
  group.add(endpoints)

  // ---------------------------
  // Route pin (midpoint) — hover/selected
  // ---------------------------
  const pinGeo = new THREE.BufferGeometry()
  const pinPositions = new Float32Array(2 * 3) // 0 hover, 1 selected
  const pinKind = new Float32Array([0, 1])
  const pinSeed = new Float32Array([Math.random(), Math.random()])

  pinGeo.setAttribute('position', new THREE.BufferAttribute(pinPositions, 3))
  pinGeo.setAttribute('aKind', new THREE.BufferAttribute(pinKind, 1))
  pinGeo.setAttribute('aSeed', new THREE.BufferAttribute(pinSeed, 1))
  pinGeo.computeBoundingSphere()

  const pinMat = new THREE.ShaderMaterial({
    vertexShader: flightPinVert,
    fragmentShader: flightPinFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCameraDistance: { value: 25 },
      uHoverMix: { value: 0.0 },
      uSelectedMix: { value: 0.0 },
      uHoverColor: { value: GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.lightBlue, 0.08) },
      uSelectedColor: { value: GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.yellow, 0.24) },
      uAlpha: { value: 0.92 }
    }
  })

  const pin = new THREE.Points(pinGeo, pinMat)
  pin.name = 'flightRoutePin'
  pin.renderOrder = 6.8
  pin.frustumCulled = false
  pin.visible = SHOW_ROUTE_PIN
  group.add(pin)

  let focusMix = 0
  let focusTarget = 0
  let focusIso3 = ''

  let hoverMix = 0
  let hoverTarget = 0
  let hoverRouteId = -999

  let selectedMix = 0
  let selectedTarget = 0
  let selectedRouteId = -999

  let heatMix = 0
  let heatTarget = 0
  let visualizationMode: FlightVisualizationMode = 'reengineered'

  const routesByCountry = new Map<string, number[]>()

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

  function commitIncrementalFlightBootstrap(committedRouteCount: number) {
    if (committedRouteCount <= 0) return
    commitLineGeometryProgress(committedRouteCount)
    activateFlightStartupAnimation()
    if (planeBuildState === 'idle') {
      startPlaneGeometryBuild()
    }
  }

  rebuildRoutesByCountryIndex()

  function setEndpointPositions(kind: 'hover' | 'selected', routeId: number) {
    const r = routeData[routeId]
    if (!r) return

    const base = kind === 'hover' ? 0 : 6 // float offset
    const fromIsP0 = r.dir >= 0
    const ox = fromIsP0 ? r.p0x : r.p2x
    const oy = fromIsP0 ? r.p0y : r.p2y
    const oz = fromIsP0 ? r.p0z : r.p2z
    const dx = fromIsP0 ? r.p2x : r.p0x
    const dy = fromIsP0 ? r.p2y : r.p0y
    const dz = fromIsP0 ? r.p2z : r.p0z

    endpointPositions[base + 0] = ox
    endpointPositions[base + 1] = oy
    endpointPositions[base + 2] = oz

    endpointPositions[base + 3] = dx
    endpointPositions[base + 4] = dy
    endpointPositions[base + 5] = dz

    ;(endpointsGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  function setPinPosition(kind: 'hover' | 'selected', routeId: number) {
    const r = routeData[routeId]
    if (!r) return

    const mid: number[] = [0, 0, 0]
    routePointParam(mid, r, 0.5)

    const idx = kind === 'hover' ? 0 : 1
    pinPositions[idx * 3 + 0] = mid[0]
    pinPositions[idx * 3 + 1] = mid[1]
    pinPositions[idx * 3 + 2] = mid[2]

    ;(pinGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  function applyFocusMask() {
    for (let lodIndex = 0; lodIndex < lineLods.length; lodIndex++) {
      applyFocusMaskToLineLod(lineLods[lodIndex])
    }

    if (!planeFocusRouteData || !planeFocusRouteAttr) {
      return
    }

    if (!focusIso3) {
      for (let i = 0; i < planeCount; i++) {
        planeFocusRouteData[i * 2 + 0] = 1
      }
    } else {
      for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
        const r = routeData[rIndex]
        const hit = r.countryIso3List.includes(focusIso3) ? 1 : 0
        const base = rIndex * MAX_PLANES_PER_ROUTE
        for (let j = 0; j < MAX_PLANES_PER_ROUTE; j++) {
          planeFocusRouteData[(base + j) * 2 + 0] = hit
        }
      }
    }

    planeFocusRouteAttr.needsUpdate = true
  }

  function setFocusCountry(iso3: string | null) {
    if (!hasCountryLookup) {
      focusIso3 = ''
      focusTarget = 0
      return
    }
    const next = (iso3 || '').trim()
    focusIso3 = next
    focusTarget = next ? 1 : 0
    applyFocusMask()
  }

  function setHoverRoute(routeId: number | null) {
    if (typeof routeId === 'number' && Number.isFinite(routeId)) {
      hoverRouteId = routeId
      hoverTarget = 1
      if (SHOW_ROUTE_ENDPOINTS && SHOW_HOVER_ENDPOINTS) {
        setEndpointPositions('hover', routeId)
      }
      if (SHOW_ROUTE_PIN) {
        setPinPosition('hover', routeId)
      }
      return
    }
    hoverTarget = 0
  }

  function setSelectedRoute(routeId: number | null) {
    if (typeof routeId === 'number' && Number.isFinite(routeId)) {
      selectedRouteId = routeId
      selectedTarget = 1
      if (SHOW_ROUTE_ENDPOINTS) {
        setEndpointPositions('selected', routeId)
      }
      if (SHOW_ROUTE_PIN) {
        setPinPosition('selected', routeId)
      }
      return
    }
    selectedTarget = 0
  }

  function getRouteInfo(routeId: number) {
    const r = routeData[routeId]
    if (!r) return null

    const mid: number[] = [0, 0, 0]
    routePointParam(mid, r, 0.5)

    return {
      id: r.id,
      fromName: r.fromName,
      toName: r.toName,
      fromLat: r.fromLat,
      fromLon: r.fromLon,
      toLat: r.toLat,
      toLon: r.toLon,
      distanceKm: r.distanceKm,
      flightName: r.flightName,
      traffic: r.traffic,
      trafficCount: r.trafficCount,
      dir: r.dir,
      callsign: r.callsign,
      airline: r.airline,
      aircraftType: r.aircraftType,
      registration: r.registration,
      sourceMode: r.sourceMode,
      midX: mid[0],
      midY: mid[1],
      midZ: mid[2],
      isoA3: r.isoA3,
      isoB3: r.isoB3
    }
  }

  function computeRouteFlightsAtTime(r: Route, timeSeconds: number) {
    // This is a synthetic but stable metric derived from the simulated network:
    // more routes + higher traffic => higher baseline, plus smooth time modulation.
    const w1 = 0.6 + 0.4 * Math.sin(timeSeconds * 0.019 + r.seed * 11.7)
    const w2 = 0.65 + 0.35 * Math.sin(timeSeconds * 0.007 + r.phase * Math.PI * 2 + r.seed * 3.9)
    const w3 = 0.75 + 0.25 * Math.sin(timeSeconds * 0.003 + r.id * 0.8)
    const activity = THREE.MathUtils.clamp((w1 * 0.46 + w2 * 0.38 + w3 * 0.16), 0.18, 1.15)
    const trafficBoost = THREE.MathUtils.clamp(0.85 + (r.traffic - 0.62) * 0.25, 0.82, 1.05)
    return r.trafficCount * activity * trafficBoost
  }

  function computeCountryFlightsAtTime(routeIds: number[], iso3: string, timeSeconds: number) {
    let incoming = 0
    let outgoing = 0

    for (let i = 0; i < routeIds.length; i++) {
      const r = routeData[routeIds[i]]
      if (!r) continue

      const flightsNow = computeRouteFlightsAtTime(r, timeSeconds)
      const isOrigin = r.isoA3 === iso3
      const isDestination = r.isoB3 === iso3

      if (isOrigin && isDestination) {
        incoming += flightsNow * 0.5
        outgoing += flightsNow * 0.5
        continue
      }
      if (isDestination) {
        incoming += flightsNow
      }
      if (isOrigin) {
        outgoing += flightsNow
      }
    }

    return {
      incoming: Math.max(0, Math.round(incoming)),
      outgoing: Math.max(0, Math.round(outgoing))
    }
  }

  function distributeDomesticFlights(incoming: number, outgoing: number, domestic: number) {
    const safeIncoming = Math.max(0, Math.round(incoming))
    const safeOutgoing = Math.max(0, Math.round(outgoing))
    const safeDomestic = Math.max(0, Math.round(domestic))
    const domesticIncoming = Math.floor(safeDomestic * 0.5)
    const domesticOutgoing = safeDomestic - domesticIncoming

    return {
      incoming: safeIncoming + domesticIncoming,
      outgoing: safeOutgoing + domesticOutgoing
    }
  }

  function getCountryFlightStats(iso3: string, timeSeconds: number): CountryFlightStats {
    const key = (iso3 || '').trim()
    const enrichedStats = countryStatsByIso3.get(key)
    if (enrichedStats) {
      const domestic = Math.max(0, Math.round(Number(enrichedStats.dom ?? 0)))
      const over = Math.max(0, Math.round(Number(enrichedStats.over ?? 0)))
      const dayDomestic = Math.max(0, Math.round(Number(enrichedStats.day_dom ?? 0)))
      const flowNow = distributeDomesticFlights(enrichedStats.arr ?? 0, enrichedStats.dep ?? 0, domestic)
      const flowDay = distributeDomesticFlights(
        enrichedStats.day_arr ?? 0,
        enrichedStats.day_dep ?? 0,
        dayDomestic
      )
      const now = Math.max(
        0,
        Math.round(
          Number.isFinite(Number(enrichedStats.in_air))
            ? Number(enrichedStats.in_air)
            : flowNow.incoming + flowNow.outgoing + over
        )
      )
      return {
        now,
        tenMinAgo: now,
        routes: now,
        incoming: flowNow.incoming,
        outgoing: flowNow.outgoing,
        dayTotal: Math.max(
          0,
          Math.round(
            Number.isFinite(Number(enrichedStats.day_total))
              ? Number(enrichedStats.day_total)
              : flowDay.incoming + flowDay.outgoing + Math.max(0, Math.round(Number(enrichedStats.day_over ?? 0)))
          )
        ),
        dayIncoming: flowDay.incoming,
        dayOutgoing: flowDay.outgoing,
        over
      }
    }

    const routeIds = key ? routesByCountry.get(key) ?? [] : []
    const nowBreakdown = computeCountryFlightsAtTime(routeIds, key, timeSeconds)
    const tenMinAgoBreakdown = computeCountryFlightsAtTime(routeIds, key, timeSeconds - 600)

    return {
      now: nowBreakdown.incoming + nowBreakdown.outgoing,
      tenMinAgo: tenMinAgoBreakdown.incoming + tenMinAgoBreakdown.outgoing,
      routes: routeIds.length,
      incoming: nowBreakdown.incoming,
      outgoing: nowBreakdown.outgoing
    }
  }

  function setHeatmapEnabled(enabled: boolean) {
    heatTarget = enabled ? 1 : 0
    if (enabled) {
      heatmap.visible = true
    }
  }

  function setVisualizationMode(mode: FlightVisualizationMode) {
    const next: FlightVisualizationMode = mode === 'legacy' ? 'legacy' : 'reengineered'
    if (visualizationMode === next) return
    visualizationMode = next

    if (visualizationMode === 'legacy') {
      setActiveLineLod('fine')
      planes.visible = false
      return
    }

    planes.visible = SHOW_ROUTE_PLANES && (planeGeometryReady || planeGeometryVisible)
  }

  // Update positions + uniforms.
  function update(deltaSeconds: number, timeSeconds: number, cameraDistance: number) {
    if (flightStartupActive) {
      flightStartupElapsedSeconds += deltaSeconds
    }
    const airportStartupT = THREE.MathUtils.clamp(
      (flightStartupElapsedSeconds - airportStartupDelaySeconds) / Math.max(0.95, lineRevealDurationSeconds * 0.58),
      0,
      1
    )
    const airportStartupReveal = THREE.MathUtils.smoothstep(airportStartupT, 0, 1)
    const lineStartupT = THREE.MathUtils.clamp(
      (flightStartupElapsedSeconds - flightStartupDelaySeconds) / lineRevealDurationSeconds,
      0,
      1
    )
    const lineStartupReveal = THREE.MathUtils.smoothstep(lineStartupT, 0, 1)
    const lineStartupFade = THREE.MathUtils.smoothstep(lineStartupT, 0, 1)

    // smooth focus crossfade
    const k = 1.0 - Math.exp(-deltaSeconds * 4.2)
    focusMix += (focusTarget - focusMix) * k
    lineMat.uniforms.uFocusMix.value = focusMix
    planeMat.uniforms.uFocusMix.value = focusMix

    // smooth hover/selection crossfade
    const kHover = 1.0 - Math.exp(-deltaSeconds * 5.0)
    hoverMix += (hoverTarget - hoverMix) * kHover
    if (hoverTarget === 0 && hoverMix < 0.002) hoverRouteId = -999

    const kSel = 1.0 - Math.exp(-deltaSeconds * 4.0)
    selectedMix += (selectedTarget - selectedMix) * kSel
    if (selectedTarget === 0 && selectedMix < 0.002) selectedRouteId = -999

    lineMat.uniforms.uHoverRouteId.value = hoverRouteId
    lineMat.uniforms.uHoverMix.value = hoverMix
    lineMat.uniforms.uSelectedRouteId.value = selectedRouteId
    lineMat.uniforms.uSelectedMix.value = selectedMix
    lineMat.uniforms.uStartupReveal.value = lineStartupReveal
    lineMat.uniforms.uStartupFade.value = lineStartupFade

    planeMat.uniforms.uHoverRouteId.value = hoverRouteId
    planeMat.uniforms.uHoverMix.value = hoverMix
    planeMat.uniforms.uSelectedRouteId.value = selectedRouteId
    planeMat.uniforms.uSelectedMix.value = selectedMix
    const planeRevealT = THREE.MathUtils.clamp(
      (flightStartupElapsedSeconds - planeStartupDelaySeconds) / planeRevealDurationSeconds,
      0,
      1
    )
    planeRevealProgress = THREE.MathUtils.smoothstep(planeRevealT, 0, 1)
    planeMat.uniforms.uRevealProgress.value = planeRevealProgress
    planeMat.uniforms.uStartupFade.value = THREE.MathUtils.smoothstep(planeRevealT, 0, 1)

    endpointsMat.uniforms.uTime.value = timeSeconds
    endpointsMat.uniforms.uCameraDistance.value = cameraDistance
    endpointsMat.uniforms.uHoverMix.value = SHOW_ROUTE_ENDPOINTS && SHOW_HOVER_ENDPOINTS ? hoverMix : 0
    endpointsMat.uniforms.uSelectedMix.value = SHOW_ROUTE_ENDPOINTS ? selectedMix : 0
    endpointsMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(
      1.02,
      1.42,
      SHOW_ROUTE_ENDPOINTS ? THREE.MathUtils.clamp(selectedMix, 0, 1) : 0
    )

    pinMat.uniforms.uTime.value = timeSeconds
    pinMat.uniforms.uCameraDistance.value = cameraDistance
    pinMat.uniforms.uHoverMix.value = SHOW_ROUTE_PIN && SHOW_HOVER_ENDPOINTS ? hoverMix : 0
    pinMat.uniforms.uSelectedMix.value = SHOW_ROUTE_PIN ? selectedMix : 0
    pinMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(
      0.0,
      1.26,
      SHOW_ROUTE_PIN ? THREE.MathUtils.clamp(selectedMix, 0, 1) : 0
    )

    if (hubsMat) {
      hubsMat.uniforms.uTime.value = timeSeconds
      hubsMat.uniforms.uCameraDistance.value = cameraDistance
      hubsMat.uniforms.uRevealProgress.value = airportStartupReveal

      const zoom = THREE.MathUtils.clamp((32 - cameraDistance) / 16, 0, 1)
      const zoomOut = 1.0 - zoom
      const base = THREE.MathUtils.lerp(0.68, 1.12, zoomOut)
      const focusFade = THREE.MathUtils.lerp(1.0, 0.72, focusMix)
      const selectedFade = THREE.MathUtils.lerp(1.0, 0.82, selectedMix)
      hubsMat.uniforms.uAlphaMul.value = base * focusFade * selectedFade * airportStartupReveal
    }

    // uniforms
    lineMat.uniforms.uTime.value = timeSeconds
    lineMat.uniforms.uCameraDistance.value = cameraDistance
    planeMat.uniforms.uTime.value = timeSeconds
    planeMat.uniforms.uCameraDistance.value = cameraDistance

    // Heatmap uniforms
    heatMat.uniforms.uTime.value = timeSeconds
    heatMat.uniforms.uCameraDistance.value = cameraDistance

    // LOD + representation mode:
    // - legacy: dense static-like line rendering (original behavior)
    // - reengineered: altitude-aware LOD + particle-primary zoom-out
    const zoom = THREE.MathUtils.clamp((32 - cameraDistance) / 16, 0, 1)
    const zoomOut = 1.0 - zoom
    const isLegacyMode = visualizationMode === 'legacy'
    const hasCountryFocus = focusIso3.length > 0

    let routeKeep = THREE.MathUtils.lerp(0.78, 1.0, zoom)
    let planeDensity = THREE.MathUtils.lerp(0.72, 1.0, zoom)
    let representationMix = 0.0
    let altitudeLodMix = 0.0

    if (isLegacyMode) {
      setActiveLineLod('fine')
      if (isEnrichedSource) {
        routeKeep = hasCountryFocus ? 1.0 : THREE.MathUtils.lerp(0.18, 0.26, zoom)
        planeDensity = hasCountryFocus ? 1.0 : THREE.MathUtils.lerp(0.22, 0.34, zoom)
      }
    } else {
      if (activeLineLod === 'coarse' && zoom > LINE_LOD_FINE_IN) {
        setActiveLineLod('fine')
      } else if (activeLineLod === 'fine' && zoom < LINE_LOD_COARSE_OUT) {
        setActiveLineLod('coarse')
      }

      routeKeep = isEnrichedSource
        ? (hasCountryFocus ? 1.0 : THREE.MathUtils.lerp(0.20, 0.30, zoom))
        : THREE.MathUtils.lerp(0.84, 1.0, zoom)
      planeDensity = isEnrichedSource
        ? (hasCountryFocus ? 1.0 : THREE.MathUtils.lerp(0.24, 0.36, zoom))
        : THREE.MathUtils.lerp(0.86, 1.0, zoom)
      representationMix = THREE.MathUtils.smoothstep(zoomOut, 0.46, 0.98)
      altitudeLodMix = isEnrichedSource ? 0.0 : 1.0
    }

    planeDensity = THREE.MathUtils.clamp(
      planeDensity * (isEnrichedSource ? Math.max(1.0, PLANE_DENSITY_SCALE) : PLANE_DENSITY_SCALE),
      0.45,
      1.0
    )

    lineMat.uniforms.uRouteKeep.value = routeKeep
    lineMat.uniforms.uAltitudeLodMix.value = altitudeLodMix
    lineMat.uniforms.uRepresentationMix.value = representationMix
    planeMat.uniforms.uRouteKeep.value = routeKeep
    planeMat.uniforms.uPlaneDensity.value = planeDensity
    planeMat.uniforms.uAltitudeLodMix.value = altitudeLodMix
    planeMat.uniforms.uRepresentationMix.value = representationMix
    planes.visible = isLegacyMode ? false : SHOW_ROUTE_PLANES && (planeGeometryReady || planeGeometryVisible)

    // Heatmap: stronger when zoomed out; slightly reduced during country focus or route selection.
    const kHeat = 1.0 - Math.exp(-deltaSeconds * 3.6)
    heatMix += (heatTarget - heatMix) * kHeat
    if (heatTarget === 0 && heatMix < 0.002) {
      heatMix = 0
      heatmap.visible = false
    }

    const baseHeatOpacity = THREE.MathUtils.lerp(0.08, 0.24, zoomOut)
    const focusFade = THREE.MathUtils.lerp(1.0, 0.55, focusMix)
    const selectedFade = THREE.MathUtils.lerp(1.0, 0.72, selectedMix)
    heatMat.uniforms.uOpacity.value = baseHeatOpacity * focusFade * selectedFade * heatMix * lineStartupReveal

    const hoverBoost = THREE.MathUtils.lerp(1.0, 1.08, hoverMix * (1.0 - selectedMix * 0.35))
    const selectedBoost = THREE.MathUtils.lerp(1.0, 1.88, selectedMix)
    // Keep hover stroke close to country-border visual weight; only selection gets extra thickness.
    const selectedWidthBoost = THREE.MathUtils.lerp(1.0, 1.22, selectedMix)
    if (isLegacyMode) {
      lineMat.uniforms.uTailLength.value = THREE.MathUtils.clamp(
        scaleThickness(THREE.MathUtils.lerp(0.20, 0.34, zoom)),
        0.02,
        0.5
      )
      lineMat.uniforms.uGlowAlpha.value = THREE.MathUtils.lerp(0.46, 0.82, zoom) * hoverBoost * selectedBoost
      lineMat.uniforms.uBaseAlpha.value = THREE.MathUtils.lerp(0.084, 0.14, zoom) * THREE.MathUtils.lerp(1.0, 1.30, selectedMix)
      lineMat.uniforms.uHeadWidth.value = THREE.MathUtils.clamp(
        scaleThickness(THREE.MathUtils.lerp(0.028, 0.042, zoom) * selectedWidthBoost),
        0.004,
        0.1
      )
      planeMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(0.42, 0.72, zoom) * THREE.MathUtils.lerp(1.0, 1.18, Math.max(hoverMix, selectedMix))
    } else {
      lineMat.uniforms.uTailLength.value = THREE.MathUtils.clamp(
        scaleThickness(THREE.MathUtils.lerp(0.18, 0.36, zoomOut)),
        0.02,
        0.5
      )
      lineMat.uniforms.uGlowAlpha.value = THREE.MathUtils.lerp(0.5, 0.82, zoomOut) * hoverBoost * selectedBoost
      lineMat.uniforms.uBaseAlpha.value = THREE.MathUtils.lerp(0.064, 0.11, zoomOut) * THREE.MathUtils.lerp(1.0, 1.30, selectedMix)
      lineMat.uniforms.uHeadWidth.value = THREE.MathUtils.clamp(
        scaleThickness(THREE.MathUtils.lerp(0.024, 0.046, zoomOut) * selectedWidthBoost),
        0.004,
        0.1
      )
      planeMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(0.38, 0.94, representationMix) * THREE.MathUtils.lerp(1.0, 1.18, Math.max(hoverMix, selectedMix))
    }
  }

  if (isEnrichedSource) {
    startEnrichedRouteDataBuild(() => {
      rebuildHeatTextureFromRoutes()
      routeScoresBuildState = 'idle'
      routeBuildState = 'ready'
      if (!flightStartupActive) {
        activateFlightStartupAnimation()
      }
      if (planeBuildState === 'idle') {
        startPlaneGeometryBuild()
      }
      startRouteScoreBuild()
    })
  } else {
    routeBuildState = 'ready'
    activateFlightStartupAnimation()
    startPlaneGeometryBuild()
    startRouteScoreBuild()
  }

  return {
    group,
    update,
    setFocusCountry,
    setHoverRoute,
    setSelectedRoute,
    getRouteInfo,
    getCountryFlightStats,
    setHeatmapEnabled,
    setVisualizationMode,
    lines,
    planes,
    materials: {
      line: lineMat,
      plane: planeMat,
      heatmap: heatMat,
      endpoints: endpointsMat,
      pin: pinMat,
      hubs: hubsMat
    }
  }
}
