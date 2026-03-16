precision mediump float;

uniform float uTime;
uniform float uCameraDistance;

uniform vec3 uBaseColor;
uniform vec3 uHeadColor;
uniform vec3 uTailColor;
uniform vec3 uAccentColor;

uniform float uBaseAlpha;
uniform float uGlowAlpha;
uniform float uTailLength;
uniform float uHeadWidth;
uniform float uFocusMix;
uniform float uRouteKeep;
uniform float uAltitudeLodMix;
uniform float uRepresentationMix;
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
varying float vAltitude;
varying float vDensity;
varying float vCorridorKeep;
varying float vCorridorGroup;
varying float vFacing;

void main() {
  // Each route advances independently using per-vertex speed/phase.
  float head = fract(uTime * vSpeed + vPhase);
  if (vDir < 0.0) {
    head = 1.0 - head;
  }

  // Open-route semantics:
  // - tail exists only behind the aircraft
  // - future path exists only between aircraft and destination
  float tailDist = vDir < 0.0 ? (vT - head) : (head - vT);
  float futureDist = vDir < 0.0 ? (head - vT) : (vT - head);
  float tailMask =
    step(0.0, tailDist) *
    (1.0 - smoothstep(0.0, uTailLength, tailDist));
  float headMask = 1.0 - smoothstep(0.0, uHeadWidth, abs(vT - head));
  float traveledSpan = max(0.0001, vDir < 0.0 ? (1.0 - head) : head);
  float traveledMask = vDir < 0.0 ? step(head, vT) : step(vT, head);
  float traveledCoord = clamp((vDir < 0.0 ? (1.0 - vT) : vT) / traveledSpan, 0.0, 1.0);
  float traveledFade = mix(0.26, 0.88, smoothstep(0.0, 1.0, traveledCoord));
  float routeBodyMask = max(tailMask, traveledMask * traveledFade);

  float isHover = 1.0 - step(0.5, abs(vRouteId - uHoverRouteId));
  float isSel = 1.0 - step(0.5, abs(vRouteId - uSelectedRouteId));
  float hoverEmph = isHover * uHoverMix;
  float selectedEmph = isSel * uSelectedMix;
  float emphasize = max(hoverEmph, selectedEmph);

  // Keep the effect subtle when zoomed out.
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomOut = 1.0 - zoom;
  float zoomFade = 0.72 + 0.34 * zoomOut;

  float shimmer = 0.94 + 0.06 * sin(uTime * 3.0 + vSeed * 6.2831 + vT * 10.0);

  // Traffic heat: higher traffic becomes a touch warmer/brighter (subtle, not carnival).
  float traffic01 = clamp((vTraffic - 0.62) / (1.22 - 0.62), 0.0, 1.0);

  float tailT = clamp(tailDist / max(0.0001, uTailLength), 0.0, 1.0);
  vec3 tailColor = mix(uHeadColor, uTailColor, tailT);
  // Direction cue: slightly cooler tint for reverse direction.
  tailColor = mix(tailColor, uBaseColor, step(0.0, -vDir) * 0.18);

  vec3 color = mix(uBaseColor, tailColor, routeBodyMask);
  // Stronger "head glint"
  color = mix(color, uAccentColor, headMask * 0.55);
  color = mix(color, uHeadColor, tailMask * 0.18);
  color = mix(color, uTailColor, traffic01 * 0.16);

  float destDist = vDir < 0.0 ? head : (1.0 - head);
  float futureStart = smoothstep(uHeadWidth * 0.8, uHeadWidth * 1.8, futureDist);
  float futureEnd = 1.0 - smoothstep(max(0.0, destDist - 0.06), max(0.01, destDist), futureDist);
  float futureMask = step(0.0, futureDist) * futureStart * futureEnd;
  float futureNorm = futureDist / max(0.0001, destDist);
  float dashCoord = fract(futureNorm * 11.0 + 0.16);
  float dashMask =
    smoothstep(0.02, 0.18, dashCoord) *
    (1.0 - smoothstep(0.42, 0.76, dashCoord));
  float selectedDashMask = futureMask * dashMask * selectedEmph;
  vec3 selectedDashColor = mix(uHeadColor, uAccentColor, 0.32);
  color = mix(color, selectedDashColor, selectedDashMask * 0.78);

  // When a country is selected we keep routes connected to it and softly fade the rest.
  float focusKeep = mix(1.0, vFocus, uFocusMix);
  // Hover/selected routes always stay readable, even during focus fade.
  focusKeep = mix(focusKeep, 1.0, emphasize);
  float focusFade = mix(0.0, 1.0, focusKeep);
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
  color = mix(color, uAccentColor, selectedEmph * 0.22);

  // Altitude-aware LOD:
  // - zoomed out => keep high-altitude arcs first
  // - zoomed in  => progressively reveal low-altitude/regional routes
  float altitudeThreshold = mix(0.66, 0.03, zoom);
  float altitudeKeep = smoothstep(altitudeThreshold - 0.14, altitudeThreshold + 0.14, vAltitude);
  altitudeKeep = mix(1.0, altitudeKeep, uAltitudeLodMix);
  altitudeKeep = max(altitudeKeep, emphasize);

  // LOD: when zoomed out, keep only a subset of routes (smoothly) to avoid clutter.
  float keepMask = 1.0 - smoothstep(uRouteKeep - 0.12, uRouteKeep, vSeed);
  keepMask = max(keepMask, emphasize);
  // Prefer keeping high-traffic routes when we thin things out.
  float trafficKeep = smoothstep(0.85, 1.12, vTraffic);
  keepMask = max(keepMask, trafficKeep * clamp((0.65 - uRouteKeep) / 0.65, 0.0, 1.0));

  // In crowded corridors, thin context routes a bit harder while keeping
  // hover/selection and higher-traffic flights readable.
  float denseRegion = smoothstep(0.32, 0.96, vDensity);
  float denseKeepThreshold = max(0.04, uRouteKeep - denseRegion * mix(0.02, 0.12, zoomOut));
  float denseKeep = 1.0 - smoothstep(denseKeepThreshold - 0.12, denseKeepThreshold, vSeed);
  denseKeep = max(denseKeep, emphasize);
  denseKeep = max(denseKeep, trafficKeep * denseRegion * mix(0.2, 0.5, zoomOut));
  keepMask *= denseKeep;

  float corridorPressure = denseRegion * vCorridorGroup * mix(0.2, 1.0, zoomOut);
  float corridorRep = smoothstep(0.12, 0.74, vCorridorKeep);
  float corridorKeep = mix(1.0, mix(0.12, 1.0, corridorRep), corridorPressure);
  corridorKeep = mix(corridorKeep, 1.0, emphasize);
  keepMask *= corridorKeep;

  // "Bundling" feel on zoom-out: keep hub-connected corridors longer, and fade weaker routes earlier.
  float bundleMix = smoothstep(0.35, 0.95, zoomOut);
  float hubKeep = smoothstep(0.18, 0.88, vHub);
  keepMask = max(keepMask, hubKeep * bundleMix);
  keepMask *= altitudeKeep;

  float alpha =
    (routeBodyMask * (uBaseAlpha * 0.86 + uGlowAlpha * 0.18) + tailMask * uGlowAlpha * 0.82 + headMask * uGlowAlpha * 0.62 + selectedDashMask * (uBaseAlpha * 0.95 + uGlowAlpha * 0.26)) *
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
  float densityContext = mix(1.0, mix(0.48, 0.88, traffic01), denseRegion * mix(0.24, 0.72, zoomOut));
  densityContext = mix(densityContext, 1.0, emphasize);
  alpha *= densityContext;
  float corridorContext = mix(1.0, mix(0.26, 1.0, corridorRep), corridorPressure * 0.85);
  corridorContext = mix(corridorContext, 1.0, emphasize);
  alpha *= corridorContext;
  // Particle representation becomes primary at zoom-out; keep only a soft line context.
  alpha *= mix(1.0, 0.46, uRepresentationMix);

  // Fade softly near the horizon so the depth mask occlusion feels natural.
  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.35);
  alpha *= limb;

  gl_FragColor = vec4(color, alpha);
}
