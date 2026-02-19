precision mediump float;

uniform float uTime;
uniform vec3 uOriginColor;
uniform vec3 uDestColor;
uniform vec3 uAccentColor;
uniform float uAlpha;

varying float vRole;
varying float vSeed;
varying float vMix;
varying float vFacing;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.46) discard;

  float core = 1.0 - smoothstep(0.0, 0.20, d);
  float glow = 1.0 - smoothstep(0.11, 0.38, d);

  float shimmer = 0.94 + 0.06 * sin(uTime * 1.1 + vSeed * 6.2831);
  vec3 col = mix(uOriginColor, uDestColor, step(0.5, vRole));
  col = mix(col, uAccentColor, 0.16);

  float alpha = (glow * 0.34 + core * 1.08) * uAlpha * shimmer * vMix;

  // Horizon fade helper: keeps endpoint pulses from abruptly clipping at the limb.
  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.35);
  alpha *= limb;

  gl_FragColor = vec4(col, alpha);
}
