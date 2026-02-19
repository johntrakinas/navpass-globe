import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { GOOGLE_COLORS, googlePaletteLerp } from '../theme/googleColors'
import { scaleThickness } from './thicknessScale'

export type HoverHighlightColorTheme = {
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  coreColor?: THREE.ColorRepresentation
  paletteMix?: number
}

let hoverGroup: THREE.Group | null = null
let hoverGlowLine: THREE.LineSegments | null = null
let hoverCoreLine: THREE.LineSegments | null = null
let hoverGlowMat: THREE.ShaderMaterial | null = null
let hoverCoreMat: THREE.ShaderMaterial | null = null

let targetOpacity = 0
let currentOpacity = 0
let pulsePhase = Math.random() * Math.PI * 2
let hoverColorA = GOOGLE_COLORS.white.clone()
let hoverColorB = GOOGLE_COLORS.yellow.clone()
let hoverCoreColor = GOOGLE_COLORS.white.clone()
let hoverPaletteMix = 0.42
let hoverOpacityMul = 1
const glowColor = new THREE.Color()
const coreColor = new THREE.Color()
let hoverScale = 1
let hoverScaleTarget = 1
const HOVER_RADIUS_MULT = 1.03
const HOVER_POP_START = 0.95
const HOVER_POP_TARGET = 1.02
const HOVER_BREATH_AMP = 0.006
const HOVER_BREATH_SPEED = 1.85

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

function createHoverMaterial(thickness: number) {
  return new THREE.ShaderMaterial({
    vertexShader: HOVER_VERT,
    fragmentShader: HOVER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.0 },
      uThickness: { value: thickness }
    }
  })
}

function disposeHover(parent: THREE.Object3D) {
  if (!hoverGroup) return

  parent.remove(hoverGroup)

  if (hoverGlowLine) {
    hoverGlowLine.geometry.dispose()
    hoverGlowLine = null
  }
  if (hoverCoreLine) {
    hoverCoreLine.geometry.dispose()
    hoverCoreLine = null
  }

  hoverGlowMat?.dispose()
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
        // Slightly above the base country borders so hover can "pop" out of the surface.
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

export function setHoverHighlight(feature: any | null, parent: THREE.Object3D, radius: number) {
  disposeHover(parent)

  targetOpacity = 0
  currentOpacity = 0
  pulsePhase = Math.random() * Math.PI * 2
  hoverScale = 1
  hoverScaleTarget = 1

  if (!feature) return

  const geo = featureToLineGeometry(feature, radius)
  const geoCore = geo.clone()

  hoverGlowMat = createHoverMaterial(scaleThickness(0.0042))
  hoverCoreMat = createHoverMaterial(scaleThickness(0.0017))

  hoverGlowLine = new THREE.LineSegments(geo, hoverGlowMat)
  hoverCoreLine = new THREE.LineSegments(geoCore, hoverCoreMat)

  hoverGlowLine.renderOrder = 60
  hoverCoreLine.renderOrder = 61
  hoverGlowLine.frustumCulled = false
  hoverCoreLine.frustumCulled = false

  hoverGroup = new THREE.Group()
  hoverGroup.add(hoverGlowLine)
  hoverGroup.add(hoverCoreLine)

  // Pop-out animation: start slightly "closer" and quickly expand to the real hover radius.
  hoverScale = HOVER_POP_START
  hoverScaleTarget = HOVER_POP_TARGET
  hoverGroup.scale.setScalar(hoverScale)

  parent.add(hoverGroup)

  // fade-in alvo padrão (o updateHover vai aplicar)
  targetOpacity = 1
}

export function clearHoverHighlight(parent: THREE.Object3D) {
  void parent
  // em vez de remover na hora, só seta alvo pra 0 e o update remove quando chegar
  targetOpacity = 0
}

export function fadeOutHover(parent: THREE.Object3D) {
  void parent
  targetOpacity = 0
}

export function updateHoverHighlight(parent: THREE.Object3D, timeSeconds: number, cameraDistance: number) {
  if (!hoverGroup || !hoverGlowMat || !hoverCoreMat) return

  // ✅ opacidade adaptativa ao zoom (longe = menos forte)
  // ajuste fino: quanto menor o número, mais cedo ele fica forte
  const zoomFactor = THREE.MathUtils.clamp((28 - cameraDistance) / 12, 0, 1)
  const desiredMax = 0.24 + 0.46 * zoomFactor // 0.24..0.70 (perto mais visível)

  const maxOp = Math.min(desiredMax, 0.72)
  const tgt = Math.min(targetOpacity, maxOp)

  // ✅ fade suave (critico pro "Google feel")
  const smoothing = 0.14 // maior = mais rápido (0.12..0.22)
  currentOpacity += (tgt - currentOpacity) * smoothing
  const pulse = 0.9 + 0.1 * Math.sin(timeSeconds * 1.9 + pulsePhase)
  const shimmer = 0.5 + 0.35 * Math.sin(timeSeconds * 2.2 + pulsePhase * 0.7)
  const palette = googlePaletteLerp((timeSeconds * 0.08 + pulsePhase * 0.12) % 1)
  glowColor.copy(hoverColorA).lerp(hoverColorB, shimmer)
  if (hoverPaletteMix > 0.0001) {
    glowColor.lerp(palette, hoverPaletteMix)
  }
  coreColor.copy(glowColor).lerp(hoverCoreColor, 0.30)

  ;(hoverGlowMat.uniforms.uColor.value as THREE.Color).copy(glowColor)
  hoverGlowMat.uniforms.uOpacity.value = currentOpacity * pulse * hoverOpacityMul * 0.72

  ;(hoverCoreMat.uniforms.uColor.value as THREE.Color).copy(coreColor)
  hoverCoreMat.uniforms.uOpacity.value = currentOpacity * (0.82 + 0.18 * pulse) * hoverOpacityMul * 0.88

  // subtle "raise" animation (helps the border feel like it lifts off the globe)
  const popSmoothing = 0.18
  hoverScale += (hoverScaleTarget - hoverScale) * popSmoothing
  // Breathing lift: always "up", never sinks below the current hover scale.
  const breathUp = 0.5 + 0.5 * Math.sin(timeSeconds * HOVER_BREATH_SPEED + pulsePhase * 0.55)
  const dynamicScale = hoverScale * (1.0 + HOVER_BREATH_AMP * breathUp)
  hoverGroup.scale.setScalar(dynamicScale)

  // quando chega em ~0, remove de vez
  if (targetOpacity === 0 && currentOpacity < 0.01) {
    disposeHover(parent)
    targetOpacity = 0
    currentOpacity = 0
    hoverScale = 1
    hoverScaleTarget = 1
  }
}

export function setHoverTheme(isLight: boolean) {
  hoverColorA = isLight ? GOOGLE_COLORS.deepBlue.clone() : GOOGLE_COLORS.white.clone()
  hoverColorB = GOOGLE_COLORS.yellow.clone()
  hoverCoreColor = GOOGLE_COLORS.white.clone()
  hoverPaletteMix = isLight ? 0.28 : 0.42
  hoverOpacityMul = isLight ? 1.35 : 1.20
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
