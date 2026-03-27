import * as THREE from 'three'
import { GOOGLE_COLORS } from '../theme/googleColors'

const VERT = /* glsl */ `
varying vec3 vWorldNormal;

void main() {
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG_NIGHT = /* glsl */ `
precision mediump float;

uniform vec3 uLightDir;
uniform vec3 uShadowColor;
uniform float uShadowStrength;
uniform float uTerminatorSoftness;

varying vec3 vWorldNormal;

void main() {
  float ndl = dot(normalize(vWorldNormal), normalize(uLightDir));
  float day = smoothstep(-uTerminatorSoftness, uTerminatorSoftness, ndl);
  float night = 1.0 - day;

  // Stronger deep-night, softer near the terminator (prevents "muddy" edges).
  float deep = pow(clamp(-ndl, 0.0, 1.0), 0.75);
  float alpha = night * uShadowStrength * (0.55 + 0.45 * deep);
  gl_FragColor = vec4(uShadowColor, alpha);
}
`

const FRAG_DAY = /* glsl */ `
precision mediump float;

uniform vec3 uLightDir;
uniform vec3 uDayColor;
uniform float uDayStrength;
// Gaussian width: lower = wider/softer blob, higher = tighter ring.
// Range 1.0 (very wide, near-flat) to 12.0 (narrow). Controlled by lightRadius option.
uniform float uGaussianFalloff;

varying vec3 vWorldNormal;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 l = normalize(uLightDir);
  float ndl = dot(n, l);
  // d = angular distance from spot center (0 = center, 1 = 90° away).
  // exp(-d²·k) gives a true Gaussian: zero slope at center, smooth rolloff outward.
  float d = 1.0 - clamp(ndl, 0.0, 1.0);
  float weight = exp(-d * d * uGaussianFalloff);
  gl_FragColor = vec4(uDayColor, weight * uDayStrength);
}
`

export function createLightingShell(radius: number) {
  const geometry = new THREE.SphereGeometry(radius * 1.001, 96, 96)

  const nightMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG_NIGHT,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.MultiplyBlending,
    side: THREE.FrontSide,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(1.0, 0.2, 0.35).normalize() },
      uShadowColor: { value: GOOGLE_COLORS.deepBlue.clone().lerp(GOOGLE_COLORS.lightBlue, 0.22).multiplyScalar(0.62) },
      uShadowStrength: { value: 0.26 },
      uTerminatorSoftness: { value: 0.28 }
    }
  })

  const dayMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG_DAY,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(1.0, 0.2, 0.35).normalize() },
      uDayColor: { value: GOOGLE_COLORS.lightBlue.clone().lerp(GOOGLE_COLORS.white, 0.14) },
      uDayStrength: { value: 0.075 },
      uGaussianFalloff: { value: 4.0 }
    }
  })

  const night = new THREE.Mesh(geometry, nightMaterial)
  night.renderOrder = 1
  night.frustumCulled = false

  const day = new THREE.Mesh(geometry, dayMaterial)
  day.renderOrder = 2
  day.frustumCulled = false

  const group = new THREE.Group()
  group.add(night)
  group.add(day)

  return { group, nightMaterial, dayMaterial, nightMesh: night, dayMesh: day }
}
