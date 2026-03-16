precision mediump float;

uniform float uTime;
uniform float uCameraDistance;
uniform vec3 uCoreColor;
uniform vec3 uGlowColor;
uniform vec3 uTintColor;
uniform vec3 uAccentColor;
uniform float uAlpha;
uniform float uFocusMix;
uniform float uRepresentationMix;
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
varying float vAltitude;
varying float vDensity;
varying float vCorridorKeep;
varying float vCorridorGroup;
varying float vLead;
varying float vReveal;

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

void main() {
  if (vEnable < 0.5) discard;
  if (vReveal < 0.001) discard;

  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  // Oriented "comet" look (tiny contrail).
  vec2 dir2 = -vVel2;
  float dir2Len = length(dir2);
  dir2 = dir2Len > 1e-5 ? (dir2 / dir2Len) : vec2(0.0, 1.0);
  vec2 perpDir = vec2(-dir2.y, dir2.x);
  float along = dot(uv, dir2);
  float perp = dot(uv, perpDir);

  vec2 planeUv = vec2(along, perp);
  float fuselage = 1.0 - smoothstep(0.0, 0.028, sdBox(planeUv - vec2(0.02, 0.0), vec2(0.17, 0.028)));
  float nose = 1.0 - smoothstep(0.0, 0.032, sdCircle(planeUv - vec2(0.21, 0.0), 0.055));
  float wings = 1.0 - smoothstep(0.0, 0.03, sdBox(planeUv - vec2(-0.02, 0.0), vec2(0.055, 0.19)));
  float tailWing = 1.0 - smoothstep(0.0, 0.028, sdBox(planeUv - vec2(-0.18, 0.0), vec2(0.04, 0.1)));
  float tailFin = 1.0 - smoothstep(0.0, 0.026, sdBox(planeUv - vec2(-0.2, 0.0), vec2(0.02, 0.06)));

  float planeCore = max(max(fuselage, nose), max(wings, tailWing));
  planeCore = max(planeCore, tailFin);
  float planeGlow = max(
    max(
      1.0 - smoothstep(0.0, 0.07, sdBox(planeUv - vec2(0.02, 0.0), vec2(0.18, 0.04))),
      1.0 - smoothstep(0.0, 0.08, sdBox(planeUv - vec2(-0.02, 0.0), vec2(0.07, 0.22)))
    ),
    1.0 - smoothstep(0.0, 0.07, sdCircle(planeUv - vec2(0.22, 0.0), 0.07))
  );

  // Tail only behind the motion direction.
  float behind = clamp((-along) / 0.48, 0.0, 1.0);
  float tailWidth = mix(0.18, 0.07, behind);
  float tail = 1.0 - smoothstep(0.0, tailWidth, abs(perp));
  tail *= 1.0 - smoothstep(0.0, 1.0, behind);
  tail *= step(along, 0.03);

  // Subtle zoom fade so we don't spam the screen when zoomed out.
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomOut = 1.0 - zoom;
  float zoomFade = 0.84 + 0.22 * zoomOut;

  float shimmer = 0.86 + 0.14 * sin(uTime * 4.2 + vSeed * 6.2831);
  float traffic01 = clamp((vTraffic - 0.62) / (1.22 - 0.62), 0.0, 1.0);
  float corridorRep = smoothstep(0.08, 0.66, vCorridorKeep);
  float leadPriority = clamp(
    corridorRep * 0.54 +
    smoothstep(0.85, 1.12, vTraffic) * 0.28 +
    smoothstep(0.18, 0.88, vHub) * 0.18,
    0.0,
    1.0
  );

  // Direction cue: forward is warmer, reverse is slightly cooler.
  vec3 dirTint = mix(uTintColor, uGlowColor, step(0.0, vDir) * 0.35);
  vec3 col = mix(dirTint, uGlowColor, 0.55);
  col = mix(col, uCoreColor, planeCore);
  col = mix(col, uGlowColor, traffic01 * 0.16);

  // When focusing a country, hide planes not connected to it.
  float focusKeep = mix(1.0, vFocus, uFocusMix);
  float focusFade = mix(0.0, 1.0, focusKeep);
  float focusBoost = mix(1.0, 1.12, vFocus * uFocusMix);

  float isHover = 1.0 - step(0.5, abs(vRouteId - uHoverRouteId));
  float isSel = 1.0 - step(0.5, abs(vRouteId - uSelectedRouteId));
  float hoverEmph = isHover * uHoverMix;
  float selectedEmph = isSel * uSelectedMix;
  float emphasize = max(max(vEmph, hoverEmph), selectedEmph);
  focusKeep = mix(focusKeep, 1.0, emphasize);
  focusFade = mix(0.0, 1.0, focusKeep);

  // When a route is selected, de-emphasize the rest a bit.
  float selectedContext = mix(1.0, mix(0.18, 1.0, isSel), uSelectedMix * 0.95);
  // When hovering a route (and nothing is selected), de-emphasize the rest.
  float hoverCtxMix = uHoverMix * (1.0 - uSelectedMix);
  float hoverContext = mix(1.0, mix(0.24, 1.0, isHover), hoverCtxMix * 0.9);

  float lightUp = clamp(hoverEmph * 0.52 + selectedEmph * 0.78, 0.0, 1.0);
  col = mix(col, uCoreColor, lightUp);
  col = mix(col, uAccentColor, selectedEmph * 0.18);
  col = mix(col, uAccentColor, smoothstep(0.58, 1.0, vAltitude) * uRepresentationMix * 0.14);
  col = mix(col, uAccentColor, nose * 0.18 + planeGlow * 0.06);
  col = mix(col, uAccentColor, vLead * 0.08);

  float alpha =
    (planeGlow * 0.36 + tail * 0.28 + planeCore * 0.68) *
    uAlpha *
    shimmer *
    zoomFade *
    focusFade *
    focusBoost *
    selectedContext *
    hoverContext *
    vTraffic *
    (0.9 + traffic01 * 0.18) *
    (1.0 + hoverEmph * 1.0 + selectedEmph * 1.95 + vLead * mix(0.06, 0.18, leadPriority));

  float bundleMix = smoothstep(0.35, 0.95, zoomOut);
  float hubKeep = smoothstep(0.18, 0.88, vHub);
  float bundleContext = mix(1.0, mix(0.36, 1.0, hubKeep), bundleMix);
  bundleContext = mix(bundleContext, 1.0, emphasize);
  alpha *= bundleContext;
  float denseRegion = smoothstep(0.32, 0.96, vDensity);
  float densityFade = mix(1.0, 0.76, denseRegion * mix(0.38, 0.7, zoomOut));
  densityFade = mix(densityFade, 1.0, max(emphasize, vLead * leadPriority * 0.55));
  alpha *= densityFade;
  float corridorPressure = denseRegion * vCorridorGroup * mix(0.18, 0.86, zoomOut);
  float corridorFade = mix(1.0, mix(0.58, 1.0, corridorRep), corridorPressure);
  corridorFade = mix(corridorFade, 1.0, max(emphasize, vLead * leadPriority * 0.55));
  alpha *= corridorFade;
  alpha *= mix(0.72, 1.36, uRepresentationMix);
  alpha *= vReveal;

  // Fade softly near the horizon so points don't "pop" at the limb.
  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.35);
  alpha *= limb;

  if (max(planeGlow, tail) < 0.02) discard;

  gl_FragColor = vec4(col, alpha);
}
