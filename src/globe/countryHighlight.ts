import * as THREE from 'three'
import { latLongToVector3 } from './latLongtoVector3'
import { scaleThickness } from './thicknessScale'
import { computeCountryStrokeScale } from './countryStrokeScale'

export type CountryHighlightPaletteTheme = {
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  colorC?: THREE.ColorRepresentation
  colorD?: THREE.ColorRepresentation
}

let current: THREE.Object3D | null = null
let currentMats: THREE.ShaderMaterial[] = []
let pulsePhase = Math.random() * Math.PI * 2
const SELECT_RADIUS_MULT = 1.004
const SELECT_SCALE = 1.02
const SELECT_BREATH_BASE = 0.0015
const SELECT_BREATH_AMP = 0.006
let selectedBorderLineWidthHint = 1.8
let activeFeatureStrokeScale = 1
const SELECT_CORE_THICKNESS_PER_BORDER_WIDTH = 0.00084 / 1.8
const SELECT_MIN_CORE_THICKNESS = 0.00072
const SELECT_GLOW_TO_CORE_RATIO = 1.04
const selectedPalette = {
  a: new THREE.Color('#ffffff'),
  b: new THREE.Color('#FBBC05'),
  c: new THREE.Color('#ffffff'),
  d: new THREE.Color('#FBBC05')
}

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
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;
varying float vT;
varying float vSeed;

vec3 googlePaletteSmooth(float t) {
  float a = smoothstep(0.0, 1.0, sin(t * 6.2831) * 0.5 + 0.5);
  vec3 mix1 = mix(uColorA, uColorB, a);
  vec3 mix2 = mix(uColorC, uColorD, a);
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

function applySelectedPalette(mat: THREE.ShaderMaterial) {
  ;(mat.uniforms.uColorA.value as THREE.Color).copy(selectedPalette.a)
  ;(mat.uniforms.uColorB.value as THREE.Color).copy(selectedPalette.b)
  ;(mat.uniforms.uColorC.value as THREE.Color).copy(selectedPalette.c)
  ;(mat.uniforms.uColorD.value as THREE.Color).copy(selectedPalette.d)
}

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
      uThickness: { value: thickness },
      uColorA: { value: selectedPalette.a.clone() },
      uColorB: { value: selectedPalette.b.clone() },
      uColorC: { value: selectedPalette.c.clone() },
      uColorD: { value: selectedPalette.d.clone() }
    }
  })
  mat.userData.baseOpacity = opacity
  mat.userData.baseThickness = thickness
  applySelectedPalette(mat)
  return mat
}

function computeSelectedCoreThickness(strokeScale: number) {
  const widthHint = THREE.MathUtils.clamp(selectedBorderLineWidthHint * strokeScale, 0.35, 4)
  return Math.max(
    scaleThickness(SELECT_MIN_CORE_THICKNESS),
    scaleThickness(SELECT_CORE_THICKNESS_PER_BORDER_WIDTH * widthHint)
  )
}

function applySelectedStrokeThickness(glowMat: THREE.ShaderMaterial, coreMat: THREE.ShaderMaterial) {
  const coreThickness = computeSelectedCoreThickness(activeFeatureStrokeScale)
  glowMat.uniforms.uThickness.value = coreThickness * SELECT_GLOW_TO_CORE_RATIO
  coreMat.uniforms.uThickness.value = coreThickness
}

export function highlightCountryFromFeature(
  feature: any,
  parent: THREE.Object3D,
  radius: number
) {
  if (current) {
    clearHighlight(parent)
  }

  activeFeatureStrokeScale = computeCountryStrokeScale(feature)
  const group = new THREE.Group()
  const geom = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]

  // Two-pass render to fake thicker country outline in WebGL line rendering.
  const glowMat = createHighlightMaterial(0.64, scaleThickness(0.0009))
  const coreMat = createHighlightMaterial(1.0, scaleThickness(0.0005))
  applySelectedStrokeThickness(glowMat, coreMat)
  currentMats = [glowMat, coreMat]
  pulsePhase = Math.random() * Math.PI * 2

  for (const poly of polys) {
    for (const ring of poly) {
      const pts: THREE.Vector3[] = []
      const tValues: number[] = []
      const seedValues: number[] = []

      for (const [lng, lat] of ring) {
        const v = latLongToVector3(lat, lng, radius * SELECT_RADIUS_MULT)
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

  // Keep selected-country lift aligned with hover visual height.
  group.scale.setScalar(SELECT_SCALE)
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
  activeFeatureStrokeScale = 1
}

export function updateCountryHighlight(timeSeconds: number) {
  if (!currentMats.length) return
  const breathUp = 0.5 + 0.5 * Math.sin(timeSeconds * 1.85 + pulsePhase * 0.55)
  const pulse = SELECT_BREATH_BASE + SELECT_BREATH_AMP * breathUp
  const alpha = 0.82 + 0.18 * Math.sin(timeSeconds * 1.6 + pulsePhase)

  for (const mat of currentMats) {
    const baseOpacity = Number(mat.userData.baseOpacity ?? 0.8)
    const thickness = Number(mat.userData.baseThickness ?? 0)
    mat.uniforms.uTime.value = timeSeconds
    mat.uniforms.uPulse.value = pulse * (thickness > 0.003 ? 0.72 : 1.0)
    mat.uniforms.uOpacity.value = alpha * baseOpacity
  }
}

export function configureCountryHighlightPalette(theme: CountryHighlightPaletteTheme = {}) {
  if (theme.colorA !== undefined) selectedPalette.a.set(theme.colorA)
  if (theme.colorB !== undefined) selectedPalette.b.set(theme.colorB)
  if (theme.colorC !== undefined) selectedPalette.c.set(theme.colorC)
  if (theme.colorD !== undefined) selectedPalette.d.set(theme.colorD)

  for (const mat of currentMats) {
    applySelectedPalette(mat)
  }
}

export function setSelectedBorderLineWidth(lineWidthHint: number) {
  if (!Number.isFinite(lineWidthHint)) return
  selectedBorderLineWidthHint = THREE.MathUtils.clamp(lineWidthHint, 0.35, 4)
  if (currentMats.length >= 2) {
    applySelectedStrokeThickness(currentMats[0], currentMats[1])
  }
}
