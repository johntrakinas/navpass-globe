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

uniform vec3 uDayColor;
uniform vec3 uNightColor;
uniform vec3 uLightDir;
uniform float uIntensity;
uniform float uPower;
uniform float uDistanceFade;
uniform float uAngleFade;
uniform vec3 uCameraPos;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(uCameraPos - vWorldPosition);

  // Fresnel: 1 quando perpendicular (borda), 0 quando de frente
  float fresnel = 1.0 - max(0.0, dot(vNormal, viewDir));
  fresnel = pow(fresnel, uPower);

  float ndl = dot(normalize(vNormal), normalize(uLightDir));
  float day = smoothstep(-0.15, 0.35, ndl);
  vec3 color = mix(uNightColor, uDayColor, day);

  float alpha = fresnel * uIntensity * uDistanceFade * uAngleFade;
  alpha *= mix(0.79, 1.0, day);

  // Subtle "terminator" glow to help day/night feel coherent without overpowering.
  float terminator = 1.0 - abs(ndl);
  terminator = smoothstep(0.0, 0.72, terminator);
  float termTint = terminator * (0.35 + 0.65 * day);
  color = mix(color, uDayColor, termTint * 0.12);
  alpha *= 1.0 + terminator * 0.08;

  gl_FragColor = vec4(color, alpha);
}
`

export function createAtmosphere(radius: number, camera: THREE.Camera) {
  const geometry = new THREE.SphereGeometry(radius * 1.035, 96, 96)

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uDayColor: { value: GOOGLE_COLORS.deepBlue.clone().lerp(GOOGLE_COLORS.lightBlue, 0.58) },
      uNightColor: { value: GOOGLE_COLORS.deepBlue.clone().multiplyScalar(0.5) },
      uLightDir: { value: new THREE.Vector3(1, 0.2, 0.35).normalize() },
      uIntensity: { value: 0.07 },
      uPower: { value: 2.44 },
      uDistanceFade: { value: 1.0 },
      uAngleFade: { value: 1.0 },
      uCameraPos: { value: new THREE.Vector3() }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  })

    const inner = new THREE.Mesh(geometry, material)
  inner.renderOrder = 10
  inner.frustumCulled = false
  inner.onBeforeRender = () => {
    const camPos = (camera as any).position as THREE.Vector3
    ;(material.uniforms.uCameraPos.value as THREE.Vector3).copy(camPos)
    const camDistance = camPos.length()
    const fade = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camDistance, 14, 40, 1.0, 0.6),
      0.6,
      1.0
    )
    material.uniforms.uDistanceFade.value = fade
    material.uniforms.uAngleFade.value = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camDistance, 14, 40, 0.9, 0.7),
      0.7,
      0.9
    )
  }

  const geometry2 = new THREE.SphereGeometry(radius * 1.06, 96, 96)
  const material2 = material.clone()
  material2.uniforms = THREE.UniformsUtils.clone(material.uniforms)
  material2.uniforms.uIntensity.value = 0.046
  material2.uniforms.uPower.value = 2.3

  const outer = new THREE.Mesh(geometry2, material2)
  outer.renderOrder = 11
  outer.frustumCulled = false
  outer.onBeforeRender = () => {
    const camPos = (camera as any).position as THREE.Vector3
    ;(material2.uniforms.uCameraPos.value as THREE.Vector3).copy(camPos)
    const camDistance = camPos.length()
    const fade = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camDistance, 14, 40, 0.9, 0.5),
      0.5,
      0.9
    )
    material2.uniforms.uDistanceFade.value = fade
    material2.uniforms.uAngleFade.value = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camDistance, 14, 40, 0.85, 0.6),
      0.6,
      0.85
    )
  }

  // subsurface inner glow (mais profundo, muito sutil)
  const geometry3 = new THREE.SphereGeometry(radius * 1.01, 96, 96)
  const material3 = material.clone()
  material3.uniforms = THREE.UniformsUtils.clone(material.uniforms)
  material3.uniforms.uDayColor.value = GOOGLE_COLORS.lightBlue.clone()
  material3.uniforms.uNightColor.value = GOOGLE_COLORS.blue.clone().multiplyScalar(0.4)
  material3.uniforms.uIntensity.value = 0.036
  material3.uniforms.uPower.value = 2.9

  const subsurface = new THREE.Mesh(geometry3, material3)
  subsurface.renderOrder = 9
  subsurface.frustumCulled = false
  subsurface.material.side = THREE.FrontSide
  subsurface.onBeforeRender = () => {
    const camPos = (camera as any).position as THREE.Vector3
    ;(material3.uniforms.uCameraPos.value as THREE.Vector3).copy(camPos)
    const camDistance = camPos.length()
    const fade = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camDistance, 14, 40, 0.85, 0.56),
      0.56,
      0.85
    )
    material3.uniforms.uDistanceFade.value = fade
    material3.uniforms.uAngleFade.value = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(camDistance, 14, 40, 0.9, 0.65),
      0.65,
      0.9
    )
  }

  const group = new THREE.Group()
  group.add(subsurface)
  group.add(inner)
  group.add(outer)
  function setLightDir(dir: THREE.Vector3) {
    material.uniforms.uLightDir.value.copy(dir)
    material2.uniforms.uLightDir.value.copy(dir)
    material3.uniforms.uLightDir.value.copy(dir)
  }

  return { group, setLightDir }

}
