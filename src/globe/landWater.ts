import * as THREE from 'three'
import { GOOGLE_COLORS } from '../theme/googleColors'

function projectLonLatToUv(lon: number, lat: number) {
  const u = (lon + 180) / 360
  const v = (90 - lat) / 180
  return { u, v }
}

function unwrapRingLon(ring: [number, number][]) {
  if (ring.length === 0) return []

  const out: [number, number][] = []
  let prev = ring[0][0]
  let offset = 0
  out.push([prev, ring[0][1]])

  for (let i = 1; i < ring.length; i++) {
    const lon = ring[i][0]
    const lat = ring[i][1]

    // Keep longitudinal continuity (avoid long edges across the dateline).
    let d = lon + offset - prev
    if (d > 180) offset -= 360
    else if (d < -180) offset += 360

    const adj = lon + offset
    out.push([adj, lat])
    prev = adj
  }

  return out
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  width: number,
  height: number,
  xOffset: number
) {
  const unwrapped = unwrapRingLon(ring)
  if (unwrapped.length === 0) return

  for (let i = 0; i < unwrapped.length; i++) {
    const [lon, lat] = unwrapped[i]
    const { u, v } = projectLonLatToUv(lon, lat)
    const x = u * width + xOffset
    const y = v * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function buildLandMaskTexture(geojson: any, width = 1024, height = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D canvas context not available (land mask)')
  }

  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, width, height)

  // Sea = black
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Land = white
  ctx.fillStyle = '#fff'

  // Draw each polygon with an x-wrapped copy so dateline-crossing countries don't create artifacts.
  const xOffsets = [-width, 0, width]

  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry
    if (!geom) continue

    const polys: any[] =
      geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : []

    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) continue

      for (const xOffset of xOffsets) {
        ctx.beginPath()

        // GeoJSON Polygon rings: [outer, hole1, hole2...]
        const outer = poly[0] as [number, number][]
        drawRing(ctx, outer, width, height, xOffset)

        for (let i = 1; i < poly.length; i++) {
          drawRing(ctx, poly[i] as [number, number][], width, height, xOffset)
        }

        // Even-odd handles holes without needing to reason about winding.
        ctx.fill('evenodd')
        // Keep only fill here; coastline accent is handled in shader to avoid hard white outlines.
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  // Canvas textures default to flipY=true (like images). Our UV mapping already
  // uses v=0 at the north pole, matching how we rasterize the mask in canvas,
  // so we must disable flip to avoid a vertically inverted world.
  tex.flipY = false
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return { texture: tex, width, height }
}

const VERT = /* glsl */ `
varying vec3 vObjNormal;
varying vec3 vWorldPos;

void main() {
  // IMPORTANT: Use object-space normal for UV mapping so the land mask rotates WITH the globe.
  // If we used world normals here, the mask would look "static" as the globe rotates.
  vObjNormal = normalize(normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
precision mediump float;

uniform sampler2D uLandMask;
uniform vec3 uLandTint;
uniform vec3 uCoastTint;
uniform float uLandAlpha;
uniform float uCoastAlpha;
uniform vec2 uTexel;

varying vec3 vObjNormal;
varying vec3 vWorldPos;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

vec2 sphericalUv(vec3 n) {
  float theta = atan(n.z, -n.x); // matches latLongToVector3() theta = lon + 180
  if (theta < 0.0) theta += TAU;
  float u = theta / TAU;
  float v = acos(clamp(n.y, -1.0, 1.0)) / PI; // 0=north, 1=south
  return vec2(u, v);
}

void main() {
  vec3 n = normalize(vObjNormal);
  vec2 uv = sphericalUv(n);

  float m0 = texture2D(uLandMask, uv).r;
  float mx1 = texture2D(uLandMask, uv + vec2(uTexel.x, 0.0)).r;
  float mx2 = texture2D(uLandMask, uv - vec2(uTexel.x, 0.0)).r;
  float my1 = texture2D(uLandMask, uv + vec2(0.0, uTexel.y)).r;
  float my2 = texture2D(uLandMask, uv - vec2(0.0, uTexel.y)).r;

  // Tiny blur to soften coasts and avoid pixelly edges at low-res masks.
  float blur = (m0 + mx1 + mx2 + my1 + my2) * 0.2;
  float land = smoothstep(0.35, 0.65, blur);

  // Coastline hint (very subtle).
  float grad = abs(mx1 - mx2) + abs(my1 - my2);
  float boundary = blur * (1.0 - blur) * 4.0; // 0..1-ish, peaks at coastline
  boundary = smoothstep(0.12, 0.72, boundary);
  float coast = smoothstep(0.12, 0.34, grad) * boundary;

  // We do NOT fully paint the globe (that looks like a "static map sticker").
  // Instead, we overlay a subtle land tint + a slightly brighter coastline hint.
  vec3 color = mix(uLandTint, uCoastTint, coast);
  float alpha = land * uLandAlpha + coast * uCoastAlpha;

  // Subtle breakup so it feels like a rendered layer, not a flat print.
  float seed = fract(sin(dot(vWorldPos.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  alpha *= 0.92 + 0.08 * seed;

  gl_FragColor = vec4(color, alpha);
}
`

export function createLandWaterLayer(geojson: any, radius: number) {
  const { texture, width, height } = buildLandMaskTexture(geojson, 2048, 1024)

  // Slightly above the depth mask so it's always visible, but it does NOT write depth
  // (depth mask sphere is still the source of truth for occlusion).
  const geometry = new THREE.SphereGeometry(radius * 1.0009, 96, 96)

  const ocean = new THREE.Color('#12203a')
  const landTint = ocean.clone().lerp(GOOGLE_COLORS.lightBlue, 0.38)
  const coastTint = landTint.clone().lerp(GOOGLE_COLORS.white, 0.3)

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uLandMask: { value: texture },
      uLandTint: { value: landTint },
      uCoastTint: { value: coastTint },
      // Disabled by default: country differentiation is done by border lines only.
      uLandAlpha: { value: 0.0 },
      uCoastAlpha: { value: 0.0 },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) }
    }
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'landWater'
  mesh.renderOrder = 0.9
  mesh.frustumCulled = false

  return { mesh, material, texture }
}
