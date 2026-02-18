precision mediump float;

uniform float uTime;
uniform float uCameraDistance;
uniform vec3 uCoreColor;
uniform vec3 uGlowColor;
uniform vec3 uTintColor;
uniform float uAlpha;
uniform float uFocusMix;
uniform float uHoverRouteId;
uniform float uHoverMix;
uniform float uSelectedRouteId;
uniform float uSelectedMix;

varying float vSeed;
varying float vFocus;
varying float vTraffic;
varying float vEnable;
varying float vRouteId;
varying float vDir;
varying float vEmph;
varying vec2 vVel2;
varying float vHub;
varying float vFacing;

void main() {
  if (vEnable < 0.5) discard;

  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  // Oriented "comet" look (tiny contrail).
  vec2 dir2 = normalize(vVel2);
  vec2 perpDir = vec2(-dir2.y, dir2.x);
  float along = dot(uv, dir2);
  float perp = dot(uv, perpDir);

  float core = smoothstep(0.22, 0.0, d);
  float glow = smoothstep(0.5, 0.14, d);

  // Tail only behind the motion direction.
  float behind = clamp((-along) / 0.48, 0.0, 1.0);
  float tailWidth = mix(0.18, 0.07, behind);
  float tail = smoothstep(tailWidth, 0.0, abs(perp));
  tail *= smoothstep(1.0, 0.0, behind);
  tail *= step(along, 0.03);

  // Subtle zoom fade so we don't spam the screen when zoomed out.
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomFade = 0.72 + 0.28 * zoom;
  float zoomOut = 1.0 - zoom;

  float shimmer = 0.86 + 0.14 * sin(uTime * 4.2 + vSeed * 6.2831);
  float traffic01 = clamp((vTraffic - 0.62) / (1.22 - 0.62), 0.0, 1.0);

  // Direction cue: forward is warmer, reverse is slightly cooler.
  vec3 dirTint = mix(uTintColor, uGlowColor, step(0.0, vDir) * 0.35);
  vec3 col = mix(dirTint, uGlowColor, 0.55);
  col = mix(col, uCoreColor, core);
  col = mix(col, uGlowColor, traffic01 * 0.16);

  // When focusing a country, hide planes not connected to it.
  float focusKeep = mix(1.0, vFocus, uFocusMix);
  float focusFade = mix(0.05, 1.0, focusKeep);
  float focusBoost = mix(1.0, 1.12, vFocus * uFocusMix);

  float isHover = 1.0 - step(0.5, abs(vRouteId - uHoverRouteId));
  float isSel = 1.0 - step(0.5, abs(vRouteId - uSelectedRouteId));
  float hoverEmph = isHover * uHoverMix;
  float selectedEmph = isSel * uSelectedMix;
  float emphasize = max(max(vEmph, hoverEmph), selectedEmph);
  focusKeep = mix(focusKeep, 1.0, emphasize);
  focusFade = mix(0.05, 1.0, focusKeep);

  // When a route is selected, de-emphasize the rest a bit.
  float selectedContext = mix(1.0, mix(0.18, 1.0, isSel), uSelectedMix * 0.95);
  // When hovering a route (and nothing is selected), de-emphasize the rest.
  float hoverCtxMix = uHoverMix * (1.0 - uSelectedMix);
  float hoverContext = mix(1.0, mix(0.24, 1.0, isHover), hoverCtxMix * 0.9);

  float lightUp = clamp(hoverEmph * 0.52 + selectedEmph * 0.78, 0.0, 1.0);
  col = mix(col, uCoreColor, lightUp);
  col = mix(col, vec3(1.0), selectedEmph * 0.18);

  float alpha =
    (glow * 0.92 + tail * 0.8 + core * 0.75) *
    uAlpha *
    shimmer *
    zoomFade *
    focusFade *
    focusBoost *
    selectedContext *
    hoverContext *
    vTraffic *
    (0.9 + traffic01 * 0.18) *
    (1.0 + hoverEmph * 1.0 + selectedEmph * 1.95);

  float bundleMix = smoothstep(0.35, 0.95, zoomOut);
  float hubKeep = smoothstep(0.18, 0.88, vHub);
  float bundleContext = mix(1.0, mix(0.36, 1.0, hubKeep), bundleMix);
  bundleContext = mix(bundleContext, 1.0, emphasize);
  alpha *= bundleContext;

  // Fade softly near the horizon so points don't "pop" at the limb.
  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.35);
  alpha *= limb;

  gl_FragColor = vec4(col, alpha);
}
