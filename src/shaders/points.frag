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
  if (d > 0.48) discard;

  float core = 1.0 - smoothstep(0.0, 0.16, d);
  float soft = 1.0 - smoothstep(0.08, 0.34, d);
  float halo = 1.0 - smoothstep(0.12, 0.48, d);
  float pointMask = 1.0 - smoothstep(0.02, 0.30, d);

  // Coordinated shimmer wave (global, not random per point).
  float shimmer = 0.96 + 0.04 * sin(uTime * 0.75 + vFlowCoord * 6.2831);
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomFade = 0.62 + 0.38 * zoom;

  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.25);

  // Coordinated network glow: two sweeping bands + global breathing pulse.
  float phaseA = fract(vFlowCoord + uTime * (uFlowSpeed * 0.72));
  float dHeadA = abs(phaseA - 0.5);
  dHeadA = min(dHeadA, 1.0 - dHeadA);
  float sweepA = 1.0 - smoothstep(0.0, uFlowWidth, dHeadA);

  float phaseB = fract(vFlowCoord * 0.64 - uTime * (uFlowSpeed * 0.45) + 0.18);
  float dHeadB = abs(phaseB - 0.5);
  dHeadB = min(dHeadB, 1.0 - dHeadB);
  float sweepB = 1.0 - smoothstep(0.0, uFlowWidth * 1.15, dHeadB);

  float syncPulse = 0.5 + 0.5 * sin(uTime * 0.54);
  float syncGate = smoothstep(0.28, 1.0, syncPulse);

  float wavePhaseA = fract(vFlowCoord * 0.78 - uTime * (uFlowSpeed * 1.38) + 0.08);
  float waveHeadA = 1.0 - smoothstep(0.0, 0.08, wavePhaseA);
  float waveTrailA = smoothstep(0.0, 0.026, wavePhaseA) * (1.0 - smoothstep(0.08, 0.42, wavePhaseA));
  float waveBandA = max(waveHeadA, waveTrailA * 0.82);

  float wavePhaseB = fract(vFlowCoord * 0.78 - uTime * (uFlowSpeed * 1.38) + 0.54);
  float waveHeadB = 1.0 - smoothstep(0.0, 0.08, wavePhaseB);
  float waveTrailB = smoothstep(0.0, 0.026, wavePhaseB) * (1.0 - smoothstep(0.08, 0.42, wavePhaseB));
  float waveBandB = max(waveHeadB, waveTrailB * 0.82);

  float pulseHead = max(waveHeadA, waveHeadB * 0.84);
  float pulseTrail = max(waveTrailA, waveTrailB * 0.84);
  float pulseGate = max(waveBandA, waveBandB * 0.84);
  float pulseRadius = mix(0.13, 0.29, pulseHead * 0.88 + pulseTrail * 0.26 + syncGate * 0.14);
  float pulseRing = 1.0 - smoothstep(0.018, 0.115, abs(d - pulseRadius));
  float pulseAura = pulseRing * (pulseHead * 0.94 + pulseTrail * 0.58);
  float pulseGlow = (soft * 0.72 + halo * 0.34) * smoothstep(0.0, 0.95, pulseGate);

  float sweep = max(sweepA, sweepB * 0.72) * (0.74 + 0.26 * syncGate);
  float sweepLocal = sweep * pointMask;

  vec3 baseCol = vColor * uColorMul * shimmer;
  vec3 pulseGold = vec3(0.93, 0.74, 0.16);
  vec3 pulseColor = mix(uFlowColor, pulseGold, 0.82);
  vec3 glowColor = mix(uFlowColor, pulseGold, 0.34 + syncGate * 0.12);
  vec3 col = mix(baseCol, glowColor, sweepLocal * uFlowStrength);
  float pulseColorMix = smoothstep(0.0, 0.92, syncGate * 0.08 + pulseTrail * 0.22 + pulseHead * 0.28 + pulseAura * 0.24);
  col = mix(col, pulseColor, pulseColorMix);
  col = mix(col, pulseGold, pulseAura * 0.14 + pulseGlow * 0.10);
  col = mix(col, glowColor, halo * 0.18 + soft * 0.08);
  col *= 1.0 + halo * 0.14 + pulseGlow * 0.10;

  float alpha = (core * 1.02 + soft * 0.40 + halo * 0.22);
  float networkPulse = 0.84 + 0.16 * sin(uTime * 1.08);
  float outAlpha =
    alpha *
    zoomFade *
    uAlphaMul *
    limb *
    networkPulse *
    (1.0 + sweepLocal * 0.42 * uFlowStrength) *
    (0.74 + pulseTrail * 0.32 + pulseHead * 0.46 + pulseGate * 0.16);
  outAlpha += (pulseAura * 0.12 + pulseGlow * 0.22 + halo * 0.10) * zoomFade * uAlphaMul * limb;

  gl_FragColor = vec4(col, outAlpha);
}
