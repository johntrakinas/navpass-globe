import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { GOOGLE_COLORS } from '../theme/googleColors'

import vert from '../shaders/nightLights.vert?raw'
import frag from '../shaders/nightLights.frag?raw'

type Airport = {
  latitude: number
  longitude: number
}

export function createNightLights(airports: Airport[], radius: number) {
  const positions: number[] = []
  const colors: number[] = []
  const sizes: number[] = []
  const seeds: number[] = []

  const warmA = GOOGLE_COLORS.yellow.clone().lerp(GOOGLE_COLORS.white, 0.35)
  const warmB = GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.yellow, 0.25)

  const col = new THREE.Color()

  for (const a of airports) {
    const lat = Number((a as any).latitude)
    const lon = Number((a as any).longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const v = latLongToVector3(lat, lon, radius * 1.007)
    positions.push(v.x, v.y, v.z)

    // Subtle per-point warm variation.
    col.copy(warmA).lerp(warmB, Math.random())
    colors.push(col.r, col.g, col.b)

    sizes.push(1.8 + Math.random() * 1.3)
    seeds.push(Math.random())
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  geo.computeBoundingSphere()

  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uCameraDistance: { value: 25 },
      uSunDir: { value: new THREE.Vector3(1, 0.2, 0.35).normalize() },
      uWarmA: { value: warmA.clone() },
      uWarmB: { value: warmB.clone() },
      uAlpha: { value: 0.35 }
    }
  })

  const points = new THREE.Points(geo, mat)
  points.name = 'nightLights'
  points.renderOrder = 1.85
  points.frustumCulled = false

  function update(timeSeconds: number, cameraDistance: number, sunDirWorld: THREE.Vector3) {
    mat.uniforms.uTime.value = timeSeconds
    mat.uniforms.uCameraDistance.value = cameraDistance
    mat.uniforms.uSunDir.value.copy(sunDirWorld)

    // Very subtle boost when zoomed in.
    const zoom = THREE.MathUtils.clamp((32 - cameraDistance) / 16, 0, 1)
    mat.uniforms.uAlpha.value = THREE.MathUtils.lerp(0.22, 0.38, zoom)
  }

  return { points, material: mat, update }
}
