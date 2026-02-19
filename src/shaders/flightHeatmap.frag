precision mediump float;

uniform sampler2D uHeat;
uniform float uTime;
uniform float uCameraDistance;
uniform float uOpacity;
uniform float uThreshold;
uniform vec2 uTexel;
uniform float uEdgeStrength;

uniform vec3 uColdColor;
uniform vec3 uMidColor;
uniform vec3 uHotColor;
uniform vec3 uEdgeAccentColor;

varying vec2 vUv;

void main() {
  float hRaw = texture2D(uHeat, vUv).r;
  // Remove low noise and keep the layer restrained.
  float h = smoothstep(uThreshold, 1.0, hRaw);
  h = pow(h, 0.85);

  // Contour glow: highlight edges of hot regions for readability (subtle).
  float hx1 = texture2D(uHeat, vUv + vec2(uTexel.x, 0.0)).r;
  float hx2 = texture2D(uHeat, vUv - vec2(uTexel.x, 0.0)).r;
  float hy1 = texture2D(uHeat, vUv + vec2(0.0, uTexel.y)).r;
  float hy2 = texture2D(uHeat, vUv - vec2(0.0, uTexel.y)).r;
  float grad = abs(hx1 - hx2) + abs(hy1 - hy2);
  grad *= 0.75;
  float edge = smoothstep(0.02, 0.16, grad);
  edge *= smoothstep(uThreshold, uThreshold + 0.18, hRaw);

  // Stronger when zoomed out (global overview), softer when close.
  float zoomOut = clamp((uCameraDistance - 14.0) / 26.0, 0.0, 1.0);
  float zoomFade = mix(0.3, 1.0, zoomOut);

  // Micro shimmer (barely there) so it feels "alive".
  float shimmer = 0.97 + 0.03 * sin(uTime * 0.35 + vUv.x * 12.0 + vUv.y * 7.0);

  vec3 col = mix(uColdColor, uMidColor, smoothstep(0.0, 0.55, h));
  col = mix(col, uHotColor, smoothstep(0.38, 1.0, h));

  vec3 edgeCol = mix(uMidColor, uHotColor, smoothstep(0.25, 1.0, h));
  edgeCol = mix(edgeCol, uEdgeAccentColor, 0.35);
  col = mix(col, edgeCol, edge * 0.45 * uEdgeStrength);

  float alpha = h * uOpacity * zoomFade * shimmer;
  alpha += edge * uOpacity * 0.22 * zoomFade * uEdgeStrength;
  gl_FragColor = vec4(col, alpha);
}
