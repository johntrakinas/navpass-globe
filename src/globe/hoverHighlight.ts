import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { GOOGLE_COLORS, googlePaletteLerp } from '../theme/googleColors'

let hoverLines: THREE.LineSegments | null = null
let hoverMat: THREE.LineDashedMaterial | null = null

let targetOpacity = 0
let currentOpacity = 0
let pulsePhase = Math.random() * Math.PI * 2
let hoverColorA = GOOGLE_COLORS.white.clone()
let hoverColorB = GOOGLE_COLORS.yellow.clone()
let hoverOpacityMul = 1
const glowColor = new THREE.Color()
let hoverScale = 1
let hoverScaleTarget = 1

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
        const v1 = latLongToVector3(a[1], a[0], radius * 1.012)
        const v2 = latLongToVector3(b[1], b[0], radius * 1.012)
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
  // remove antigo
  if (hoverLines) {
    parent.remove(hoverLines)
    hoverLines.geometry.dispose()
    ;(hoverLines.material as THREE.Material).dispose()
    hoverLines = null
    hoverMat = null
  }

  targetOpacity = 0
  currentOpacity = 0
  pulsePhase = Math.random() * Math.PI * 2
  hoverScale = 1
  hoverScaleTarget = 1

  if (!feature) return

  const geo = featureToLineGeometry(feature, radius)

  hoverMat = new THREE.LineDashedMaterial({
    color: hoverColorA,
    transparent: true,
    opacity: 0.0, // começa invisível
    dashSize: 0.28,
    gapSize: 0.14,
    depthWrite: false
  })
  hoverMat.blending = THREE.AdditiveBlending

  hoverLines = new THREE.LineSegments(geo, hoverMat)
  hoverLines.computeLineDistances()
  hoverLines.renderOrder = 60
  hoverLines.frustumCulled = false
  // Pop-out animation: start slightly "closer" and quickly expand to the real hover radius.
  hoverScale = 0.992
  hoverScaleTarget = 1.0
  hoverLines.scale.setScalar(hoverScale)

  parent.add(hoverLines)

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
  if (!hoverMat || !hoverLines) return

  // dash animation (TS: não tipado, mas existe)
  ;(hoverMat as any).dashOffset = -timeSeconds * 0.32

  // ✅ opacidade adaptativa ao zoom (longe = menos forte)
  // ajuste fino: quanto menor o número, mais cedo ele fica forte
  const zoomFactor = THREE.MathUtils.clamp((28 - cameraDistance) / 12, 0, 1)
  const desiredMax = 0.24 + 0.5 * zoomFactor // 0.24..0.74 (perto mais visível)

  const maxOp = Math.min(desiredMax, 0.78)
  const tgt = Math.min(targetOpacity, maxOp)

  // ✅ fade suave (critico pro "Google feel")
  const smoothing = 0.18 // maior = mais rápido (0.12..0.22)
  currentOpacity += (tgt - currentOpacity) * smoothing
  const pulse = 0.72 + 0.28 * Math.sin(timeSeconds * 2.8 + pulsePhase)
  const shimmer = 0.5 + 0.5 * Math.sin(timeSeconds * 3.6 + pulsePhase * 0.7)
  const palette = googlePaletteLerp((timeSeconds * 0.08 + pulsePhase * 0.12) % 1)
  glowColor.copy(hoverColorA).lerp(hoverColorB, shimmer).lerp(palette, 0.55)
  hoverMat.color.copy(glowColor)
  hoverMat.opacity = currentOpacity * pulse * hoverOpacityMul

  // subtle "raise" animation (helps the border feel like it lifts off the globe)
  const popSmoothing = 0.22
  hoverScale += (hoverScaleTarget - hoverScale) * popSmoothing
  hoverLines.scale.setScalar(hoverScale)

  // quando chega em ~0, remove de vez
  if (targetOpacity === 0 && currentOpacity < 0.01) {
    parent.remove(hoverLines)
    hoverLines.geometry.dispose()
    ;(hoverLines.material as THREE.Material).dispose()
    hoverLines = null
    hoverMat = null
    targetOpacity = 0
    currentOpacity = 0
    hoverScale = 1
    hoverScaleTarget = 1
  }
}

export function setHoverTheme(isLight: boolean) {
  hoverColorA = isLight ? GOOGLE_COLORS.deepBlue.clone() : GOOGLE_COLORS.white.clone()
  hoverColorB = GOOGLE_COLORS.yellow.clone()
  hoverOpacityMul = isLight ? 1.55 : 1.3
  if (hoverMat) {
    hoverMat.color.copy(hoverColorA)
  }
}
