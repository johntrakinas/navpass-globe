import * as THREE from 'three'
import { createLineFadeMaterial } from './lineFadeMaterial'

// Keep grid below bloom threshold so it looks crisp instead of hazy.
const GRID_COLOR = new THREE.Color(0xb8c0ce)
const GRID_LINE_WIDTH = 5.6

function makeTriWire(radius: number, detail: number, opacity: number, camera: THREE.Camera) {
  const ico = new THREE.IcosahedronGeometry(radius, detail)
  const edges = new THREE.EdgesGeometry(ico, 1)

  // Limb-focused fade keeps the tri grid hugging the silhouette instead of flooding the front face.
  const mat = createLineFadeMaterial(GRID_COLOR, opacity, 0.24, 0.84, 1.16, 'limb')
  mat.blending = THREE.NormalBlending
  ;(mat as any).linewidth = GRID_LINE_WIDTH
  {
    const u: any = mat.uniforms
    u.uShimmerStrength.value = 0.0
    u.uShimmerSpeed.value = 0.72
    u.uShimmerPulse.value = 0.16
    u.uShimmerScale.value = 0.82
    u.uShimmerWidth.value = 0.20
    u.uShimmerColor.value = GRID_COLOR.clone()
    u.uShimmerDir.value = new THREE.Vector3(0.68, 0.22, 0.70).normalize()
    mat.userData.baseShimmerStrength = u.uShimmerStrength.value
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

export function createAdaptiveTriGrid(radius: number, camera: THREE.Camera) {
  // Keep tri grid very close to surface to avoid detached halo layers.
  // Higher detail keeps the triangles smaller/cleaner.
  const coarse = makeTriWire(radius * 1.024, 9, 0.106, camera)
  const fine = makeTriWire(radius * 1.027, 10, 0.088, camera)

  let coarseAlpha = 1
  let fineAlpha = 0
  const coarseBase = coarse.mat.opacity
  const fineBase = fine.mat.opacity

  coarse.mat.userData.lodAlpha = coarseAlpha
  fine.mat.userData.lodAlpha = fineAlpha
  coarse.mat.opacity = coarseBase * coarseAlpha
  fine.mat.opacity = fineBase * fineAlpha
  coarse.lines.visible = coarseAlpha > 0.015
  fine.lines.visible = fineAlpha > 0.015

  const group = new THREE.Group()
  group.add(coarse.lines)
  group.add(fine.lines)

  function update(cameraDistance: number) {
    const t0 = 23.5
    const t1 = 18.8
    const u = THREE.MathUtils.clamp((t0 - cameraDistance) / (t0 - t1), 0, 1)

    const coarseTarget = 1 - u
    const fineTarget = u
    const smoothing = 0.12

    coarseAlpha += (coarseTarget - coarseAlpha) * smoothing
    fineAlpha += (fineTarget - fineAlpha) * smoothing

    coarse.mat.userData.lodAlpha = coarseAlpha
    fine.mat.userData.lodAlpha = fineAlpha
    coarse.mat.opacity = coarseBase * coarseAlpha
    fine.mat.opacity = fineBase * fineAlpha
    coarse.lines.visible = coarseAlpha > 0.015
    fine.lines.visible = fineAlpha > 0.015
  }

  return { group, update, materials: [coarse.mat, fine.mat] }
}
