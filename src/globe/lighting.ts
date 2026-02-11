import * as THREE from 'three'
import { GOOGLE_COLORS } from '../theme/googleColors'

const VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
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
uniform float uDaySoftness;

varying vec3 vWorldNormal;

void main() {
  float ndl = dot(normalize(vWorldNormal), normalize(uLightDir));
  float day = smoothstep(-uDaySoftness, uDaySoftness, ndl);
  // Concentrate the glow toward the subsolar point to avoid washing the globe.
  float lit = clamp(ndl, 0.0, 1.0);
  float beam = pow(lit, 1.7);
  float alpha = day * beam * uDayStrength;
  gl_FragColor = vec4(uDayColor, alpha);
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
      uDayStrength: { value: 0.055 },
      uDaySoftness: { value: 0.35 }
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

  return { group, nightMaterial, dayMaterial }
}
