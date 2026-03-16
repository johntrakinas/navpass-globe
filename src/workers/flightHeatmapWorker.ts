// WebWorker: builds a heatmap texture (RGBA8) from packed route params.
//
// Message in:
//   { routes: Float32Array, width: number, height: number }
//
// routes stride (14 floats):
//   p0x,p0y,p0z, p1x,p1y,p1z, p2x,p2y,p2z, curve0,curve1,curve2, traffic, trafficCount
//
// Message out:
//   { data: ArrayBuffer }

type InMsg = {
  routes: Float32Array
  width: number
  height: number
}

const ROUTE_STRIDE = 14
const SAMPLES_PER_ROUTE = 84

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

  if (sum > 0) {
    for (let i = 0; i < taps.length; i++) {
      taps[i].w /= sum
    }
  }

  return taps
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function powFast(v: number, e: number) {
  return Math.pow(v, e)
}

function routePoint(
  p0x: number,
  p0y: number,
  p0z: number,
  p1x: number,
  p1y: number,
  p1z: number,
  p2x: number,
  p2y: number,
  p2z: number,
  arcHeight: number,
  lateralOffsetRad: number,
  loopSweepRad: number,
  t: number
) {
  void arcHeight
  void lateralOffsetRad
  void loopSweepRad

  const omt = 1 - t
  const p = [
    p0x * (omt * omt) + p1x * (2 * omt * t) + p2x * (t * t),
    p0y * (omt * omt) + p1y * (2 * omt * t) + p2y * (t * t),
    p0z * (omt * omt) + p1z * (2 * omt * t) + p2z * (t * t)
  ] as const

  const minShell =
    Math.min(
      Math.sqrt(p0x * p0x + p0y * p0y + p0z * p0z),
      Math.sqrt(p2x * p2x + p2y * p2y + p2z * p2z)
    ) * 0.995
  const len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2])
  if (len < 1e-9) {
    const fx = p0x + p2x
    const fy = p0y + p2y
    const fz = p0z + p2z
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz)
    if (fl > 1e-9) {
      return [(fx / fl) * minShell, (fy / fl) * minShell, (fz / fl) * minShell] as const
    }
    return null
  }

  if (len < minShell) {
    const scale = minShell / len
    return [p[0] * scale, p[1] * scale, p[2] * scale] as const
  }

  return p
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const routes = ev.data.routes
  const width = Math.max(1, Math.floor(ev.data.width))
  const height = Math.max(1, Math.floor(ev.data.height))

  const heat = new Float32Array(width * height)
  const kernel = buildGaussianKernel(4, 2.15)

  const routeCount = Math.floor(routes.length / ROUTE_STRIDE)
  const invSamples = 1 / Math.max(1, SAMPLES_PER_ROUTE)
  const twoPi = Math.PI * 2
  const invTwoPi = 1 / twoPi
  const invPi = 1 / Math.PI

  for (let i = 0; i < routeCount; i++) {
    const o = i * ROUTE_STRIDE
    const p0x = routes[o + 0]
    const p0y = routes[o + 1]
    const p0z = routes[o + 2]
    const p1x = routes[o + 3]
    const p1y = routes[o + 4]
    const p1z = routes[o + 5]
    const p2x = routes[o + 6]
    const p2y = routes[o + 7]
    const p2z = routes[o + 8]
    const arcHeight = routes[o + 9]
    const lateralOffsetRad = routes[o + 10]
    const loopSweepRad = routes[o + 11]
    const traffic = routes[o + 12]
    const trafficCount = routes[o + 13]

    // Same weighting used in the main thread version.
    const traffic01 = clamp((traffic - 0.62) / (1.22 - 0.62), 0, 1)
    const routeWeight = trafficCount * (0.75 + traffic01 * 0.55)
    const perSample = routeWeight * invSamples

    for (let s = 0; s < SAMPLES_PER_ROUTE; s++) {
      const t = s / (SAMPLES_PER_ROUTE - 1)
      const point = routePoint(
        p0x, p0y, p0z,
        p1x, p1y, p1z,
        p2x, p2y, p2z,
        arcHeight, lateralOffsetRad, loopSweepRad,
        t
      )
      if (!point) continue
      const len = Math.sqrt(point[0] * point[0] + point[1] * point[1] + point[2] * point[2])
      if (len < 1e-9) continue
      const x = point[0] / len
      const y = point[1] / len
      const z = point[2] / len

      // Matches vector3ToLatLon + (lon + 180) mapping:
      // theta = atan2(z, -x) in [-pi, pi], u = theta / (2pi) wrapped to [0,1)
      const theta = Math.atan2(z, -x)
      let u = theta * invTwoPi
      u = u - Math.floor(u)

      // v = (asin(y) / pi) + 0.5
      let v = Math.asin(clamp(y, -1, 1)) * invPi + 0.5
      v = clamp(v, 0, 1)

      const cx = (u * width) | 0
      const cy = (v * height) | 0

      for (let k = 0; k < kernel.length; k++) {
        const tap = kernel[k]
        const xx = (cx + tap.dx + width) % width
        const yy = Math.max(0, Math.min(height - 1, cy + tap.dy))
        heat[yy * width + xx] += perSample * tap.w
      }
    }
  }

  let max = 0
  for (let i = 0; i < heat.length; i++) {
    if (heat[i] > max) max = heat[i]
  }
  max = Math.max(1e-6, max)

  const out = new Uint8Array(width * height * 4)
  for (let i = 0; i < heat.length; i++) {
    let v = heat[i] / max
    v = clamp(v, 0, 1)
    v = powFast(v, 0.55)

    const b = (v * 255 + 0.5) | 0
    const o = i * 4
    out[o + 0] = b
    out[o + 1] = b
    out[o + 2] = b
    out[o + 3] = 255
  }

  ;(self as any).postMessage({ data: out.buffer }, [out.buffer])
}
