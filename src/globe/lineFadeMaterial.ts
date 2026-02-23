import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  vec3 objNormal = normalize(position);
  vWorldNormal = normalize((modelMatrix * vec4(objNormal, 0.0)).xyz);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
precision mediump float;

uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uCameraPos;
uniform float uFadeMin;
uniform float uFadeMax;
uniform float uRolloff;
uniform float uMode;
uniform float uTime;
uniform float uShimmerStrength;
uniform float uShimmerSpeed;
uniform float uShimmerPulse;
uniform float uShimmerScale;
uniform float uShimmerWidth;
uniform vec3 uShimmerColor;
uniform vec3 uShimmerDir;
uniform vec3 uGradientColor;
uniform vec3 uGradientDir;
uniform float uGradientStrength;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float ndv = max(0.0, dot(vWorldNormal, viewDir));
  // uMode: 0 => visible on center/front (ndv); 1 => visible near limb (1-ndv)
  float t = mix(ndv, 1.0 - ndv, step(0.5, uMode));
  float fade = smoothstep(uFadeMin, uFadeMax, t);
  fade = pow(fade, uRolloff);

  vec3 gdir = normalize(uGradientDir);
  float gradientStatic = 0.5 + 0.5 * dot(normalize(vWorldNormal), gdir);
  float gradientDrift = 0.5 + 0.5 * sin(dot(vWorldPos, gdir) * 0.14 + uTime * 0.22);
  float gradientMix = mix(gradientStatic, gradientDrift, 0.28);
  gradientMix = smoothstep(0.08, 0.92, gradientMix);

  // Subtle Google-ish shimmering pass.
  // - A narrow band slides across the globe and occasionally brightens.
  // - Disabled by default (uShimmerStrength=0).
  float shimmer = 0.0;
  if (uShimmerStrength > 0.001) {
    vec3 sdir = normalize(uShimmerDir);
    float seed = fract(sin(dot(vWorldPos.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float phase = dot(vWorldPos, sdir) * uShimmerScale + uTime * uShimmerSpeed + seed * 6.2831853;
    float band = smoothstep(1.0 - uShimmerWidth, 1.0, sin(phase));

    // Occasional boost (low duty cycle).
    float burst = smoothstep(0.88, 1.0, sin(uTime * uShimmerPulse));
    shimmer = band * mix(0.22, 1.0, burst);
    shimmer *= fade;
  }

  vec3 gradientColor = mix(uColor, uGradientColor, gradientMix * uGradientStrength);
  vec3 color = mix(gradientColor, uShimmerColor, shimmer * uShimmerStrength);
  float alpha = uOpacity * fade;
  alpha *= 1.0 + shimmer * uShimmerStrength * 0.55;

  gl_FragColor = vec4(color, alpha);
}
`

export type LineFadeMode = 'center' | 'limb'

export function createLineFadeMaterial(
  color: THREE.ColorRepresentation,
  opacity: number,
  fadeMin = 0.30,
  fadeMax = 0.65,
  rolloff = 1.35,
  mode: LineFadeMode = 'center'
) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uCameraPos: { value: new THREE.Vector3() },
      uFadeMin: { value: fadeMin },
      uFadeMax: { value: fadeMax },
      uRolloff: { value: rolloff },
      uMode: { value: mode === 'limb' ? 1 : 0 },
      uTime: { value: 0 },
      uShimmerStrength: { value: 0 },
      uShimmerSpeed: { value: 1.15 },
      uShimmerPulse: { value: 0.32 },
      uShimmerScale: { value: 0.95 },
      uShimmerWidth: { value: 0.16 },
      uShimmerColor: { value: new THREE.Color(0xffffff) },
      uShimmerDir: { value: new THREE.Vector3(0.65, 0.18, 0.74).normalize() },
      uGradientColor: { value: new THREE.Color(0xffffff) },
      uGradientDir: { value: new THREE.Vector3(0.42, 0.88, -0.22).normalize() },
      uGradientStrength: { value: 0.0 }
    }
  })
  // Keep Three's `material.opacity` in sync with our custom uniform.
  material.opacity = opacity
  material.userData.baseOpacity = opacity
  material.userData.baseFadeMin = fadeMin
  material.userData.baseFadeMax = fadeMax
  material.userData.baseRolloff = rolloff
  material.userData.fadeMode = mode
  material.userData.baseGradientStrength = 0
  return material
}
