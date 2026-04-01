import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { latLongToVector3 } from './latLongtoVector3'
import { GOOGLE_COLORS } from '../theme/googleColors'
import { computeCountryStrokeScale } from './countryStrokeScale'

export type HoverHighlightColorTheme = {
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  coreColor?: THREE.ColorRepresentation
  paletteMix?: number
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

type CoreMat = LineMaterial | THREE.LineBasicMaterial

let highlightRenderMode: 'line2' | 'line' = 'line2'
let hoverGroup: THREE.Group | null = null
let hoverCoreMat: CoreMat | null = null

let targetOpacity = 0
let currentOpacity = 0
let pulsePhase = Math.random() * Math.PI * 2
let hoverColorB = new THREE.Color('#ECB200')
let hoverOpacityMul = 1
let hoverScale = 1
let hoverScaleTarget = 1
let hoverBorderLineWidthHint = 1.0
let activeFeatureStrokeScale = 1

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOVER_RADIUS_MULT = 1.004
const HOVER_POP_START = 0.95
const HOVER_POP_TARGET = 1.02
const HOVER_BREATH_AMP = 0.006
const HOVER_BREATH_SPEED = 1.85
const HOVER_CORE_OPACITY_MUL = 1.18
const SUBDIVIDE_N = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * LineSegments2.onBeforeRender sets material.uniforms.resolution to
 * renderer.getViewport() (physical pixels) every frame.
 * linewidth must be in physical pixels to match.
 */
function dpr(): number {
  return Math.max(1, window.devicePixelRatio ?? 1)
}

function computeLineWidth(): number {
  const cssWidth = THREE.MathUtils.clamp(
    hoverBorderLineWidthHint * Math.max(0.75, activeFeatureStrokeScale),
    0.35,
    20
  )
  return cssWidth * dpr()
}

function createSelectMat(): LineMaterial {
  return new LineMaterial({
    color: hoverColorB.getHex(),
    linewidth: computeLineWidth(),
    worldUnits: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
    vertexColors: false
  })
}

/**
 * Linearly subdivide a ring — same principle as countryHighlight.
 * Preserves exact geometry, eliminates visible vertex segmentation.
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

function buildLine2(pts: THREE.Vector3[], mat: LineMaterial): Line2 {
  const flat: number[] = []
  for (const p of pts) flat.push(p.x, p.y, p.z)
  flat.push(flat[0], flat[1], flat[2]) // close loop
  const geo = new LineGeometry()
  geo.setPositions(flat)
  const line = new Line2(geo, mat)
  line.frustumCulled = false
  return line
}

function createLegacyMat(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: hoverColorB.getHex(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: THREE.NormalBlending
  })
}

function buildLineLegacy(pts: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const line = new THREE.LineLoop(geo, mat)
  line.frustumCulled = false
  return line
}

function disposeHover(parent: THREE.Object3D) {
  if (!hoverGroup) return
  parent.remove(hoverGroup)
  hoverGroup.traverse(obj => {
    if ((obj as any).geometry?.dispose) (obj as any).geometry.dispose()
  })
  hoverCoreMat?.dispose()
  hoverCoreMat = null
  hoverGroup = null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setSelectedHighlight(feature: any | null, parent: THREE.Object3D, radius: number) {
  disposeHover(parent)

  targetOpacity = 0
  currentOpacity = 0
  pulsePhase = Math.random() * Math.PI * 2
  hoverScale = 1
  hoverScaleTarget = 1
  activeFeatureStrokeScale = 1

  if (!feature) return

  activeFeatureStrokeScale = computeCountryStrokeScale(feature)
  hoverGroup = new THREE.Group()

  const geom  = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  if (highlightRenderMode === 'line2') {
    const mat = createSelectMat()
    hoverCoreMat = mat
    for (const poly of polys) {
      for (const ring of poly) {
        const raw: THREE.Vector3[] = []
        for (const [lng, lat] of ring) {
          raw.push(latLongToVector3(lat, lng, radius * HOVER_RADIUS_MULT))
        }
        if (raw.length < 2) continue
        const line = buildLine2(subdivideRing(raw), mat)
        line.renderOrder = 61
        hoverGroup.add(line)
      }
    }
  } else {
    const mat = createLegacyMat()
    hoverCoreMat = mat
    for (const poly of polys) {
      for (const ring of poly) {
        const raw: THREE.Vector3[] = []
        for (const [lng, lat] of ring) {
          raw.push(latLongToVector3(lat, lng, radius * HOVER_RADIUS_MULT))
        }
        if (raw.length < 2) continue
        const line = buildLineLegacy(subdivideRing(raw), mat)
        line.renderOrder = 61
        hoverGroup.add(line)
      }
    }
  }

  hoverScale = HOVER_POP_START
  hoverScaleTarget = HOVER_POP_TARGET
  hoverGroup.scale.setScalar(hoverScale)

  parent.add(hoverGroup)
  targetOpacity = 1
}

export function clearSelectedHighlight(parent: THREE.Object3D) {
  void parent
  targetOpacity = 0
}

export function fadeOutSelected(parent: THREE.Object3D) {
  void parent
  targetOpacity = 0
}

export function updateSelectedHighlight(parent: THREE.Object3D, timeSeconds: number, cameraDistance: number) {
  if (!hoverGroup || !hoverCoreMat) return

  const zoomFactor = THREE.MathUtils.clamp((28 - cameraDistance) / 12, 0, 1)
  const desiredMax = 0.34 + 0.5 * zoomFactor
  const maxOp     = Math.min(desiredMax, 0.82)
  const tgt       = Math.min(targetOpacity, maxOp)

  currentOpacity += (tgt - currentOpacity) * 0.14
  const pulse = 0.9 + 0.1 * Math.sin(timeSeconds * 1.9 + pulsePhase)

  const popSmoothing = 0.18
  hoverScale += (hoverScaleTarget - hoverScale) * popSmoothing
  const breathUp    = 0.5 + 0.5 * Math.sin(timeSeconds * HOVER_BREATH_SPEED + pulsePhase * 0.55)
  const dynamicScale = hoverScale * (1.0 + HOVER_BREATH_AMP * breathUp)
  hoverGroup.scale.setScalar(dynamicScale)

  if (highlightRenderMode === 'line2') {
    hoverCoreMat.color.copy(hoverColorB).convertSRGBToLinear()
  } else {
    hoverCoreMat.color.copy(hoverColorB)
  }
  hoverCoreMat.opacity = currentOpacity * (0.82 + 0.18 * pulse) * hoverOpacityMul * HOVER_CORE_OPACITY_MUL

  if (targetOpacity === 0 && currentOpacity < 0.01) {
    disposeHover(parent)
    targetOpacity = 0
    currentOpacity = 0
    hoverScale = 1
    hoverScaleTarget = 1
  }
}

export function setSelectedTheme(isLight: boolean) {
  hoverColorB = new THREE.Color('#ECB200')
  hoverOpacityMul = isLight ? 1.35 : 1.2
}

export function setSelectedBorderLineWidth(lineWidthHint: number) {
  if (!Number.isFinite(lineWidthHint)) return
  hoverBorderLineWidthHint = THREE.MathUtils.clamp(lineWidthHint, 0.35, 20)
  if (hoverCoreMat instanceof LineMaterial) {
    hoverCoreMat.linewidth = computeLineWidth()
  }
}

export function setHighlightRenderMode(mode: 'line2' | 'line') {
  highlightRenderMode = mode
}

export function setSelectedGlowEnabled(_enabled: boolean) {
  // no-op: kept for API compatibility
}

export function configureSelectedHighlightColors(theme: HoverHighlightColorTheme = {}) {
  if (theme.colorB !== undefined) hoverColorB.set(theme.colorB)
  // colorA / coreColor / paletteMix kept in signature for API compatibility
}
