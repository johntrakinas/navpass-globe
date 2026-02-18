import * as THREE from 'three';
import { latLongToVector3 } from './latLongtoVector3';
import vertexShader from '../shaders/points.vert?raw';
import fragmentShader from '../shaders/points.frag?raw';
import { GOOGLE_COLORS } from '../theme/googleColors';
import { scaleThickness } from './thicknessScale'

export function createLanguagePoints(data: any[], radius: number) {
  const geometry = new THREE.BufferGeometry();

  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];

  const color = new THREE.Color();

  for (const lang of data) {
    const lat = Number(lang.latitude);
    const lng = Number(lang.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      console.warn('Ponto inválido:', lang);
      continue;
    }

    const v = latLongToVector3(lat, lng, radius * 1.01);

    positions.push(v.x, v.y, v.z);

    color.copy(GOOGLE_COLORS.white);
    colors.push(color.r, color.g, color.b);

    // Smaller footprint to keep nearby airports visually separable.
    sizes.push(Math.random() * 0.34 + 0.58);
    seeds.push(Math.random());
  }

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 3)
  );
  geometry.setAttribute(
    'size',
    new THREE.Float32BufferAttribute(sizes, 1)
  );
  geometry.setAttribute(
    'aSeed',
    new THREE.Float32BufferAttribute(seeds, 1)
  );

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uCameraDistance: { value: 0 },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
      uAlphaMul: { value: 0.98 },
      uFlowSpeed: { value: 0.058 },
      uFlowWidth: { value: 0.13 },
      uFlowStrength: { value: 0.82 },
      uFlowColor: { value: GOOGLE_COLORS.white.clone().lerp(GOOGLE_COLORS.yellow, 0.22) },
      uFlowDir: { value: new THREE.Vector3(0.74, 0.18, 0.65).normalize() },
      uFlowScale: { value: 0.16 },
      uSizeMul: { value: scaleThickness(1.0) }
    }
  });


  const points = new THREE.Points(geometry, material);
  points.renderOrder = 4
  points.frustumCulled = false

  return { points, material };
}
