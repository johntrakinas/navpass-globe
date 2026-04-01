import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { latLongToVector3 } from './latLongtoVector3'
import { computeCountryStrokeScale } from './countryStrokeScale'

export type CountryHighlightPaletteTheme = {
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  colorC?: THREE.ColorRepresentation
  colorD?: THREE.ColorRepresentation
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const selectedPalette = {
  a: new THREE.Color('#ffffff'),
  b: new THREE.Color('#FBBC05'),
  c: new THREE.Color('#ffffff'),
  d: new THREE.Color('#FBBC05')
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SELECT_RADIUS_MULT = 1.004
const SELECT_SCALE = 1.02
const SELECT_BREATH_AMP = 0.006
const SUBDIVIDE_N = 4

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

type CoreMat = LineMaterial | THREE.LineBasicMaterial

let highlightRenderMode: 'line2' | 'line' = 'line2'
let current: THREE.Object3D | null = null
let currentMats: CoreMat[] = []
let currentCoreMat: CoreMat | null = null
let selectBackingMat: LineMaterial | null = null
let selectBackingEnabled = false
let pulsePhase = Math.random() * Math.PI * 2
let selectedBorderLineWidthHint = 1.8
let activeFeatureStrokeScale = 1

// ---------------------------------------------------------------------------
// Palette animation (JS-side replica of googlePaletteSmooth)
// ---------------------------------------------------------------------------

const _mix1 = new THREE.Color()
const _mix2 = new THREE.Color()

function googlePaletteJs(t: number): THREE.Color {
  const sinT = 0.5 + 0.5 * Math.sin(t * Math.PI * 2)
  const cosT = 0.5 + 0.5 * Math.cos(t * Math.PI)
  _mix1.lerpColors(selectedPalette.a, selectedPalette.b, sinT)
  _mix2.lerpColors(selectedPalette.c, selectedPalette.d, sinT)
  _mix1.lerp(_mix2, cosT)
  return _mix1
}

function computeAnimatedColor(timeSeconds: number): THREE.Color {
  const flow    = timeSeconds * 0.06
  const hue     = flow - Math.floor(flow)
  const shimmer = 0.75 + 0.25 * Math.sin((flow + timeSeconds * 0.18) * Math.PI * 2)
  const col     = googlePaletteJs(hue)
  col.multiplyScalar(shimmer)
  return col
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * LineSegments2 (parent of Line2) calls onBeforeRender each frame and sets
 * material.uniforms.resolution to renderer.getViewport() — which is in
 * PHYSICAL pixels. linewidth must therefore also be in physical pixels.
 */
function dpr(): number {
  return Math.max(1, window.devicePixelRatio ?? 1)
}

function computeLineWidth(): number {
  const cssWidth = THREE.MathUtils.clamp(selectedBorderLineWidthHint * activeFeatureStrokeScale, 0.35, 20)
  return cssWidth * dpr()
}

function createCoreMat(): LineMaterial {
  return new LineMaterial({
    color: 0xffffff,
    linewidth: computeLineWidth(),
    worldUnits: false,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false
  })
}

/**
 * Linearly subdivide a ring of THREE.Vector3 points.
 * Each segment [a, b] becomes N sub-segments, preserving exact geometry.
 * GeoJSON rings are closed (first === last), so we skip the duplicate tail.
 */
function subdivideRing(pts: THREE.Vector3[]): THREE.Vector3[] {
  if (pts.length < 2) return pts
  const last     = pts[pts.length - 1]
  const isClosed = last.distanceToSquared(pts[0]) < 1e-10
  const src      = isClosed ? pts.slice(0, -1) : pts
  const out: THREE.Vector3[] = []
  const tmp = new THREE.Vector3()
  for (let i = 0; i < src.length; i++) {
    const a = src[i]
    const b = src[(i + 1) % src.length]
    out.push(a.clone())
    for (let s = 1; s < SUBDIVIDE_N; s++) {
      out.push(tmp.lerpVectors(a, b, s / SUBDIVIDE_N).clone())
    }
  }
  return out
}

function createLegacyCoreMat(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending
  })
}

function buildLineLegacy(pts: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const line = new THREE.LineLoop(geo, mat)
  line.frustumCulled = false
  return line
}

/** Build a closed Line2 from subdivided ring points. */
function buildLine2(pts: THREE.Vector3[], mat: LineMaterial): Line2 {
  const flat: number[] = []
  for (const p of pts) flat.push(p.x, p.y, p.z)
  // Close the loop
  flat.push(flat[0], flat[1], flat[2])
  const geo = new LineGeometry()
  geo.setPositions(flat)
  const line = new Line2(geo, mat)
  line.frustumCulled = false
  return line
}

/** Build flat position arrays (closed) for each ring of a feature. */
function featureToFlatRings(feature: any, radius: number): number[][] {
  const result: number[][] = []
  const geom  = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
  for (const poly of polys) {
    for (const ring of poly) {
      const raw: THREE.Vector3[] = []
      for (const [lng, lat] of ring) {
        raw.push(latLongToVector3(lat, lng, radius * SELECT_RADIUS_MULT))
      }
      if (raw.length < 2) continue
      const subdivided = subdivideRing(raw)
      const flat: number[] = []
      for (const p of subdivided) flat.push(p.x, p.y, p.z)
      if (flat.length < 6) continue
      // Close loop
      flat.push(flat[0], flat[1], flat[2])
      result.push(flat)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function highlightCountryFromFeature(
  feature: any,
  parent: THREE.Object3D,
  radius: number
) {
  if (current) clearHighlight(parent)

  activeFeatureStrokeScale = computeCountryStrokeScale(feature)
  pulsePhase = Math.random() * Math.PI * 2

  const group = new THREE.Group()
  const geom  = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  // Optional thick backing
  if (selectBackingEnabled) {
    selectBackingMat = new LineMaterial({
      color: 0x201000,
      transparent: true,
      opacity: 0.55,
      linewidth: 10 * dpr(),
      worldUnits: false,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
    const backingGroup = new THREE.Group()
    for (const flat of featureToFlatRings(feature, radius)) {
      const geo  = new LineGeometry()
      geo.setPositions(flat)
      const line = new Line2(geo, selectBackingMat)
      line.renderOrder = 7
      line.frustumCulled = false
      backingGroup.add(line)
    }
    group.add(backingGroup)
  }

  if (highlightRenderMode === 'line2') {
    const mat = createCoreMat()
    currentCoreMat = mat
    currentMats = [mat]
    for (const poly of polys) {
      for (const ring of poly) {
        const raw: THREE.Vector3[] = []
        for (const [lng, lat] of ring) {
          raw.push(latLongToVector3(lat, lng, radius * SELECT_RADIUS_MULT))
        }
        if (raw.length < 2) continue
        const line = buildLine2(subdivideRing(raw), mat)
        line.renderOrder = 11
        group.add(line)
      }
    }
  } else {
    const mat = createLegacyCoreMat()
    currentCoreMat = mat
    currentMats = [mat]
    for (const poly of polys) {
      for (const ring of poly) {
        const raw: THREE.Vector3[] = []
        for (const [lng, lat] of ring) {
          raw.push(latLongToVector3(lat, lng, radius * SELECT_RADIUS_MULT))
        }
        if (raw.length < 2) continue
        const line = buildLineLegacy(subdivideRing(raw), mat)
        line.renderOrder = 11
        group.add(line)
      }
    }
  }

  group.scale.setScalar(SELECT_SCALE)
  parent.add(group)
  current = group
}

export function clearHighlight(parent: THREE.Object3D) {
  if (!current) return
  parent.remove(current)
  current.traverse(obj => {
    if ((obj as any).geometry?.dispose) (obj as any).geometry.dispose()
  })
  for (const mat of currentMats) mat.dispose()
  selectBackingMat?.dispose()
  selectBackingMat = null
  currentMats      = []
  currentCoreMat   = null
  current          = null
  activeFeatureStrokeScale = 1
}

export function updateCountryHighlight(timeSeconds: number) {
  if (!currentCoreMat || !currentMats.length) return

  const breathUp = 0.5 + 0.5 * Math.sin(timeSeconds * 1.85 + pulsePhase * 0.55)
  const alpha    = 0.82 + 0.18 * Math.sin(timeSeconds * 1.6 + pulsePhase)

  currentCoreMat.color.copy(computeAnimatedColor(timeSeconds))
  currentCoreMat.opacity = alpha

  if (current) {
    current.scale.setScalar(SELECT_SCALE + SELECT_BREATH_AMP * breathUp)
  }
}

export function configureCountryHighlightPalette(theme: CountryHighlightPaletteTheme = {}) {
  if (theme.colorA !== undefined) selectedPalette.a.set(theme.colorA)
  if (theme.colorB !== undefined) selectedPalette.b.set(theme.colorB)
  if (theme.colorC !== undefined) selectedPalette.c.set(theme.colorC)
  if (theme.colorD !== undefined) selectedPalette.d.set(theme.colorD)
}

export function setSelectedBorderLineWidth(lineWidthHint: number) {
  if (!Number.isFinite(lineWidthHint)) return
  selectedBorderLineWidthHint = THREE.MathUtils.clamp(lineWidthHint, 0.35, 20)
  if (currentCoreMat instanceof LineMaterial) {
    currentCoreMat.linewidth = computeLineWidth()
  }
}

export function setHighlightRenderMode(mode: 'line2' | 'line') {
  highlightRenderMode = mode
}

export function setSelectBackingEnabled(enabled: boolean) {
  selectBackingEnabled = enabled
}

export function setCountryGlowEnabled(_enabled: boolean) {
  // no-op: kept for API compatibility
}

export function syncCountryHighlightResolution() {
  // Resolution is auto-managed by LineSegments2.onBeforeRender (physical pixels).
  // linewidth is scaled by dpr() at creation / update time, so no action needed here.
}
