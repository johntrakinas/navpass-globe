precision mediump float;

uniform float uTime;
uniform float uCameraDistance;
uniform vec3 uColorMul;
uniform float uAlphaMul;
uniform float uFlowSpeed;
uniform float uFlowWidth;
uniform float uFlowStrength;
uniform vec3 uFlowColor;

varying vec3 vColor;
varying float vSeed;
varying float vFacing;
varying float vFlowCoord;

void main() {
  // Coordenada dentro do ponto (0–1)
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);

  // Keep only a small footprint to avoid visible circular sprites.
  if (d > 0.44) discard;

  float core = smoothstep(0.11, 0.0, d);
  float soft = smoothstep(0.30, 0.08, d);
  float pointMask = smoothstep(0.24, 0.03, d);

  // Keep dots stable; only a very subtle slow variation.
  float shimmer = 0.98 + 0.02 * sin(uTime * 0.45 + vSeed * 6.2831);
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomFade = 0.35 + 0.65 * zoom;

  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.25);

  // Traveling sweep light: bright head passes through dots over time.
  float phase = fract(vFlowCoord + uTime * uFlowSpeed + vSeed * 0.07);
  float dHead = abs(phase - 0.5);
  dHead = min(dHead, 1.0 - dHead);
  float sweep = smoothstep(uFlowWidth, 0.0, dHead);
  float sweepLocal = sweep * pointMask;

  vec3 baseCol = vColor * uColorMul * shimmer;
  vec3 col = mix(baseCol, uFlowColor, sweepLocal * uFlowStrength);

  float alpha = (core * 0.9 + soft * 0.22);
  float outAlpha = alpha * zoomFade * uAlphaMul * limb * (1.0 + sweepLocal * 0.25 * uFlowStrength);

  gl_FragColor = vec4(col, outAlpha);
}
