type InMsg = {
  routes: Float32Array
}

const ROUTE_STRIDE = 19

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function routePoint(routes: Float32Array, offset: number, t: number, out: Float32Array) {
  const omt = 1 - t
  const omt2 = omt * omt
  const tt = t * t
  const k0 = omt2
  const k1 = 2 * omt * t
  const k2 = tt

  const p0x = routes[offset + 0]
  const p0y = routes[offset + 1]
  const p0z = routes[offset + 2]
  const p1x = routes[offset + 3]
  const p1y = routes[offset + 4]
  const p1z = routes[offset + 5]
  const p2x = routes[offset + 6]
  const p2y = routes[offset + 7]
  const p2z = routes[offset + 8]

  out[0] = p0x * k0 + p1x * k1 + p2x * k2
  out[1] = p0y * k0 + p1y * k1 + p2y * k2
  out[2] = p0z * k0 + p1z * k1 + p2z * k2

  const minShell =
    Math.min(
      Math.hypot(p0x, p0y, p0z),
      Math.hypot(p2x, p2y, p2z)
    ) * 0.995

  const len = Math.hypot(out[0], out[1], out[2])
  if (len < 1e-6) {
    const fx = p0x + p2x
    const fy = p0y + p2y
    const fz = p0z + p2z
    const fl = Math.hypot(fx, fy, fz)
    if (fl > 1e-6) {
      out[0] = (fx / fl) * minShell
      out[1] = (fy / fl) * minShell
      out[2] = (fz / fl) * minShell
    } else {
      const p0l = Math.hypot(p0x, p0y, p0z)
      const sx = p0l > 1e-6 ? p0x / p0l : 0
      const sy = p0l > 1e-6 ? p0y / p0l : 1
      const sz = p0l > 1e-6 ? p0z / p0l : 0
      out[0] = sx * minShell
      out[1] = sy * minShell
      out[2] = sz * minShell
    }
    return
  }

  if (len < minShell) {
    const scale = minShell / len
    out[0] *= scale
    out[1] *= scale
    out[2] *= scale
  }
}

function vectorToLatLon(x: number, y: number, z: number) {
  const len = Math.hypot(x, y, z)
  if (len < 1e-9) {
    return { lat: 0, lon: 0 }
  }

  const nx = x / len
  const ny = clamp(y / len, -1, 1)
  const nz = z / len
  let lon = Math.atan2(nz, -nx) * (180 / Math.PI) - 180
  while (lon < -180) lon += 360
  while (lon > 180) lon -= 360
  return {
    lat: Math.asin(ny) * (180 / Math.PI),
    lon
  }
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const routes = ev.data.routes
  const routeCount = Math.floor(routes.length / ROUTE_STRIDE)
  const density = new Float32Array(routeCount)
  const corridorKeep = new Float32Array(routeCount)
  const corridorGroup = new Float32Array(routeCount)
  const importance = new Float32Array(routeCount)

  if (routeCount === 0) {
    ;(self as any).postMessage(
      {
        density: density.buffer,
        corridorKeep: corridorKeep.buffer,
        corridorGroup: corridorGroup.buffer,
        importance: importance.buffer
      },
      [density.buffer, corridorKeep.buffer, corridorGroup.buffer, importance.buffer]
    )
    return
  }

  const width = routeCount > 10000 ? 192 : 160
  const height = Math.floor(width / 2)
  const counts = new Uint16Array(width * height)
  const densitySampleCount = routeCount > 12000 ? 6 : routeCount > 6000 ? 8 : 10
  const samplePoint = new Float32Array(3)

  const countIndex = (lat: number, lon: number) => {
    const u = ((lon + 180) / 360 + 1) % 1
    const v = clamp((lat + 90) / 180, 0, 1)
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)))
    const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)))
    return y * width + x
  }

  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const offset = routeIndex * ROUTE_STRIDE
    for (let sampleIndex = 0; sampleIndex < densitySampleCount; sampleIndex++) {
      const t = densitySampleCount <= 1 ? 0 : sampleIndex / (densitySampleCount - 1)
      routePoint(routes, offset, t, samplePoint)
      const latLon = vectorToLatLon(samplePoint[0], samplePoint[1], samplePoint[2])
      const idx = countIndex(latLon.lat, latLon.lon)
      counts[idx] = Math.min(65535, counts[idx] + 1)
    }
  }

  let maxRawDensity = 0
  const rawDensity = new Float32Array(routeCount)
  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const offset = routeIndex * ROUTE_STRIDE
    let sum = 0
    let maxCell = 0

    for (let sampleIndex = 0; sampleIndex < densitySampleCount; sampleIndex++) {
      const t = densitySampleCount <= 1 ? 0 : sampleIndex / (densitySampleCount - 1)
      routePoint(routes, offset, t, samplePoint)
      const latLon = vectorToLatLon(samplePoint[0], samplePoint[1], samplePoint[2])
      const cellCount = Math.max(0, counts[countIndex(latLon.lat, latLon.lon)] - 1)
      sum += cellCount
      maxCell = Math.max(maxCell, cellCount)
    }

    const avgCell = sum / densitySampleCount
    const raw = avgCell * 0.68 + maxCell * 0.32
    rawDensity[routeIndex] = raw
    maxRawDensity = Math.max(maxRawDensity, raw)
  }

  const densityNorm = Math.log1p(Math.max(1, maxRawDensity))
  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    density[routeIndex] =
      densityNorm > 1e-6
        ? clamp(Math.pow(Math.log1p(rawDensity[routeIndex]) / densityNorm, 0.9), 0, 1)
        : 0
  }

  const stepDeg = routeCount > 14000 ? 3.5 : routeCount > 9000 ? 3.0 : routeCount > 5000 ? 2.5 : 2.0
  const groups = new Map<string, number[]>()

  const quantizeCell = (lat: number, lon: number) => {
    const latKey = Math.round(lat / stepDeg)
    const lonKey = Math.round(lon / stepDeg)
    return `${latKey},${lonKey}`
  }

  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const offset = routeIndex * ROUTE_STRIDE
    routePoint(routes, offset, 0.5, samplePoint)
    const mid = vectorToLatLon(samplePoint[0], samplePoint[1], samplePoint[2])

    const fromCell = quantizeCell(routes[offset + 9], routes[offset + 10])
    const toCell = quantizeCell(routes[offset + 11], routes[offset + 12])
    const midCell = quantizeCell(mid.lat, mid.lon)
    const edgeA = fromCell < toCell ? fromCell : toCell
    const edgeB = fromCell < toCell ? toCell : fromCell
    const key = `${edgeA}|${edgeB}|${midCell}`

    const list = groups.get(key) ?? []
    list.push(routeIndex)
    groups.set(key, list)
  }

  for (const groupRoutes of groups.values()) {
    groupRoutes.sort((a, b) => {
      const offsetA = a * ROUTE_STRIDE
      const offsetB = b * ROUTE_STRIDE
      const trafficA = clamp((routes[offsetA + 13] - 0.62) / (1.22 - 0.62), 0, 1)
      const trafficB = clamp((routes[offsetB + 13] - 0.62) / (1.22 - 0.62), 0, 1)
      const distanceA = clamp((routes[offsetA + 17] - 350) / 9000, 0, 1)
      const distanceB = clamp((routes[offsetB + 17] - 350) / 9000, 0, 1)
      const scoreA =
        routes[offsetA + 15] * 0.34 +
        routes[offsetA + 16] * 0.24 +
        distanceA * 0.22 +
        trafficA * 0.20
      const scoreB =
        routes[offsetB + 15] * 0.34 +
        routes[offsetB + 16] * 0.24 +
        distanceB * 0.22 +
        trafficB * 0.20
      if (scoreA !== scoreB) return scoreB - scoreA
      return a - b
    })

    const group01 = clamp((groupRoutes.length - 1) / 8, 0, 1)
    for (let i = 0; i < groupRoutes.length; i++) {
      const routeIndex = groupRoutes[i]
      corridorKeep[routeIndex] = clamp(1 - i / Math.max(1, groupRoutes.length), 0, 1)
      corridorGroup[routeIndex] = group01
    }
  }

  let maxTrafficCount = 1
  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    maxTrafficCount = Math.max(maxTrafficCount, routes[routeIndex * ROUTE_STRIDE + 14])
  }

  let minImportanceRaw = Number.POSITIVE_INFINITY
  let maxImportanceRaw = Number.NEGATIVE_INFINITY
  const rawImportance = new Float32Array(routeCount)

  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const offset = routeIndex * ROUTE_STRIDE
    const traffic01 = clamp((routes[offset + 13] - 0.68) / (1.34 - 0.68), 0, 1)
    const trafficCount01 = clamp((routes[offset + 14] - 1) / Math.max(1, maxTrafficCount - 1), 0, 1)
    const distance01 = clamp((routes[offset + 17] - 350) / 9000, 0, 1)
    const corridorRep = clamp(
      corridorKeep[routeIndex] * (0.62 + corridorGroup[routeIndex] * 0.38),
      0,
      1
    )
    const raw =
      routes[offset + 15] * 0.19 +
      traffic01 * 0.22 +
      trafficCount01 * 0.08 +
      corridorRep * 0.18 +
      density[routeIndex] * 0.14 +
      routes[offset + 16] * 0.07 +
      distance01 * 0.06 +
      routes[offset + 18] * 0.16

    rawImportance[routeIndex] = raw
    minImportanceRaw = Math.min(minImportanceRaw, raw)
    maxImportanceRaw = Math.max(maxImportanceRaw, raw)
  }

  const importanceSpan = maxImportanceRaw - minImportanceRaw
  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const normalized = importanceSpan > 1e-6 ? (rawImportance[routeIndex] - minImportanceRaw) / importanceSpan : 0.5
    importance[routeIndex] = clamp(Math.pow(normalized, 0.82), 0, 1)
  }

  ;(self as any).postMessage(
    {
      density: density.buffer,
      corridorKeep: corridorKeep.buffer,
      corridorGroup: corridorGroup.buffer,
      importance: importance.buffer
    },
    [density.buffer, corridorKeep.buffer, corridorGroup.buffer, importance.buffer]
  )
}
