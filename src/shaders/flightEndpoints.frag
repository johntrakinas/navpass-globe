precision mediump float;

uniform float uTime;
uniform vec3 uOriginColor;
uniform vec3 uDestColor;
uniform float uAlpha;

varying float vRole;
varying float vSeed;
varying float vMix;
varying float vFacing;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.44) discard;

  float core = smoothstep(0.18, 0.0, d);
  float glow = smoothstep(0.34, 0.10, d);

  float shimmer = 0.98 + 0.02 * sin(uTime * 0.8 + vSeed * 6.2831);
  vec3 col = mix(uOriginColor, uDestColor, step(0.5, vRole));

  float alpha = (glow * 0.22 + core * 0.90) * uAlpha * shimmer * vMix;

  // Horizon fade helper: keeps endpoint pulses from abruptly clipping at the limb.
  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.35);
  alpha *= limb;

  gl_FragColor = vec4(col, alpha);
}
