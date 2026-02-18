import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3' // ajuste path se necessário
import { createLineFadeMaterial } from './lineFadeMaterial'

// Keep grid below bloom threshold so it reads as lines, not as a halo.
const GRID_COLOR = new THREE.Color(0xb8c0ce)
const GRID_LINE_WIDTH = 4.5

function buildGridGeometry(radius: number, latStep: number, lonStep: number) {
  const positions: number[] = []

  // lat lines
  for (let lat = -80; lat <= 80; lat += latStep) {
    for (let lon = -180; lon < 180; lon += 2) {
      const a = latLongToVector3(lat, lon, radius)
      const b = latLongToVector3(lat, lon + 2, radius)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }

  // lon lines
  for (let lon = -180; lon < 180; lon += lonStep) {
    for (let lat = -80; lat < 80; lat += 2) {
      const a = latLongToVector3(lat, lon, radius)
      const b = latLongToVector3(lat + 2, lon, radius)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function makeLayer(
  radius: number,
  latStep: number,
  lonStep: number,
  opacityInner: number,
  opacityOuter: number,
  camera: THREE.Camera
) {
  const group = new THREE.Group()

  // Keep grid shells tight to the globe to avoid an external "atmosphere ring".
  const geoA = buildGridGeometry(radius * 1.02, latStep, lonStep)
  // Limb-only: keep it close to the silhouette so it feels like a mesh "shell", not a flat grid.
  const matA = createLineFadeMaterial(GRID_COLOR, opacityInner, 0.24, 0.84, 1.16, 'limb')
  matA.blending = THREE.NormalBlending
  ;(matA as any).linewidth = GRID_LINE_WIDTH
  {
    const u: any = matA.uniforms
    u.uShimmerStrength.value = 0.0
    u.uShimmerSpeed.value = 0.70
    u.uShimmerPulse.value = 0.16
    u.uShimmerScale.value = 0.82
    u.uShimmerWidth.value = 0.20
    u.uShimmerColor.value = GRID_COLOR.clone()
    u.uShimmerDir.value = new THREE.Vector3(0.68, 0.22, 0.70).normalize()
    matA.userData.baseShimmerStrength = u.uShimmerStrength.value
  }
  matA.userData.lodAlpha = 1
  const a = new THREE.LineSegments(geoA, matA)
  // Draw after atmosphere layers so lat/lon lines stay above the aura.
  a.renderOrder = 15
  a.frustumCulled = false
  a.onBeforeRender = () => {
    matA.uniforms.uCameraPos.value.copy((camera as any).position)
    matA.uniforms.uOpacity.value = matA.opacity
  }

  // Secondary shell kept very close and subtle, to avoid the detached outer band.
  const geoB = buildGridGeometry(radius * 1.023, latStep, lonStep)
  const matB = createLineFadeMaterial(GRID_COLOR, opacityOuter, 0.27, 0.86, 1.18, 'limb')
  matB.blending = THREE.NormalBlending
  ;(matB as any).linewidth = GRID_LINE_WIDTH
  {
    const u: any = matB.uniforms
    u.uShimmerStrength.value = 0.0
    u.uShimmerSpeed.value = 0.66
    u.uShimmerPulse.value = 0.14
    u.uShimmerScale.value = 0.78
    u.uShimmerWidth.value = 0.22
    u.uShimmerColor.value = GRID_COLOR.clone()
    u.uShimmerDir.value = new THREE.Vector3(0.68, 0.22, 0.70).normalize()
    matB.userData.baseShimmerStrength = u.uShimmerStrength.value
  }
  matB.userData.lodAlpha = 1
  const b = new THREE.LineSegments(geoB, matB)
  b.renderOrder = 15
  b.frustumCulled = false
  b.onBeforeRender = () => {
    matB.uniforms.uCameraPos.value.copy((camera as any).position)
    matB.uniforms.uOpacity.value = matB.opacity
  }

  group.add(a)
  group.add(b)

  return { group, mats: [matA, matB] }
}

export function createAdaptiveLatLonGrid(radius: number, camera: THREE.Camera) {
  // coarse (12°)
  const coarse = makeLayer(radius, 12, 12, 0.072, 0.028, camera)
  // fine (6°)
  const fine = makeLayer(radius, 6, 6, 0.064, 0.024, camera)

  // começa com coarse visível e fine “apagado”
  let coarseAlpha = 1
  let fineAlpha = 0
  // guarda os opacities base pra multiplicar
  const coarseBase = coarse.mats.map(m => m.opacity)
  const fineBase = fine.mats.map(m => m.opacity)

  // aplica opacidade inicial
  coarse.mats.forEach((m, i) => (m.opacity = coarseBase[i] * coarseAlpha))
  fine.mats.forEach((m, i) => (m.opacity = fineBase[i] * fineAlpha))
  coarse.mats.forEach(m => (m.userData.lodAlpha = coarseAlpha))
  fine.mats.forEach(m => (m.userData.lodAlpha = fineAlpha))

  const group = new THREE.Group()
  group.add(coarse.group)
  group.add(fine.group)

  /**
   * update(cameraDistance)
   * - quando zoom in: fine -> 1, coarse -> 0
   * - quando zoom out: coarse -> 1, fine -> 0
   * - com transição suave (sem pop)
   */
  function update(cameraDistance: number) {
    // Lat/Lon grid should be a *secondary* cue: fade away when zooming out,
    // so the tri-mesh remains the dominant "researchy" pattern.
    const zoomAlphaMain = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 17.2, 30.5, 1.0, 0.26),
      0.26,
      1.0
    )
    // Keep lat/lon readable but avoid over-dense overlays when very close.
    const nearFade = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 14.0, 16.8, 0.58, 1.0),
      0.58,
      1.0
    )
    const zoomAlpha = zoomAlphaMain * nearFade

    // thresholds ajustados pro teu setup (camera z ~ 25, minDistance 14, maxDistance 40)
    // onde começa a “trocar”
    const t0 = 22.8 // acima disso: coarse domina
    const t1 = 19.8 // abaixo disso: fine domina

    // normaliza 0..1 (0=coarse, 1=fine)
    const u = THREE.MathUtils.clamp((t0 - cameraDistance) / (t0 - t1), 0, 1)

    // alvo
    const coarseTarget = (1 - u) * zoomAlpha
    const fineTarget = u * zoomAlpha

    // smoothing (Google feel)
    const smoothing = 0.11 // 0.08..0.18

    coarseAlpha += (coarseTarget - coarseAlpha) * smoothing
    fineAlpha += (fineTarget - fineAlpha) * smoothing

    // aplica opacidade (multiplica base)
    coarse.mats.forEach((m, i) => (m.opacity = coarseBase[i] * coarseAlpha))
    fine.mats.forEach((m, i) => (m.opacity = fineBase[i] * fineAlpha))
    coarse.mats.forEach(m => (m.userData.lodAlpha = coarseAlpha))
    fine.mats.forEach(m => (m.userData.lodAlpha = fineAlpha))

    // micro-otimização: se alpha quase zero, desliga render
    coarse.group.visible = coarseAlpha > 0.015
    fine.group.visible = fineAlpha > 0.015
  }

  return { group, update, materials: [...coarse.mats, ...fine.mats] }
}
