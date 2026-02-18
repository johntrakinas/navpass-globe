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
  if (d > 0.46) discard;

  float core = smoothstep(0.14, 0.0, d);
  float soft = smoothstep(0.34, 0.09, d);
  float pointMask = smoothstep(0.28, 0.03, d);

  // Coordinated shimmer wave (global, not random per point).
  float shimmer = 0.96 + 0.04 * sin(uTime * 0.75 + vFlowCoord * 6.2831);
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomFade = 0.35 + 0.65 * zoom;

  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.25);

  // Coordinated network glow: two sweeping bands + global breathing pulse.
  float phaseA = fract(vFlowCoord + uTime * uFlowSpeed);
  float dHeadA = abs(phaseA - 0.5);
  dHeadA = min(dHeadA, 1.0 - dHeadA);
  float sweepA = smoothstep(uFlowWidth, 0.0, dHeadA);

  float phaseB = fract(vFlowCoord * 0.64 - uTime * (uFlowSpeed * 0.62) + 0.18);
  float dHeadB = abs(phaseB - 0.5);
  dHeadB = min(dHeadB, 1.0 - dHeadB);
  float sweepB = smoothstep(uFlowWidth * 1.15, 0.0, dHeadB);

  float syncPulse = 0.5 + 0.5 * sin(uTime * 0.92);
  float syncGate = smoothstep(0.34, 1.0, syncPulse);

  float sweep = max(sweepA, sweepB * 0.72) * (0.74 + 0.26 * syncGate);
  float sweepLocal = sweep * pointMask;

  vec3 baseCol = vColor * uColorMul * shimmer;
  vec3 col = mix(baseCol, uFlowColor, sweepLocal * uFlowStrength);
  col = mix(col, uFlowColor, syncGate * 0.12);

  float alpha = (core * 0.95 + soft * 0.28);
  float networkPulse = 0.88 + 0.12 * sin(uTime * 1.08);
  float outAlpha =
    alpha *
    zoomFade *
    uAlphaMul *
    limb *
    networkPulse *
    (1.0 + sweepLocal * 0.34 * uFlowStrength);

  gl_FragColor = vec4(col, outAlpha);
}
