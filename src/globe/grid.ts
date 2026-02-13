import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3' // ajuste path se necessário
import { createLineFadeMaterial } from './lineFadeMaterial'
import { GOOGLE_COLORS } from '../theme/googleColors'

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

  // inner aura
  const geoA = buildGridGeometry(radius * 1.038, latStep, lonStep)
  // Limb-only: keep it close to the silhouette so it feels like a mesh "shell", not a flat grid.
  const matA = createLineFadeMaterial(GOOGLE_COLORS.lightBlue, opacityInner, 0.48, 0.96, 1.55, 'limb')
  matA.blending = THREE.AdditiveBlending
  {
    const u: any = matA.uniforms
    u.uShimmerStrength.value = 0.24
    u.uShimmerSpeed.value = 0.92
    u.uShimmerPulse.value = 0.24
    u.uShimmerScale.value = 0.85
    u.uShimmerWidth.value = 0.18
    u.uShimmerColor.value = GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.lightBlue, 0.68)
    u.uShimmerDir.value = new THREE.Vector3(0.68, 0.22, 0.70).normalize()
    matA.userData.baseShimmerStrength = u.uShimmerStrength.value
  }
  const a = new THREE.LineSegments(geoA, matA)
  a.renderOrder = 2
  a.frustumCulled = false
  a.onBeforeRender = () => {
    matA.uniforms.uCameraPos.value.copy((camera as any).position)
    matA.uniforms.uOpacity.value = matA.opacity
  }

  // outer aura
  const geoB = buildGridGeometry(radius * 1.052, latStep, lonStep)
  const matB = createLineFadeMaterial(GOOGLE_COLORS.lightBlue, opacityOuter, 0.48, 0.96, 1.55, 'limb')
  matB.blending = THREE.AdditiveBlending
  {
    const u: any = matB.uniforms
    u.uShimmerStrength.value = 0.24
    u.uShimmerSpeed.value = 0.92
    u.uShimmerPulse.value = 0.24
    u.uShimmerScale.value = 0.85
    u.uShimmerWidth.value = 0.18
    u.uShimmerColor.value = GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.lightBlue, 0.68)
    u.uShimmerDir.value = new THREE.Vector3(0.68, 0.22, 0.70).normalize()
    matB.userData.baseShimmerStrength = u.uShimmerStrength.value
  }
  const b = new THREE.LineSegments(geoB, matB)
  b.renderOrder = 2
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
  // coarse (10°)
  const coarse = makeLayer(radius, 10, 10, 0.034, 0.056, camera)
  // fine (5°) — quadrados menores
  const fine = makeLayer(radius, 5, 5, 0.026, 0.046, camera)

  // começa com coarse visível e fine “apagado”
  let coarseAlpha = 1
  let fineAlpha = 0
  // guarda os opacities base pra multiplicar
  const coarseBase = coarse.mats.map(m => m.opacity)
  const fineBase = fine.mats.map(m => m.opacity)

  // aplica opacidade inicial
  coarse.mats.forEach((m, i) => (m.opacity = coarseBase[i] * coarseAlpha))
  fine.mats.forEach((m, i) => (m.opacity = fineBase[i] * fineAlpha))

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
    const zoomAlpha = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cameraDistance, 16.5, 23.5, 1.0, 0.0),
      0,
      1
    )

    // thresholds ajustados pro teu setup (camera z ~ 25, minDistance 14, maxDistance 40)
    // onde começa a “trocar”
    const t0 = 22.5 // acima disso: coarse domina
    const t1 = 18.5 // abaixo disso: fine domina

    // normaliza 0..1 (0=coarse, 1=fine)
    const u = THREE.MathUtils.clamp((t0 - cameraDistance) / (t0 - t1), 0, 1)

    // alvo
    const coarseTarget = (1 - u) * zoomAlpha
    const fineTarget = u * zoomAlpha

    // smoothing (Google feel)
    const smoothing = 0.08 // 0.08..0.18

    coarseAlpha += (coarseTarget - coarseAlpha) * smoothing
    fineAlpha += (fineTarget - fineAlpha) * smoothing

    // aplica opacidade (multiplica base)
    coarse.mats.forEach((m, i) => (m.opacity = coarseBase[i] * coarseAlpha))
    fine.mats.forEach((m, i) => (m.opacity = fineBase[i] * fineAlpha))

    // micro-otimização: se alpha quase zero, desliga render
    coarse.group.visible = coarseAlpha > 0.02
    fine.group.visible = fineAlpha > 0.02
  }

  return { group, update, materials: [...coarse.mats, ...fine.mats] }
}
