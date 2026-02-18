precision mediump float;

uniform float uTime;
uniform float uCameraDistance;

uniform vec3 uBaseColor;
uniform vec3 uHeadColor;
uniform vec3 uTailColor;

uniform float uBaseAlpha;
uniform float uGlowAlpha;
uniform float uTailLength;
uniform float uHeadWidth;
uniform float uFocusMix;
uniform float uRouteKeep;
uniform float uHoverRouteId;
uniform float uHoverMix;
uniform float uSelectedRouteId;
uniform float uSelectedMix;

varying float vT;
varying float vSpeed;
varying float vPhase;
varying float vSeed;
varying float vTraffic;
varying float vFocus;
varying float vRouteId;
varying float vDir;
varying float vHub;
varying float vFacing;

void main() {
  // Each route advances independently using per-vertex speed/phase.
  float head = fract(uTime * vSpeed + vPhase);
  if (vDir < 0.0) {
    head = 1.0 - head;
  }

  // "behind" = 0 at head, increases along the tail.
  float behind = head - vT;
  if (behind < 0.0) behind += 1.0;

  float tailMask = smoothstep(uTailLength, 0.0, behind);
  float headMask = smoothstep(uHeadWidth, 0.0, behind);

  float isHover = 1.0 - step(0.5, abs(vRouteId - uHoverRouteId));
  float isSel = 1.0 - step(0.5, abs(vRouteId - uSelectedRouteId));
  float hoverEmph = isHover * uHoverMix;
  float selectedEmph = isSel * uSelectedMix;
  float emphasize = max(hoverEmph, selectedEmph);

  // Keep the effect subtle when zoomed out.
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomFade = 0.55 + 0.45 * zoom;
  float zoomOut = 1.0 - zoom;

  float shimmer = 0.94 + 0.06 * sin(uTime * 3.0 + vSeed * 6.2831 + vT * 10.0);

  // Traffic heat: higher traffic becomes a touch warmer/brighter (subtle, not carnival).
  float traffic01 = clamp((vTraffic - 0.62) / (1.22 - 0.62), 0.0, 1.0);

  float tailT = clamp(behind / max(0.0001, uTailLength), 0.0, 1.0);
  vec3 tailColor = mix(uHeadColor, uTailColor, tailT);
  // Direction cue: slightly cooler tint for reverse direction.
  tailColor = mix(tailColor, uBaseColor, step(0.0, -vDir) * 0.18);

  vec3 color = mix(uBaseColor, tailColor, tailMask);
  // Stronger "head glint"
  color = mix(color, vec3(1.0), headMask * 0.55);
  color = mix(color, uTailColor, traffic01 * 0.16);

  // When a country is selected we keep routes connected to it and softly fade the rest.
  float focusKeep = mix(1.0, vFocus, uFocusMix);
  // Hover/selected routes always stay readable, even during focus fade.
  focusKeep = mix(focusKeep, 1.0, emphasize);
  float focusFade = mix(0.08, 1.0, focusKeep);
  float focusBoost = mix(1.0, 1.12, vFocus * uFocusMix);
  color = mix(color, uTailColor, (1.0 - focusKeep) * uFocusMix * 0.08);

  // When a route is selected, de-emphasize the rest a bit (Google-style focus).
  float selectedContext = mix(1.0, mix(0.18, 1.0, isSel), uSelectedMix * 0.95);

  // When hovering a route (and nothing is selected), de-emphasize the rest to help readability.
  float hoverCtxMix = uHoverMix * (1.0 - uSelectedMix);
  float hoverContext = mix(1.0, mix(0.24, 1.0, isHover), hoverCtxMix * 0.9);

  // Brighten on hover/selection.
  float lightUp = clamp(hoverEmph * 0.62 + selectedEmph * 0.9, 0.0, 1.0);
  color = mix(color, uHeadColor, lightUp);
  color = mix(color, vec3(1.0), selectedEmph * 0.22);

  // LOD: when zoomed out, keep only a subset of routes (smoothly) to avoid clutter.
  float keepMask = smoothstep(uRouteKeep, uRouteKeep - 0.12, vSeed);
  keepMask = max(keepMask, emphasize);
  // Prefer keeping high-traffic routes when we thin things out.
  float trafficKeep = smoothstep(0.85, 1.12, vTraffic);
  keepMask = max(keepMask, trafficKeep * clamp((0.65 - uRouteKeep) / 0.65, 0.0, 1.0));

  // "Bundling" feel on zoom-out: keep hub-connected corridors longer, and fade weaker routes earlier.
  float bundleMix = smoothstep(0.35, 0.95, zoomOut);
  float hubKeep = smoothstep(0.18, 0.88, vHub);
  keepMask = max(keepMask, hubKeep * bundleMix);

  float alpha =
    (uBaseAlpha + tailMask * uGlowAlpha + headMask * uGlowAlpha * 0.65) *
    shimmer *
    zoomFade *
    focusFade *
    focusBoost *
    selectedContext *
    hoverContext *
    (0.85 + traffic01 * 0.25) *
    (1.0 + hoverEmph * 1.2 + selectedEmph * 2.2) *
    keepMask;

  float bundleContext = mix(1.0, mix(0.18, 1.0, hubKeep), bundleMix);
  bundleContext = mix(bundleContext, 1.0, emphasize);
  alpha *= bundleContext;

  // Fade softly near the horizon so the depth mask occlusion feels natural.
  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.35);
  alpha *= limb;

  gl_FragColor = vec4(color, alpha);
}
