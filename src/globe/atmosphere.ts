import * as THREE from 'three'
import { GOOGLE_COLORS } from '../theme/googleColors'

const VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
precision mediump float;

uniform vec3 uRimColor;
uniform vec3 uCoreColor;
uniform float uIntensity;
uniform float uPower;
uniform float uDistanceFade;
uniform float uAngleFade;
uniform vec3 uCameraPos;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(uCameraPos - vWorldPosition);
  float fresnel = 1.0 - max(0.0, dot(normalize(vNormal), viewDir));
  float rim = pow(fresnel, uPower);
  float halo = pow(fresnel, max(1.0, uPower * 0.65));

  vec3 color = mix(uCoreColor, uRimColor, clamp(pow(rim, 0.52), 0.0, 1.0));
  color = mix(color, uRimColor, halo * 0.32);

  float alpha = rim * uIntensity * uDistanceFade * uAngleFade;
  alpha *= 0.86 + 0.22 * halo;

  gl_FragColor = vec4(color, alpha);
}
`

export function createAtmosphere(radius: number, camera: THREE.Camera) {
  function createAtmosphereLayer(options: {
    radiusScale: number
    intensity: number
    power: number
    coreColor: THREE.Color
    rimColor: THREE.Color
    side: THREE.Side
    renderOrder: number
    fadeNear: number
    fadeFar: number
    angleNear: number
    angleFar: number
  }) {
    const geometry = new THREE.SphereGeometry(radius * options.radiusScale, 96, 96)
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uRimColor: { value: options.rimColor },
        uCoreColor: { value: options.coreColor },
        uIntensity: { value: options.intensity },
        uPower: { value: options.power },
        uDistanceFade: { value: 1.0 },
        uAngleFade: { value: 1.0 },
        uCameraPos: { value: new THREE.Vector3() }
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: options.side
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = options.renderOrder
    mesh.frustumCulled = false
    mesh.onBeforeRender = () => {
      const camPos = (camera as any).position as THREE.Vector3
      ;(material.uniforms.uCameraPos.value as THREE.Vector3).copy(camPos)
      const camDistance = camPos.length()
      material.uniforms.uDistanceFade.value = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(camDistance, 14, 40, options.fadeNear, options.fadeFar),
        Math.min(options.fadeNear, options.fadeFar),
        Math.max(options.fadeNear, options.fadeFar)
      )
      material.uniforms.uAngleFade.value = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(camDistance, 14, 40, options.angleNear, options.angleFar),
        Math.min(options.angleNear, options.angleFar),
        Math.max(options.angleNear, options.angleFar)
      )
    }

    return { mesh, material }
  }

  const innerLayer = createAtmosphereLayer({
    radiusScale: 1.028,
    intensity: 0.108,
    power: 2.25,
    coreColor: GOOGLE_COLORS.deepBlue.clone().multiplyScalar(0.14),
    rimColor: GOOGLE_COLORS.lightBlue.clone().lerp(GOOGLE_COLORS.white, 0.42),
    side: THREE.BackSide,
    renderOrder: 10,
    fadeNear: 1.0,
    fadeFar: 0.70,
    angleNear: 0.94,
    angleFar: 0.74
  })

  const outerLayer = createAtmosphereLayer({
    radiusScale: 1.052,
    intensity: 0.078,
    power: 1.95,
    coreColor: GOOGLE_COLORS.deepBlue.clone().multiplyScalar(0.08),
    rimColor: GOOGLE_COLORS.lightBlue.clone().lerp(GOOGLE_COLORS.white, 0.56),
    side: THREE.BackSide,
    renderOrder: 11,
    fadeNear: 0.95,
    fadeFar: 0.60,
    angleNear: 0.90,
    angleFar: 0.68
  })

  const subsurfaceLayer = createAtmosphereLayer({
    radiusScale: 1.008,
    intensity: 0.024,
    power: 3.10,
    coreColor: GOOGLE_COLORS.deepBlue.clone().multiplyScalar(0.04),
    rimColor: GOOGLE_COLORS.lightBlue.clone().lerp(GOOGLE_COLORS.white, 0.22),
    side: THREE.FrontSide,
    renderOrder: 9,
    fadeNear: 0.88,
    fadeFar: 0.56,
    angleNear: 0.92,
    angleFar: 0.70
  })

  const group = new THREE.Group()
  group.add(subsurfaceLayer.mesh)
  group.add(innerLayer.mesh)
  group.add(outerLayer.mesh)

  function setLightDir(dir: THREE.Vector3) {
    void dir
  }

  return {
    group,
    setLightDir,
    materials: {
      inner: innerLayer.material,
      outer: outerLayer.material,
      subsurface: subsurfaceLayer.material
    }
  }
}
