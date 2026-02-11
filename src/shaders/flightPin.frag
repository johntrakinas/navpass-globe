precision mediump float;

uniform float uTime;
uniform vec3 uHoverColor;
uniform vec3 uSelectedColor;
uniform float uAlpha;

varying float vKind;
varying float vSeed;
varying float vMix;
varying float vFacing;
varying float vZoom;

void main() {
  if (vMix < 0.001) discard;

  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.44) discard;

  float core = smoothstep(0.17, 0.0, d);
  float glow = smoothstep(0.33, 0.09, d);

  float kind = step(0.5, vKind);
  vec3 col = mix(uHoverColor, uSelectedColor, kind);

  float shimmer = 0.98 + 0.02 * sin(uTime * 0.7 + vSeed * 6.2831 + kind * 0.6);

  // Horizon fade so the pin doesn't pop at the limb.
  float limb = smoothstep(0.03, 0.18, vFacing);
  limb = pow(limb, 1.25);

  float zoomFade = 0.55 + 0.45 * vZoom;

  float alpha = (glow * 0.24 + core * 0.88) * uAlpha * shimmer * vMix * limb * zoomFade;

  gl_FragColor = vec4(col, alpha);
}
