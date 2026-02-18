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
  distanceKm: number
  fromName: string
  toName: string
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  isoA3: string
  isoB3: string
}

type CountryFlightStats = {
  now: number
  tenMinAgo: number
  routes: number
}

type KernelTap = { dx: number; dy: number; w: number }

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

function buildFlightHeatmapTexture(routeData: Route[], width: number, height: number) {
  const heat = new Float32Array(width * height)
  const kernel = buildGaussianKernel(4, 2.15)
  const samplesPerRoute = 84
  const tmp = new THREE.Vector3()

  for (let i = 0; i < routeData.length; i++) {
    const r = routeData[i]
    const traffic01 = THREE.MathUtils.clamp((r.traffic - 0.62) / (1.22 - 0.62), 0, 1)
    const routeWeight = r.trafficCount * (0.75 + traffic01 * 0.55)
    const perSample = routeWeight / samplesPerRoute

    for (let s = 0; s < samplesPerRoute; s++) {
      const t = s / (samplesPerRoute - 1)
      const omt = 1 - t
      const omt2 = omt * omt
      const tt = t * t
      const k0 = omt2
      const k1 = 2 * omt * t
      const k2 = tt

      // Quadratic Bezier point (projected to the globe surface).
      const x = r.p0x * k0 + r.p1x * k1 + r.p2x * k2
      const y = r.p0y * k0 + r.p1y * k1 + r.p2y * k2
      const z = r.p0z * k0 + r.p1z * k1 + r.p2z * k2

      tmp.set(x, y, z).normalize()
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
  // Default: worker-backed build (prevents main-thread jank on init).
  if (typeof Worker === 'undefined') {
    return buildFlightHeatmapTexture(routeData, width, height)
  }

  const tex = buildEmptyHeatTexture(width, height)

  try {
    const stride = 11 // p0/p1/p2 (9) + traffic (1) + trafficCount (1)
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
      packed[o + 9] = r.traffic
      packed[o + 10] = r.trafficCount
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
      // Fallback to synchronous build if the worker fails for any reason.
      const fallback = buildFlightHeatmapTexture(routeData, width, height)
      ;(tex.image as any).data = (fallback.image as any).data
      tex.needsUpdate = true
    }

    worker.postMessage({ routes: packed, width, height }, [packed.buffer])
  } catch {
    // Fallback to synchronous build if worker creation fails (older browsers).
    return buildFlightHeatmapTexture(routeData, width, height)
  }

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

function bezierPointParam(out: number[], r: Route, t: number) {
  const omt = 1 - t
  const omt2 = omt * omt
  const tt = t * t
  const k0 = omt2
  const k1 = 2 * omt * t
  const k2 = tt

  out[0] = r.p0x * k0 + r.p1x * k1 + r.p2x * k2
  out[1] = r.p0y * k0 + r.p1y * k1 + r.p2y * k2
  out[2] = r.p0z * k0 + r.p1z * k1 + r.p2z * k2
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

export function createFlightRoutes(
  airports: Airport[],
  radius: number,
  countriesGeoJSON: any | null,
  count = 180
) {
  const group = new THREE.Group()
  group.name = 'flightRoutes'
  const SHOW_HOVER_ENDPOINTS = false
  const SHOW_ROUTE_PIN = false
  const SHOW_ROUTE_HUBS = false

  const { valid, routes } = pickRouteIndices(airports, count)
  const segmentsPerRoute = 64

  const routeData: Route[] = []

  // Airport "importance" for hub glow. Degree is computed from the chosen route list,
  // traffic is accumulated as we build routes (more planes => more visible hub).
  const airportDegree = new Int32Array(valid.length)
  for (let i = 0; i < routes.length; i++) {
    const [ia, ib] = routes[i]
    airportDegree[ia]++
    airportDegree[ib]++
  }
  let maxDegree = 1
  for (let i = 0; i < airportDegree.length; i++) maxDegree = Math.max(maxDegree, airportDegree[i])
  const airportTraffic = new Float32Array(valid.length)

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

  // Pre-map airports to ISO-3 so we can focus routes by selected country.
  const airportIso3: string[] = new Array(valid.length).fill('')
  const hasCountryLookup = Boolean(countriesGeoJSON?.features?.length)
  if (hasCountryLookup) {
    for (let i = 0; i < valid.length; i++) {
      const a = valid[i]
      const feature = findCountryFeature(countriesGeoJSON, Number(a.latitude), Number(a.longitude))
      airportIso3[i] = feature ? getISO3FromFeature(feature) : ''
    }
  }

  // Build route control points and per-route animation parameters.
  for (const [ia, ib] of routes) {
    const a = valid[ia]
    const b = valid[ib]
    if (!a || !b) continue

    const p0 = latLongToVector3(Number(a.latitude), Number(a.longitude), radius * 1.01)
    const p2 = latLongToVector3(Number(b.latitude), Number(b.longitude), radius * 1.01)

    const chord = p0.distanceTo(p2)
    const arcBoost = THREE.MathUtils.clamp(chord / (radius * 1.35), 0.25, 1.25)
    const mid = p0
      .clone()
      .add(p2)
      .normalize()
      .multiplyScalar(radius * (1.10 + arcBoost * 0.20))

    // Cycles per second for shader animation.
    const speed = 0.022 + arcBoost * 0.037
    const phase = Math.random()
    const seed = Math.random()
    const size = 3.1 + arcBoost * 1.25
    const dir = seed < 0.5 ? 1 : -1

    // Traffic density: longer routes tend to have more planes.
    const trafficBase = THREE.MathUtils.clamp((arcBoost - 0.25) / 1.0, 0, 1)
    const traffic = THREE.MathUtils.clamp(0.68 + trafficBase * 0.72 + (seed - 0.5) * 0.14, 0.68, 1.34)
    const traffic01 = THREE.MathUtils.clamp((traffic - 0.68) / (1.34 - 0.68), 0, 0.9999)
    const trafficCount = 1 + Math.floor(traffic01 * 6) // 1..6
    const distanceKm = haversineKm(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude))

    // Hubness for zoom-out "corridors": routes connected to high-degree airports
    // remain visible longer (aggregation feel without heavy bundling).
    const hub = THREE.MathUtils.clamp((airportDegree[ia] + airportDegree[ib]) / (2 * maxDegree), 0, 1)

    airportTraffic[ia] += trafficCount * traffic
    airportTraffic[ib] += trafficCount * traffic

    routeData.push({
      id: routeData.length,
      p0x: p0.x,
      p0y: p0.y,
      p0z: p0.z,
      p1x: mid.x,
      p1y: mid.y,
      p1z: mid.z,
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
      distanceKm,
      fromName: String(a.name || 'Origin'),
      toName: String(b.name || 'Destination'),
      fromLat: Number(a.latitude),
      fromLon: Number(a.longitude),
      toLat: Number(b.latitude),
      toLon: Number(b.longitude),
      isoA3: airportIso3[ia] ?? '',
      isoB3: airportIso3[ib] ?? ''
    })
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
    for (let i = 0; i < valid.length; i++) {
      const deg = airportDegree[i]
      if (deg <= 0) continue
      const deg01 = THREE.MathUtils.clamp(deg / maxDegree, 0, 1)
      const traf01 = THREE.MathUtils.clamp(airportTraffic[i] / maxTraffic, 0, 1)
      const score = deg01 * 0.62 + traf01 * 0.38
      scored.push({ idx: i, score, deg01, traf01 })
    }

    scored.sort((a, b) => b.score - a.score)
    const HUB_COUNT = Math.min(140, Math.max(40, Math.floor(Math.sqrt(routes.length) * 8)))
    const hubs = scored.slice(0, HUB_COUNT)

    const hubPositions = new Float32Array(hubs.length * 3)
    const hubColors = new Float32Array(hubs.length * 3)
    const hubSizes = new Float32Array(hubs.length)
    const hubSeeds = new Float32Array(hubs.length)

    const col = new THREE.Color()
    for (let i = 0; i < hubs.length; i++) {
      const h = hubs[i]
      const a = valid[h.idx]
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
        uColorMul: { value: new THREE.Color(1, 1, 1) },
        uAlphaMul: { value: 0.9 },
        uSizeMul: { value: scaleThickness(1.0) }
      }
    })
    hubsMat.name = 'flightHubsMaterial'

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
      uThreshold: { value: 0.16 },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 256) },
      uEdgeStrength: { value: 0.55 },
      uColdColor: { value: GOOGLE_COLORS.deepBlue.clone().multiplyScalar(0.34) },
      uMidColor: { value: GOOGLE_COLORS.lightBlue.clone().multiplyScalar(1.02) },
      uHotColor: { value: GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.32) }
    }
  })
  heatMat.name = 'flightHeatmapMaterial'
  const heatmap = new THREE.Mesh(heatGeo, heatMat)
  heatmap.name = 'flightHeatmap'
  heatmap.renderOrder = 1.5
  heatmap.frustumCulled = false
  heatmap.visible = false
  group.add(heatmap)

  // ---------------------------
  // Lines (batch in 1 draw call)
  // ---------------------------
  const lineVertexCount = routeData.length * segmentsPerRoute * 2
  const linePositions = new Float32Array(lineVertexCount * 3)
  const lineMotion = new Float32Array(lineVertexCount * 4) // t, speed, phase, seed
  const lineMeta = new Float32Array(lineVertexCount * 4) // traffic, focus, routeId, signed(1 + hub)

  const tmp0: number[] = [0, 0, 0]
  const tmp1: number[] = [0, 0, 0]

  let v = 0
  for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
    const r = routeData[rIndex]

    for (let i = 0; i < segmentsPerRoute; i++) {
      const t0 = i / segmentsPerRoute
      const t1 = (i + 1) / segmentsPerRoute

      bezierPointParam(tmp0, r, t0)
      bezierPointParam(tmp1, r, t1)

      const vi0 = v
      const vi1 = v + 1

      // vertex 0
      linePositions[vi0 * 3 + 0] = tmp0[0]
      linePositions[vi0 * 3 + 1] = tmp0[1]
      linePositions[vi0 * 3 + 2] = tmp0[2]
      lineMotion[vi0 * 4 + 0] = t0
      lineMotion[vi0 * 4 + 1] = r.speed
      lineMotion[vi0 * 4 + 2] = r.phase
      lineMotion[vi0 * 4 + 3] = r.seed
      lineMeta[vi0 * 4 + 0] = r.traffic
      lineMeta[vi0 * 4 + 1] = 1
      lineMeta[vi0 * 4 + 2] = r.id
      lineMeta[vi0 * 4 + 3] = r.dir * (1 + r.hub)

      // vertex 1
      linePositions[vi1 * 3 + 0] = tmp1[0]
      linePositions[vi1 * 3 + 1] = tmp1[1]
      linePositions[vi1 * 3 + 2] = tmp1[2]
      lineMotion[vi1 * 4 + 0] = t1
      lineMotion[vi1 * 4 + 1] = r.speed
      lineMotion[vi1 * 4 + 2] = r.phase
      lineMotion[vi1 * 4 + 3] = r.seed
      lineMeta[vi1 * 4 + 0] = r.traffic
      lineMeta[vi1 * 4 + 1] = 1
      lineMeta[vi1 * 4 + 2] = r.id
      lineMeta[vi1 * 4 + 3] = r.dir * (1 + r.hub)

      v += 2
    }
  }

  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  lineGeo.setAttribute('aMotion', new THREE.BufferAttribute(lineMotion, 4))
  lineGeo.setAttribute('aMeta', new THREE.BufferAttribute(lineMeta, 4))
  lineGeo.computeBoundingSphere()

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
      uBaseAlpha: { value: 0.074 },
      uGlowAlpha: { value: 0.56 },
      uTailLength: { value: 0.22 },
      uHeadWidth: { value: 0.028 },
      uFocusMix: { value: 0.0 },
      uRouteKeep: { value: 1.0 },
      uHoverRouteId: { value: -999 },
      uHoverMix: { value: 0.0 },
      uSelectedRouteId: { value: -999 },
      uSelectedMix: { value: 0.0 }
    }
  })
  lineMat.name = 'flightLinesMaterial'

  const lines = new THREE.LineSegments(lineGeo, lineMat)
  lines.renderOrder = 5
  lines.frustumCulled = false
  group.add(lines)

  // ---------------------------
  // Planes (batch in 1 draw call)
  // ---------------------------
  const planeGeo = new THREE.BufferGeometry()
  const MAX_PLANES_PER_ROUTE = 7
  const planeCount = routeData.length * MAX_PLANES_PER_ROUTE

  // Dummy position for Points geometry.
  // Actual animated position is computed in the vertex shader (bezier + time).
  const planePositions = new Float32Array(planeCount * 3)

  const planeP0 = new Float32Array(planeCount * 3)
  const planeP1 = new Float32Array(planeCount * 3)
  const planeP2 = new Float32Array(planeCount * 3)
  const planeMotion = new Float32Array(planeCount * 4) // speed, phase, offset, dir
  const planeVisual = new Float32Array(planeCount * 4) // size, seed, traffic, enable
  const planeMeta = new Float32Array(planeCount * 4) // focus, routeId, hub, spare

  function fract01(v: number) {
    return v - Math.floor(v)
  }

  for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
    const r = routeData[rIndex]
    const base = rIndex * MAX_PLANES_PER_ROUTE

    for (let j = 0; j < MAX_PLANES_PER_ROUTE; j++) {
      const idx = base + j

      // dummy position
      planePositions[idx * 3 + 0] = r.p0x
      planePositions[idx * 3 + 1] = r.p0y
      planePositions[idx * 3 + 2] = r.p0z

      // bezier control points
      planeP0[idx * 3 + 0] = r.p0x
      planeP0[idx * 3 + 1] = r.p0y
      planeP0[idx * 3 + 2] = r.p0z
      planeP1[idx * 3 + 0] = r.p1x
      planeP1[idx * 3 + 1] = r.p1y
      planeP1[idx * 3 + 2] = r.p1z
      planeP2[idx * 3 + 0] = r.p2x
      planeP2[idx * 3 + 1] = r.p2y
      planeP2[idx * 3 + 2] = r.p2z

      const enabled = j < r.trafficCount ? 1 : 0
      planeMeta[idx * 4 + 0] = 1
      planeMeta[idx * 4 + 1] = r.id
      planeMeta[idx * 4 + 2] = r.hub
      planeMeta[idx * 4 + 3] = 0

      // Spread planes along the route; add a small deterministic jitter.
      const denom = Math.max(1, r.trafficCount)
      const baseOffset = j / denom
      const jitter = (fract01(r.seed * 17.0 + j * 3.1) - 0.5) * 0.06
      const offset = fract01(baseOffset + jitter)

      // Subtle variety and traffic scaling.
      const sizeJitter = 0.94 - j * 0.06 + (fract01(r.seed * 11.0 + j * 1.7) - 0.5) * 0.08
      const size = r.size * sizeJitter
      const seed = fract01(r.seed + j * 0.23)

      planeMotion[idx * 4 + 0] = r.speed
      planeMotion[idx * 4 + 1] = r.phase
      planeMotion[idx * 4 + 2] = offset
      planeMotion[idx * 4 + 3] = r.dir

      planeVisual[idx * 4 + 0] = size
      planeVisual[idx * 4 + 1] = seed
      planeVisual[idx * 4 + 2] = r.traffic
      planeVisual[idx * 4 + 3] = enabled
    }
  }

  planeGeo.setAttribute('position', new THREE.BufferAttribute(planePositions, 3))
  planeGeo.setAttribute('aP0', new THREE.BufferAttribute(planeP0, 3))
  planeGeo.setAttribute('aP1', new THREE.BufferAttribute(planeP1, 3))
  planeGeo.setAttribute('aP2', new THREE.BufferAttribute(planeP2, 3))
  planeGeo.setAttribute('aMotion', new THREE.BufferAttribute(planeMotion, 4))
  planeGeo.setAttribute('aVisual', new THREE.BufferAttribute(planeVisual, 4))
  planeGeo.setAttribute('aMeta', new THREE.BufferAttribute(planeMeta, 4))
  planeGeo.computeBoundingSphere()

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
      uAlpha: { value: 1.14 },
      uFocusMix: { value: 0.0 },
      uRouteKeep: { value: 1.0 },
      uPlaneDensity: { value: 1.0 },
      uHoverRouteId: { value: -999 },
      uHoverMix: { value: 0.0 },
      uSelectedRouteId: { value: -999 },
      uSelectedMix: { value: 0.0 },
      uSizeMul: { value: scaleThickness(1.0) }
    }
  })
  planeMat.name = 'flightPlanesMaterial'

  const planes = new THREE.Points(planeGeo, planeMat)
  planes.renderOrder = 6
  planes.frustumCulled = false
  group.add(planes)

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
      uAlpha: { value: 1.1 }
    }
  })
  endpointsMat.name = 'flightEndpointsMaterial'

  const endpoints = new THREE.Points(endpointsGeo, endpointsMat)
  endpoints.renderOrder = 7
  endpoints.frustumCulled = false
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
  pinMat.name = 'flightPinMaterial'

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

  const routesByCountry = new Map<string, number[]>()
  for (let i = 0; i < routeData.length; i++) {
    const r = routeData[i]
    if (r.isoA3) {
      const list = routesByCountry.get(r.isoA3) ?? []
      list.push(i)
      routesByCountry.set(r.isoA3, list)
    }
    if (r.isoB3 && r.isoB3 !== r.isoA3) {
      const list = routesByCountry.get(r.isoB3) ?? []
      list.push(i)
      routesByCountry.set(r.isoB3, list)
    }
  }

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

    // Bezier midpoint (t=0.5): 0.25*p0 + 0.5*p1 + 0.25*p2
    const midX = r.p0x * 0.25 + r.p1x * 0.5 + r.p2x * 0.25
    const midY = r.p0y * 0.25 + r.p1y * 0.5 + r.p2y * 0.25
    const midZ = r.p0z * 0.25 + r.p1z * 0.5 + r.p2z * 0.25

    const idx = kind === 'hover' ? 0 : 1
    pinPositions[idx * 3 + 0] = midX
    pinPositions[idx * 3 + 1] = midY
    pinPositions[idx * 3 + 2] = midZ

    ;(pinGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  const verticesPerRoute = segmentsPerRoute * 2
  function applyFocusMask() {
    if (!focusIso3) {
      for (let i = 0; i < lineVertexCount; i++) {
        lineMeta[i * 4 + 1] = 1
      }
      for (let i = 0; i < planeCount; i++) {
        planeMeta[i * 4 + 0] = 1
      }
    } else {
      for (let rIndex = 0; rIndex < routeData.length; rIndex++) {
        const r = routeData[rIndex]
        const hit = r.isoA3 === focusIso3 || r.isoB3 === focusIso3 ? 1 : 0
        const base = rIndex * verticesPerRoute
        for (let j = 0; j < verticesPerRoute; j++) {
          lineMeta[(base + j) * 4 + 1] = hit
        }
        const basePlane = rIndex * MAX_PLANES_PER_ROUTE
        for (let k = 0; k < MAX_PLANES_PER_ROUTE; k++) {
          planeMeta[(basePlane + k) * 4 + 0] = hit
        }
      }
    }

    ;(lineGeo.getAttribute('aMeta') as THREE.BufferAttribute).needsUpdate = true
    ;(planeGeo.getAttribute('aMeta') as THREE.BufferAttribute).needsUpdate = true
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
      if (SHOW_HOVER_ENDPOINTS) {
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
      setEndpointPositions('selected', routeId)
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

    // Bezier midpoint (t=0.5): 0.25*p0 + 0.5*p1 + 0.25*p2
    const midX = r.p0x * 0.25 + r.p1x * 0.5 + r.p2x * 0.25
    const midY = r.p0y * 0.25 + r.p1y * 0.5 + r.p2y * 0.25
    const midZ = r.p0z * 0.25 + r.p1z * 0.5 + r.p2z * 0.25

    return {
      id: r.id,
      fromName: r.fromName,
      toName: r.toName,
      fromLat: r.fromLat,
      fromLon: r.fromLon,
      toLat: r.toLat,
      toLon: r.toLon,
      distanceKm: r.distanceKm,
      traffic: r.traffic,
      trafficCount: r.trafficCount,
      dir: r.dir,
      midX,
      midY,
      midZ,
      isoA3: r.isoA3,
      isoB3: r.isoB3
    }
  }

  function computeCountryFlightsAtTime(routeIds: number[], timeSeconds: number) {
    // This is a *synthetic* but stable metric derived from our current simulated network:
    // - more routes + higher traffic => higher baseline
    // - time-varying modulation => plausible "now" vs "10 minutes ago" change
    //
    // We keep it deterministic and smooth so the UI doesn't jump around.
    let sum = 0

    for (let i = 0; i < routeIds.length; i++) {
      const r = routeData[routeIds[i]]
      if (!r) continue

      // Two slow waves + one per-route wobble.
      const w1 = 0.6 + 0.4 * Math.sin(timeSeconds * 0.019 + r.seed * 11.7)
      const w2 = 0.65 + 0.35 * Math.sin(timeSeconds * 0.007 + r.phase * Math.PI * 2 + r.seed * 3.9)
      const w3 = 0.75 + 0.25 * Math.sin(timeSeconds * 0.003 + r.id * 0.8)
      const activity = THREE.MathUtils.clamp((w1 * 0.46 + w2 * 0.38 + w3 * 0.16), 0.18, 1.15)

      // Higher traffic routes contribute a bit more (without exploding).
      const trafficBoost = THREE.MathUtils.clamp(0.85 + (r.traffic - 0.62) * 0.25, 0.82, 1.05)

      sum += r.trafficCount * activity * trafficBoost
    }

    return Math.max(0, Math.round(sum))
  }

  function getCountryFlightStats(iso3: string, timeSeconds: number): CountryFlightStats {
    const key = (iso3 || '').trim()
    const routeIds = key ? routesByCountry.get(key) ?? [] : []

    const now = computeCountryFlightsAtTime(routeIds, timeSeconds)
    const tenMinAgo = computeCountryFlightsAtTime(routeIds, timeSeconds - 600)

    return {
      now,
      tenMinAgo,
      routes: routeIds.length
    }
  }

  function setHeatmapEnabled(enabled: boolean) {
    heatTarget = enabled ? 1 : 0
    if (enabled) {
      heatmap.visible = true
    }
  }

  // Update positions + uniforms.
  function update(deltaSeconds: number, timeSeconds: number, cameraDistance: number) {
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

    planeMat.uniforms.uHoverRouteId.value = hoverRouteId
    planeMat.uniforms.uHoverMix.value = hoverMix
    planeMat.uniforms.uSelectedRouteId.value = selectedRouteId
    planeMat.uniforms.uSelectedMix.value = selectedMix

    endpointsMat.uniforms.uTime.value = timeSeconds
    endpointsMat.uniforms.uCameraDistance.value = cameraDistance
    endpointsMat.uniforms.uHoverMix.value = SHOW_HOVER_ENDPOINTS ? hoverMix : 0
    endpointsMat.uniforms.uSelectedMix.value = selectedMix
    endpointsMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(
      1.02,
      1.42,
      THREE.MathUtils.clamp(selectedMix, 0, 1)
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

      const zoom = THREE.MathUtils.clamp((32 - cameraDistance) / 16, 0, 1)
      const zoomOut = 1.0 - zoom
      const base = THREE.MathUtils.lerp(0.68, 1.12, zoomOut)
      const focusFade = THREE.MathUtils.lerp(1.0, 0.72, focusMix)
      const selectedFade = THREE.MathUtils.lerp(1.0, 0.82, selectedMix)
      hubsMat.uniforms.uAlphaMul.value = base * focusFade * selectedFade
    }

    // uniforms
    lineMat.uniforms.uTime.value = timeSeconds
    lineMat.uniforms.uCameraDistance.value = cameraDistance
    planeMat.uniforms.uTime.value = timeSeconds
    planeMat.uniforms.uCameraDistance.value = cameraDistance

    // Heatmap uniforms
    heatMat.uniforms.uTime.value = timeSeconds
    heatMat.uniforms.uCameraDistance.value = cameraDistance

    // LOD: keep it subtle at distance; richer near the globe.
    const zoom = THREE.MathUtils.clamp((32 - cameraDistance) / 16, 0, 1)
    const routeKeep = THREE.MathUtils.lerp(0.55, 1.0, zoom)
    const planeDensity = THREE.MathUtils.lerp(0.72, 1.0, zoom)
    lineMat.uniforms.uRouteKeep.value = routeKeep
    planeMat.uniforms.uRouteKeep.value = routeKeep
    planeMat.uniforms.uPlaneDensity.value = planeDensity

    // Heatmap: stronger when zoomed out; slightly reduced during country focus or route selection.
    const kHeat = 1.0 - Math.exp(-deltaSeconds * 3.6)
    heatMix += (heatTarget - heatMix) * kHeat
    if (heatTarget === 0 && heatMix < 0.002) {
      heatMix = 0
      heatmap.visible = false
    }

    const zoomOut = 1.0 - zoom
    const baseHeatOpacity = THREE.MathUtils.lerp(0.03, 0.10, zoomOut)
    const focusFade = THREE.MathUtils.lerp(1.0, 0.55, focusMix)
    const selectedFade = THREE.MathUtils.lerp(1.0, 0.72, selectedMix)
    heatMat.uniforms.uOpacity.value = baseHeatOpacity * focusFade * selectedFade * heatMix

    lineMat.uniforms.uTailLength.value = THREE.MathUtils.clamp(
      scaleThickness(THREE.MathUtils.lerp(0.16, 0.28, zoom)),
      0.02,
      0.5
    )
    const hoverBoost = THREE.MathUtils.lerp(1.0, 1.42, hoverMix * (1.0 - selectedMix * 0.35))
    const selectedBoost = THREE.MathUtils.lerp(1.0, 1.88, selectedMix)
    lineMat.uniforms.uGlowAlpha.value = THREE.MathUtils.lerp(0.30, 0.66, zoom) * hoverBoost * selectedBoost
    lineMat.uniforms.uBaseAlpha.value = THREE.MathUtils.lerp(0.052, 0.096, zoom) * THREE.MathUtils.lerp(1.0, 1.30, selectedMix)
    lineMat.uniforms.uHeadWidth.value = THREE.MathUtils.clamp(
      scaleThickness(THREE.MathUtils.lerp(0.022, 0.034, zoom) * THREE.MathUtils.lerp(1.0, 1.30, Math.max(hoverMix, selectedMix))),
      0.004,
      0.1
    )
    planeMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(0.96, 1.22, zoom) * THREE.MathUtils.lerp(1.0, 1.26, Math.max(hoverMix, selectedMix))
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
    lines,
    planes
  }
}
