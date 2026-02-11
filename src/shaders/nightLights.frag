precision mediump float;

uniform float uTime;
uniform vec3 uWarmA;
uniform vec3 uWarmB;
uniform float uAlpha;

varying float vSeed;
varying float vNight;
varying float vFacing;
varying float vZoom;

void main() {
  if (vNight < 0.001) discard;

  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.46) discard;

  float core = smoothstep(0.16, 0.0, d);
  float glow = smoothstep(0.34, 0.10, d);

  // Color drift (subtle): keeps it alive without rainbow vibes.
  float drift = 0.5 + 0.5 * sin(uTime * 0.08 + vSeed * 12.0);
  vec3 col = mix(uWarmA, uWarmB, drift);

  float shimmer = 0.98 + 0.02 * sin(uTime * 0.35 + vSeed * 6.2831);

  // Horizon fade.
  float limb = smoothstep(0.03, 0.18, vFacing);
  limb = pow(limb, 1.25);

  // Zoom fade: far = quieter (avoid speckling the globe when zoomed out).
  float zoomFade = 0.25 + 0.75 * vZoom;

  float alpha = (glow * 0.26 + core * 0.84) * uAlpha * shimmer * vNight * limb * zoomFade;

  gl_FragColor = vec4(col, alpha);
}
