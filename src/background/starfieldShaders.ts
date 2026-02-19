import * as THREE from 'three'
import { GOOGLE_COLORS } from '../theme/googleColors'

export function createStarfieldShader({
  count = 6000,
  radius = 420,
  size = 0.9,
  opacity = 0.65
} = {}) {
  const VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vColor = color;
    vSeed = aSeed;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pointSize = ${size.toFixed(2)} * (220.0 / max(1.0, -mvPosition.z));
    gl_PointSize = clamp(pointSize, 1.5, 6.0);
    gl_Position = projectionMatrix * mvPosition;
  }
  `

  const FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float alpha = 1.0 - smoothstep(0.05, 0.5, d);
    float twinkle = 0.7 + 0.3 * sin(uTime * 1.3 + vSeed * 6.2831);
    gl_FragColor = vec4(vColor * twinkle, alpha * uOpacity);
  }
  `

  const geometry = new THREE.BufferGeometry()

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const seeds = new Float32Array(count)

  const c = new THREE.Color()
  const warm = GOOGLE_COLORS.yellow.clone()
  const coolA = GOOGLE_COLORS.lightBlue.clone()
  const coolB = GOOGLE_COLORS.blue.clone()
  const white = GOOGLE_COLORS.white.clone()

  for (let i = 0; i < count; i++) {
    // volume esférico com bias pra fora (mais "céu")
    const r = radius * (0.35 + 0.65 * Math.pow(Math.random(), 0.35))
    const theta = Math.random() * Math.PI * 2
    const u = Math.random() * 2 - 1
    const phi = Math.acos(u)

    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.sin(phi) * Math.sin(theta)
    const z = r * Math.cos(phi)

    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    // Google-like: azuis sutis + poucos quentes, brilho controlado
    const t = Math.random()
    const base = coolA.clone().lerp(coolB, Math.random() * 0.6)
    const mixWhite = 0.55 + Math.random() * 0.35
    c.copy(base).lerp(white, mixWhite)

    if (t > 0.92) {
      c.lerp(warm, 0.18 + Math.random() * 0.18)
    }

    const brightness = 0.35 + Math.pow(Math.random(), 0.35) * 0.65
    c.multiplyScalar(brightness)

    colors[i * 3 + 0] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
    seeds[i] = Math.random()
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity }
    }
  })

  const points = new THREE.Points(geometry, material)
  points.renderOrder = -50
  points.frustumCulled = false // garante que não “some”

  return { points, material }
}
