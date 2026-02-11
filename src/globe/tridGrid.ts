import * as THREE from 'three'
import { createLineFadeMaterial } from './lineFadeMaterial'
import { GOOGLE_COLORS } from '../theme/googleColors'

function makeTriWire(radius: number, detail: number, opacity: number, camera: THREE.Camera) {
  // Icosphere => triângulos
  const ico = new THREE.IcosahedronGeometry(radius, detail)

  // arestas (wire)
  const edges = new THREE.EdgesGeometry(ico, 1) // thresholdAngle baixo pega todas

  // Limb-only fade: grid should show mostly near the globe's silhouette (Google Research feel).
  const mat = createLineFadeMaterial(GOOGLE_COLORS.lightBlue, opacity, 0.46, 0.965, 1.75, 'limb')
  mat.blending = THREE.AdditiveBlending
  {
    const u: any = mat.uniforms
    u.uShimmerStrength.value = 0.21
    u.uShimmerSpeed.value = 0.92
    u.uShimmerPulse.value = 0.23
    u.uShimmerScale.value = 0.88
    u.uShimmerWidth.value = 0.12
    u.uShimmerColor.value = GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.lightBlue, 0.65)
    u.uShimmerDir.value = new THREE.Vector3(0.74, 0.16, 0.65).normalize()
    mat.userData.baseShimmerStrength = u.uShimmerStrength.value
  }

  const lines = new THREE.LineSegments(edges, mat)
  lines.frustumCulled = false
  lines.renderOrder = 3
  lines.onBeforeRender = () => {
    mat.uniforms.uCameraPos.value.copy((camera as any).position)
    mat.uniforms.uOpacity.value = mat.opacity
  }

  return { lines, mat }
}

export function createAdaptiveTriGrid(radius: number, camera: THREE.Camera) {
  // Denser mesh: smaller triangles reduce visible "tips"/junction hotspots.
  const coarse = makeTriWire(radius * 1.048, 4, 0.058, camera) // detail 4
  const fine = makeTriWire(radius * 1.056, 5, 0.042, camera)   // detail 5

  let coarseAlpha = 1
  let fineAlpha = 0
  const coarseBase = coarse.mat.opacity
  const fineBase = fine.mat.opacity

  fine.lines.visible = true
  coarse.lines.visible = true

  const group = new THREE.Group()
  group.add(coarse.lines)
  group.add(fine.lines)

  function update(cameraDistance: number) {
    // thresholds (ajuste pro seu zoom)
    const t0 = 23.5 // longe => coarse
    const t1 = 18.8 // perto => fine
    const u = THREE.MathUtils.clamp((t0 - cameraDistance) / (t0 - t1), 0, 1)

    const coarseTarget = 1 - u
    const fineTarget = u

    const smoothing = 0.12
    coarseAlpha += (coarseTarget - coarseAlpha) * smoothing
    fineAlpha += (fineTarget - fineAlpha) * smoothing

    coarse.mat.opacity = coarseBase * coarseAlpha
    fine.mat.opacity = fineBase * fineAlpha

    coarse.lines.visible = coarseAlpha > 0.02
    fine.lines.visible = fineAlpha > 0.02
  }

  return { group, update, materials: [coarse.mat, fine.mat] }
}
