import * as THREE from 'three'
import { createLineFadeMaterial } from './lineFadeMaterial'

// Keep grid below bloom threshold so it looks crisp instead of hazy.
const GRID_COLOR = new THREE.Color('#fff8e8')
const GRID_WARM_COLOR = new THREE.Color('#FBBC05').lerp(new THREE.Color('#ffffff'), 0.06)
const GRID_GRADIENT_DIR = new THREE.Vector3(0.34, 0.92, -0.18).normalize()
const GRID_LINE_WIDTH = 26

function makeTriWire(
  radius: number,
  detail: number,
  opacity: number,
  fadeMin: number,
  fadeMax: number,
  rolloff: number,
  camera: THREE.Camera
) {
  const ico = new THREE.IcosahedronGeometry(radius, detail)
  const edges = new THREE.EdgesGeometry(ico, 1)

  // Limb-focused fade keeps the tri grid hugging the silhouette instead of flooding the front face.
  // Higher fadeMin increases the inner "clean" area (no grid in the globe center).
  const mat = createLineFadeMaterial(GRID_COLOR, opacity, fadeMin, fadeMax, rolloff, 'limb')
  mat.blending = THREE.NormalBlending
  ;(mat as any).linewidth = GRID_LINE_WIDTH
  {
    const u: any = mat.uniforms
    u.uShimmerStrength.value = 0.15
    u.uShimmerSpeed.value = 0.72
    u.uShimmerPulse.value = 0.16
    u.uShimmerScale.value = 0.82
    u.uShimmerWidth.value = 0.20
    u.uShimmerColor.value = GRID_WARM_COLOR.clone()
    u.uShimmerDir.value = new THREE.Vector3(0.68, 0.22, 0.70).normalize()
    u.uGradientColor.value = GRID_WARM_COLOR.clone()
    u.uGradientDir.value = GRID_GRADIENT_DIR.clone()
    u.uGradientStrength.value = 0.48
    mat.userData.baseShimmerStrength = u.uShimmerStrength.value
    mat.userData.baseGradientStrength = u.uGradientStrength.value
  }
  mat.userData.lodAlpha = 1

  const lines = new THREE.LineSegments(edges, mat)
  lines.frustumCulled = false
  // Draw tri-grid after atmosphere so the mesh reads above the halo.
  lines.renderOrder = 16
  lines.onBeforeRender = () => {
    mat.uniforms.uCameraPos.value.copy((camera as any).position)
    mat.uniforms.uOpacity.value = mat.opacity
  }

  return { lines, mat }
}

function makeTriLayer(
  radius: number,
  detail: number,
  opacityInner: number,
  opacityMid: number,
  opacityOuter: number,
  camera: THREE.Camera
) {
  // WebGL lineWidth is ignored on most drivers; stack tight shells to build visual thickness.
  const inner = makeTriWire(radius, detail, opacityInner, 0.26, 0.84, 1.08, camera)
  const mid = makeTriWire(radius * 1.0048, detail, opacityMid, 0.34, 0.90, 1.22, camera)
  const outer = makeTriWire(radius * 1.0092, detail, opacityOuter, 0.44, 0.95, 1.36, camera)
  ;(inner.mat.uniforms as any).uShimmerStrength.value = 0.13
  ;(inner.mat.uniforms as any).uGradientStrength.value = 0.42
  inner.mat.userData.baseShimmerStrength = (inner.mat.uniforms as any).uShimmerStrength.value
  inner.mat.userData.baseGradientStrength = (inner.mat.uniforms as any).uGradientStrength.value
  ;(mid.mat.uniforms as any).uShimmerStrength.value = 0.18
  ;(mid.mat.uniforms as any).uGradientStrength.value = 0.58
  mid.mat.userData.baseShimmerStrength = (mid.mat.uniforms as any).uShimmerStrength.value
  mid.mat.userData.baseGradientStrength = (mid.mat.uniforms as any).uGradientStrength.value
  ;(outer.mat.uniforms as any).uShimmerStrength.value = 0.24
  ;(outer.mat.uniforms as any).uGradientStrength.value = 0.76
  outer.mat.userData.baseShimmerStrength = (outer.mat.uniforms as any).uShimmerStrength.value
  outer.mat.userData.baseGradientStrength = (outer.mat.uniforms as any).uGradientStrength.value
  const group = new THREE.Group()
  group.add(inner.lines)
  group.add(mid.lines)
  group.add(outer.lines)
  return { group, mats: [inner.mat, mid.mat, outer.mat] }
}

export function createAdaptiveTriGrid(radius: number, camera: THREE.Camera) {
  // Keep tri grid very close to surface to avoid detached halo layers.
  const coarse = makeTriLayer(radius * 1.025, 14, 0.084, 0.112, 0.146, camera)
  const fine = makeTriLayer(radius * 1.029, 16, 0.074, 0.102, 0.132, camera)

  let coarseAlpha = 1
  let fineAlpha = 0
  const coarseBase = coarse.mats.map(m => m.opacity)
  const fineBase = fine.mats.map(m => m.opacity)

  coarse.mats.forEach((m, i) => {
    m.userData.lodAlpha = coarseAlpha
    m.opacity = coarseBase[i] * coarseAlpha
  })
  fine.mats.forEach((m, i) => {
    m.userData.lodAlpha = fineAlpha
    m.opacity = fineBase[i] * fineAlpha
  })
  coarse.group.visible = coarseAlpha > 0.015
  fine.group.visible = fineAlpha > 0.015

  const group = new THREE.Group()
  group.add(coarse.group)
  group.add(fine.group)

  function update(cameraDistance: number) {
    const t0 = 23.5
    const t1 = 18.8
    const u = THREE.MathUtils.clamp((t0 - cameraDistance) / (t0 - t1), 0, 1)

    const coarseTarget = 1 - u
    const fineTarget = u
    const smoothing = 0.12

    coarseAlpha += (coarseTarget - coarseAlpha) * smoothing
    fineAlpha += (fineTarget - fineAlpha) * smoothing

    coarse.mats.forEach((m, i) => {
      m.userData.lodAlpha = coarseAlpha
      m.opacity = coarseBase[i] * coarseAlpha
    })
    fine.mats.forEach((m, i) => {
      m.userData.lodAlpha = fineAlpha
      m.opacity = fineBase[i] * fineAlpha
    })
    coarse.group.visible = coarseAlpha > 0.015
    fine.group.visible = fineAlpha > 0.015
  }

  return { group, update, materials: [...coarse.mats, ...fine.mats] }
}
