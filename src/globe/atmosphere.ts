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
// Multiplicative tint applied to the final layer color.
// vec3(1,1,1) = no change; set to any hue to recolor the glow at runtime.
uniform vec3 uGlowColor;
// 1.0 for the FrontSide inner-glow layer, 0.0 for BackSide halo layers.
// Enables gradient edge-softening on the inner layer without affecting the rim.
uniform float uFrontSide;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(uCameraPos - vWorldPosition);
  float fresnel = 1.0 - max(0.0, dot(normalize(vNormal), viewDir));
  float rim = pow(fresnel, uPower);
  float halo = pow(fresnel, max(1.0, uPower * 0.65));

  vec3 color = mix(uCoreColor, uRimColor, clamp(pow(rim, 0.52), 0.0, 1.0));
  color = mix(color, uRimColor, halo * 0.32);

  // Chromatic limb brightening: the very outer edge gains an extra glow
  // ring, simulating atmospheric scattering at the horizon.
  float limb = pow(fresnel, max(0.5, uPower * 0.25));
  color += uRimColor * limb * 0.18;

  // Apply runtime glow tint — multiplicative so white is a no-op.
  color *= uGlowColor;

  // Border fade: smooth the outer boundary of the inner glow layer so it
  // dissolves into the rim instead of cutting off. Applied only on the
  // FrontSide layer (uFrontSide = 1) because BackSide layers always have
  // fresnel ≈ 1 and would be zeroed otherwise.
  float edgeFade = 1.0 - smoothstep(0.76, 0.98, fresnel) * uFrontSide;

  float alpha = rim * uIntensity * uDistanceFade * uAngleFade * edgeFade;
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
        uCameraPos: { value: new THREE.Vector3() },
        uGlowColor: { value: new THREE.Color(1, 1, 1) },
        uFrontSide: { value: options.side === THREE.FrontSide ? 1.0 : 0.0 }
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
    radiusScale: 1.052,
    intensity: 0.118,
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
    radiusScale: 1.090,
    intensity: 0.090,
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

  // FrontSide layer: creates the wide inner gradient visible on the globe face.
  // power: 0.70 flattens the Fresnel curve so the bloom covers ~80% of the face.
  // edgeFade in the shader (uFrontSide=1) dissolves it smoothly at the rim.
  const subsurfaceLayer = createAtmosphereLayer({
    radiusScale: 1.016,
    intensity: 0.095,
    power: 0.70,
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

  /**
   * Recolor the entire atmosphere glow at runtime.
   *
   * The color is applied as a multiplicative tint over each layer's computed
   * rim/core colors, so the soft Fresnel falloff shape is preserved.
   *
   * @example
   * // Warm amber glow
   * atmosphere.setGlowColor(new THREE.Color('#FF9F40'))
   *
   * // Reset to neutral (white = no tint)
   * atmosphere.setGlowColor(new THREE.Color(1, 1, 1))
   */
  function setGlowColor(color: THREE.Color) {
    ;(innerLayer.material.uniforms.uGlowColor.value as THREE.Color).copy(color)
    ;(outerLayer.material.uniforms.uGlowColor.value as THREE.Color).copy(color)
    ;(subsurfaceLayer.material.uniforms.uGlowColor.value as THREE.Color).copy(color)
  }

  return {
    group,
    setLightDir,
    setGlowColor,
    materials: {
      inner: innerLayer.material,
      outer: outerLayer.material,
      subsurface: subsurfaceLayer.material
    }
  }
}
