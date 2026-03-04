import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { latLongToVector3 } from './latLongtoVector3'
import { GOOGLE_COLORS, googlePaletteLerp } from '../theme/googleColors'
import { scaleThickness } from './thicknessScale'
import { computeCountryStrokeScale } from './countryStrokeScale'

export type HoverHighlightColorTheme = {
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  coreColor?: THREE.ColorRepresentation
  paletteMix?: number
}

let hoverGroup: THREE.Group | null = null
let hoverGlowLine: THREE.LineSegments | null = null
let hoverShadowGroups: THREE.Group[] = []
let hoverCoreLine: THREE.LineSegments | null = null
let hoverGlowMat: THREE.ShaderMaterial | null = null
let hoverShadowMats: LineMaterial[] = []
let hoverCoreMat: THREE.ShaderMaterial | null = null

let targetOpacity = 0
let currentOpacity = 0
let pulsePhase = Math.random() * Math.PI * 2
let hoverColorA = GOOGLE_COLORS.white.clone()
let hoverColorB = GOOGLE_COLORS.yellow.clone()
let hoverCoreColor = GOOGLE_COLORS.white.clone()
let hoverPaletteMix = 0.0
let hoverOpacityMul = 1
const glowColor = new THREE.Color()
const shadowColor = new THREE.Color()
const coreColor = new THREE.Color()
const popShadowTint = new THREE.Color('#160d02')
let hoverScale = 1
let hoverScaleTarget = 1
let hoverBorderLineWidthHint = 1.0
let activeFeatureStrokeScale = 1
const HOVER_RADIUS_MULT = 1.004
const HOVER_POP_START = 0.95
const HOVER_POP_TARGET = 1.02
const HOVER_BREATH_AMP = 0.006
const HOVER_BREATH_SPEED = 1.85
const HOVER_CORE_THICKNESS_PER_BORDER_WIDTH = 0.0016 / 1.8
const HOVER_MIN_CORE_THICKNESS = 0.00135
const HOVER_GLOW_TO_CORE_RATIO = 1.32
const HOVER_GLOW_OPACITY_MUL = 1.58
const HOVER_CORE_OPACITY_MUL = 1.18
const HOVER_SHADOW_BASE_WIDTH = 4.5
const HOVER_SHADOW_WIDTH_PER_HINT = 2.2
const HOVER_SHADOW_PEAK_WIDTH_MUL = 1.16
const HOVER_SHADOW_COLOR_WARMTH = 0.05
const HOVER_SHADOW_LAYERS = [
  { baseScale: 1.0, peakScale: 1.006, widthMul: 1.0, opacityMul: 0.34 },
  { baseScale: 1.004, peakScale: 1.012, widthMul: 1.65, opacityMul: 0.2 },
  { baseScale: 1.008, peakScale: 1.018, widthMul: 2.35, opacityMul: 0.11 }
] as const

const HOVER_VERT = /* glsl */ `
uniform float uThickness;

void main() {
  vec3 p = position * (1.0 + uThickness);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const HOVER_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;

void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}
`

function syncLineMaterialResolution(material: LineMaterial | null) {
  if (!material) return
  material.resolution.set(Math.max(window.innerWidth, 1), Math.max(window.innerHeight, 1))
}

function createHoverMaterial(
  thickness: number,
  options: { blending?: THREE.Blending } = {}
) {
  return new THREE.ShaderMaterial({
    vertexShader: HOVER_VERT,
    fragmentShader: HOVER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: options.blending ?? THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.0 },
      uThickness: { value: thickness }
    }
  })
}

function createShadowMaterial(lineWidth: number) {
  const material = new LineMaterial({
    color: 0x160d02,
    transparent: true,
    opacity: 0,
    linewidth: lineWidth,
    worldUnits: false,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending
  })
  syncLineMaterialResolution(material)
  return material
}

function computeHoverWidthHint(strokeScale: number) {
  const strokeScaleFloor = Math.max(0.75, strokeScale)
  return THREE.MathUtils.clamp(hoverBorderLineWidthHint * strokeScaleFloor, 0.35, 4)
}

function computeHoverCoreThickness(strokeScale: number) {
  const widthHint = computeHoverWidthHint(strokeScale)
  return Math.max(
    scaleThickness(HOVER_MIN_CORE_THICKNESS),
    scaleThickness(HOVER_CORE_THICKNESS_PER_BORDER_WIDTH * widthHint)
  )
}

function applyHoverStrokeThickness(strokeScale: number) {
  if (!hoverGlowMat || !hoverCoreMat) return

  const widthHint = computeHoverWidthHint(strokeScale)
  const coreThickness = computeHoverCoreThickness(strokeScale)
  hoverCoreMat.uniforms.uThickness.value = coreThickness
  hoverGlowMat.uniforms.uThickness.value = coreThickness * HOVER_GLOW_TO_CORE_RATIO

  const shadowBaseLineWidth = Math.max(HOVER_SHADOW_BASE_WIDTH, widthHint * HOVER_SHADOW_WIDTH_PER_HINT)
  for (let i = 0; i < hoverShadowMats.length; i++) {
    const mat = hoverShadowMats[i]
    const layer = HOVER_SHADOW_LAYERS[i]
    const layerWidth = shadowBaseLineWidth * layer.widthMul
    mat.userData.baseLineWidth = layerWidth
    mat.linewidth = layerWidth
    syncLineMaterialResolution(mat)
  }
}

function disposeHover(parent: THREE.Object3D) {
  if (!hoverGroup) return

  parent.remove(hoverGroup)

  if (hoverGlowLine) {
    hoverGlowLine.geometry.dispose()
    hoverGlowLine = null
  }
  for (const group of hoverShadowGroups) {
    for (const child of group.children) {
      ;((child as Line2).geometry as LineGeometry).dispose()
    }
  }
  hoverShadowGroups = []
  if (hoverCoreLine) {
    hoverCoreLine.geometry.dispose()
    hoverCoreLine = null
  }

  hoverGlowMat?.dispose()
  for (const mat of hoverShadowMats) {
    mat.dispose()
  }
  hoverShadowMats = []
  hoverCoreMat?.dispose()
  hoverGlowMat = null
  hoverCoreMat = null
  hoverGroup = null
}

function featureToLineGeometry(feature: any, radius: number) {
  const positions: number[] = []

  const geom = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]
        const b = ring[i + 1]
        const v1 = latLongToVector3(a[1], a[0], radius * HOVER_RADIUS_MULT)
        const v2 = latLongToVector3(b[1], b[0], radius * HOVER_RADIUS_MULT)
        positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.computeBoundingSphere()
  return g
}

function featureToRingPositions(feature: any, radius: number) {
  const ringPositions: number[][] = []
  const geom = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  for (const poly of polys) {
    for (const ring of poly) {
      const positions: number[] = []
      for (const [lng, lat] of ring) {
        const point = latLongToVector3(lat, lng, radius * HOVER_RADIUS_MULT)
        positions.push(point.x, point.y, point.z)
      }
      if (positions.length >= 6) {
        ringPositions.push(positions)
      }
    }
  }

  return ringPositions
}

function createRingGeometry(positions: number[]) {
  const geometry = new LineGeometry()
  geometry.setPositions(positions)
  geometry.computeBoundingSphere()
  return geometry
}

export function setHoverHighlight(feature: any | null, parent: THREE.Object3D, radius: number) {
  disposeHover(parent)

  targetOpacity = 0
  currentOpacity = 0
  pulsePhase = Math.random() * Math.PI * 2
  hoverScale = 1
  hoverScaleTarget = 1
  activeFeatureStrokeScale = 1

  if (!feature) return

  activeFeatureStrokeScale = computeCountryStrokeScale(feature)
  const geo = featureToLineGeometry(feature, radius)
  const geoCore = geo.clone()
  const ringPositions = featureToRingPositions(feature, radius)

  hoverGlowMat = createHoverMaterial(scaleThickness(0.0042))
  hoverShadowMats = HOVER_SHADOW_LAYERS.map(() => createShadowMaterial(HOVER_SHADOW_BASE_WIDTH))
  hoverCoreMat = createHoverMaterial(scaleThickness(0.0017))
  applyHoverStrokeThickness(activeFeatureStrokeScale)

  hoverGlowLine = new THREE.LineSegments(geo, hoverGlowMat)
  hoverCoreLine = new THREE.LineSegments(geoCore, hoverCoreMat)

  hoverShadowGroups = HOVER_SHADOW_LAYERS.map((layer, index) => {
    const group = new THREE.Group()
    group.scale.setScalar(layer.baseScale)
    for (const positions of ringPositions) {
      const line = new Line2(createRingGeometry(positions), hoverShadowMats[index])
      line.renderOrder = 57 + index
      line.frustumCulled = false
      group.add(line)
    }
    return group
  })

  hoverGlowLine.renderOrder = 60
  hoverCoreLine.renderOrder = 61
  hoverGlowLine.frustumCulled = false
  hoverCoreLine.frustumCulled = false

  hoverGroup = new THREE.Group()
  for (const group of hoverShadowGroups) {
    hoverGroup.add(group)
  }
  hoverGroup.add(hoverGlowLine)
  hoverGroup.add(hoverCoreLine)

  hoverScale = HOVER_POP_START
  hoverScaleTarget = HOVER_POP_TARGET
  hoverGroup.scale.setScalar(hoverScale)

  parent.add(hoverGroup)
  targetOpacity = 1
}

export function clearHoverHighlight(parent: THREE.Object3D) {
  void parent
  targetOpacity = 0
}

export function fadeOutHover(parent: THREE.Object3D) {
  void parent
  targetOpacity = 0
}

export function updateHoverHighlight(parent: THREE.Object3D, timeSeconds: number, cameraDistance: number) {
  if (!hoverGroup || !hoverGlowMat || !hoverCoreMat) return

  const zoomFactor = THREE.MathUtils.clamp((28 - cameraDistance) / 12, 0, 1)
  const desiredMax = 0.34 + 0.5 * zoomFactor

  const maxOp = Math.min(desiredMax, 0.82)
  const tgt = Math.min(targetOpacity, maxOp)

  currentOpacity += (tgt - currentOpacity) * 0.14
  const pulse = 0.9 + 0.1 * Math.sin(timeSeconds * 1.9 + pulsePhase)
  const shimmer = 0.5 + 0.35 * Math.sin(timeSeconds * 2.2 + pulsePhase * 0.7)
  const palette = googlePaletteLerp((timeSeconds * 0.08 + pulsePhase * 0.12) % 1)
  glowColor.copy(hoverColorA).lerp(hoverColorB, shimmer)
  if (hoverPaletteMix > 0.0001) {
    glowColor.lerp(palette, hoverPaletteMix)
  }
  coreColor.copy(glowColor).lerp(hoverCoreColor, 0.3)

  const popSmoothing = 0.18
  hoverScale += (hoverScaleTarget - hoverScale) * popSmoothing
  const breathUp = 0.5 + 0.5 * Math.sin(timeSeconds * HOVER_BREATH_SPEED + pulsePhase * 0.55)
  const dynamicScale = hoverScale * (1.0 + HOVER_BREATH_AMP * breathUp)
  hoverGroup.scale.setScalar(dynamicScale)

  const popMix = THREE.MathUtils.clamp(
    (hoverScale - HOVER_POP_START) / Math.max(HOVER_POP_TARGET - HOVER_POP_START, 0.0001),
    0,
    1
  )
  const popShadowBoost = Math.pow(THREE.MathUtils.smoothstep(popMix, 0.42, 0.96), 1.05)
  shadowColor.copy(popShadowTint).lerp(hoverColorB, HOVER_SHADOW_COLOR_WARMTH * shimmer)
  shadowColor.lerp(popShadowTint, 0.28 + 0.2 * popShadowBoost)

  ;(hoverGlowMat.uniforms.uColor.value as THREE.Color).copy(glowColor)
  hoverGlowMat.uniforms.uOpacity.value = currentOpacity * pulse * hoverOpacityMul * HOVER_GLOW_OPACITY_MUL

  for (let i = 0; i < hoverShadowMats.length; i++) {
    const mat = hoverShadowMats[i]
    const group = hoverShadowGroups[i]
    const layer = HOVER_SHADOW_LAYERS[i]
    const baseLineWidth = Number(mat.userData.baseLineWidth ?? HOVER_SHADOW_BASE_WIDTH)
    syncLineMaterialResolution(mat)
    mat.linewidth = baseLineWidth * THREE.MathUtils.lerp(1.0, HOVER_SHADOW_PEAK_WIDTH_MUL, popShadowBoost)
    mat.color.copy(shadowColor)
    mat.opacity =
      currentOpacity * popShadowBoost * (0.92 + 0.08 * pulse) * hoverOpacityMul * layer.opacityMul
    if (group) {
      group.scale.setScalar(THREE.MathUtils.lerp(layer.baseScale, layer.peakScale, popShadowBoost))
    }
  }

  ;(hoverCoreMat.uniforms.uColor.value as THREE.Color).copy(coreColor)
  hoverCoreMat.uniforms.uOpacity.value =
    currentOpacity * (0.82 + 0.18 * pulse) * hoverOpacityMul * HOVER_CORE_OPACITY_MUL

  if (targetOpacity === 0 && currentOpacity < 0.01) {
    disposeHover(parent)
    targetOpacity = 0
    currentOpacity = 0
    hoverScale = 1
    hoverScaleTarget = 1
  }
}

export function setHoverTheme(isLight: boolean) {
  hoverColorA = GOOGLE_COLORS.white.clone()
  hoverColorB = GOOGLE_COLORS.yellow.clone()
  hoverCoreColor = GOOGLE_COLORS.white.clone()
  hoverPaletteMix = 0
  hoverOpacityMul = isLight ? 1.35 : 1.2
}

export function setHoverBorderLineWidth(lineWidthHint: number) {
  if (!Number.isFinite(lineWidthHint)) return
  hoverBorderLineWidthHint = THREE.MathUtils.clamp(lineWidthHint, 0.35, 4)
  applyHoverStrokeThickness(activeFeatureStrokeScale)
}

export function configureHoverHighlightColors(theme: HoverHighlightColorTheme = {}) {
  if (theme.colorA !== undefined) {
    hoverColorA.set(theme.colorA)
  }
  if (theme.colorB !== undefined) {
    hoverColorB.set(theme.colorB)
  }
  if (theme.coreColor !== undefined) {
    hoverCoreColor.set(theme.coreColor)
  }
  if (typeof theme.paletteMix === 'number') {
    hoverPaletteMix = THREE.MathUtils.clamp(theme.paletteMix, 0, 1)
  }
}
