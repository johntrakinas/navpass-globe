import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { scaleThickness } from './thicknessScale'

let current: THREE.Object3D | null = null
let currentMats: THREE.ShaderMaterial[] = []
let pulsePhase = Math.random() * Math.PI * 2

const VERT = /* glsl */ `
attribute float aT;
attribute float aSeed;
uniform float uPulse;
uniform float uThickness;
varying float vT;
varying float vSeed;

void main() {
  vT = aT;
  vSeed = aSeed;
  vec3 p = position * (1.0 + uPulse + uThickness);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const FRAG = /* glsl */ `
precision mediump float;
uniform float uTime;
uniform float uOpacity;
varying float vT;
varying float vSeed;

vec3 googlePaletteSmooth(float t) {
  vec3 c0 = vec3(0.2588, 0.5216, 0.9569); // blue
  vec3 c1 = vec3(0.2039, 0.6588, 0.3255); // green
  vec3 c2 = vec3(0.9843, 0.7373, 0.0196); // yellow
  vec3 c3 = vec3(0.9176, 0.2627, 0.2078); // red

  float a = smoothstep(0.0, 1.0, sin(t * 6.2831) * 0.5 + 0.5);
  vec3 mix1 = mix(c0, c1, a);
  vec3 mix2 = mix(c2, c3, a);
  return mix(mix1, mix2, smoothstep(0.0, 1.0, cos(t * 3.1416) * 0.5 + 0.5));
}

void main() {
  float flow = vT + uTime * 0.06 + vSeed * 0.05;
  float hue = fract(flow);
  float shimmer = 0.75 + 0.25 * sin((flow + uTime * 0.18) * 6.2831);
  vec3 color = googlePaletteSmooth(hue) * shimmer;
  gl_FragColor = vec4(color, uOpacity);
}
`

function createHighlightMaterial(opacity: number, thickness: number) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uPulse: { value: 0 },
      uThickness: { value: thickness }
    }
  })
  mat.userData.baseOpacity = opacity
  mat.userData.baseThickness = thickness
  return mat
}

export function highlightCountryFromFeature(
  feature: any,
  parent: THREE.Object3D,
  radius: number
) {
  if (current) {
    clearHighlight(parent)
  }

  const group = new THREE.Group()
  const geom = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  // Two-pass render to fake thicker country outline in WebGL line rendering.
  const glowMat = createHighlightMaterial(0.64, scaleThickness(0.0056))
  const coreMat = createHighlightMaterial(1.0, scaleThickness(0.0015))
  currentMats = [glowMat, coreMat]
  pulsePhase = Math.random() * Math.PI * 2

  for (const poly of polys) {
    for (const ring of poly) {
      const pts: THREE.Vector3[] = []
      const tValues: number[] = []
      const seedValues: number[] = []

      for (const [lng, lat] of ring) {
        const v = latLongToVector3(lat, lng, radius * 1.008)
        pts.push(v)
      }

      const ringSeed = Math.random()
      for (let i = 0; i < pts.length; i++) {
        tValues.push(i / Math.max(1, pts.length - 1))
        seedValues.push(ringSeed)
      }

      const lineGeomGlow = new THREE.BufferGeometry().setFromPoints(pts)
      lineGeomGlow.setAttribute('aT', new THREE.Float32BufferAttribute(tValues, 1))
      lineGeomGlow.setAttribute('aSeed', new THREE.Float32BufferAttribute(seedValues, 1))

      const lineGeomCore = lineGeomGlow.clone()
      const glowLine = new THREE.Line(lineGeomGlow, glowMat)
      const coreLine = new THREE.Line(lineGeomCore, coreMat)
      glowLine.renderOrder = 10
      coreLine.renderOrder = 11

      group.add(glowLine)
      group.add(coreLine)
    }
  }

  parent.add(group)
  current = group
}

export function clearHighlight(parent: THREE.Object3D) {
  if (!current) return
  parent.remove(current)
  current.traverse(obj => {
    if (obj instanceof THREE.Line) {
      obj.geometry.dispose()
    }
  })
  for (const mat of currentMats) {
    mat.dispose()
  }
  currentMats = []
  current = null
}

export function updateCountryHighlight(timeSeconds: number) {
  if (!currentMats.length) return
  const pulse = 0.011 + 0.009 * Math.sin(timeSeconds * 1.8 + pulsePhase)
  const alpha = 0.82 + 0.18 * Math.sin(timeSeconds * 1.6 + pulsePhase)

  for (const mat of currentMats) {
    const baseOpacity = Number(mat.userData.baseOpacity ?? 0.8)
    const thickness = Number(mat.userData.baseThickness ?? 0)
    mat.uniforms.uTime.value = timeSeconds
    mat.uniforms.uPulse.value = pulse * (thickness > 0.003 ? 0.72 : 1.0)
    mat.uniforms.uOpacity.value = alpha * baseOpacity
  }
}
