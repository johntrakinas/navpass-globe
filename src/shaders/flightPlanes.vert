precision mediump float;

attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute vec3 aCurve;
attribute float aHub;
attribute float aAltitude;
attribute float aDensity;
attribute float aCorridorKeep;
attribute float aCorridorGroup;
attribute float aRevealPriority;
attribute vec2 aFocusRoute;

attribute vec4 aAnimA; // speed, phase, offset, dir
attribute vec4 aAnimB; // size, seed, traffic, enable

uniform float uTime;
uniform float uCameraDistance;
uniform float uRouteKeep;
uniform float uPlaneDensity;
uniform float uAltitudeLodMix;
uniform float uRepresentationMix;
uniform float uRevealProgress;
uniform float uHoverRouteId;
uniform float uHoverMix;
uniform float uSelectedRouteId;
uniform float uSelectedMix;
uniform float uSizeMul;

varying float vSeed;
varying float vTraffic;
varying float vEnable;
varying float vFocus;
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

const float PI = 3.141592653589793;

vec3 safeNormalize(vec3 v, vec3 fallbackDir) {
  float lenV = length(v);
  if (lenV <= 1e-6) {
    float lenFallback = length(fallbackDir);
    return lenFallback > 1e-6 ? (fallbackDir / lenFallback) : vec3(0.0, 1.0, 0.0);
  }
  return v / lenV;
}

vec3 routePoint(vec3 p0, vec3 p1, vec3 p2, vec3 curve, float t) {
  float omt = 1.0 - t;
  vec3 p = p0 * (omt * omt) + p1 * (2.0 * omt * t) + p2 * (t * t);

  float minShell = min(length(p0), length(p2)) * 0.995;
  float pLen = length(p);
  if (pLen < 1e-6) {
    vec3 fallbackDir = p0 + p2;
    float fLen = length(fallbackDir);
    if (fLen < 1e-6) {
      fallbackDir = p0;
      fLen = max(length(fallbackDir), 1e-6);
    }
    return (fallbackDir / fLen) * minShell;
  }

  if (pLen < minShell) {
    p *= minShell / pLen;
  }

  return p;
}

float safeClipW(vec4 clipPos) {
  return clipPos.w >= 0.0 ? max(clipPos.w, 1e-5) : min(clipPos.w, -1e-5);
}

void main() {
  float aSpeed = aAnimA.x;
  float aPhase = aAnimA.y;
  float aOffset = aAnimA.z;
  float aDir = aAnimA.w;

  float aSize = aAnimB.x;
  float aSeed = aAnimB.y;
  float aTraffic = aAnimB.z;
  float aEnable = aAnimB.w;

  vSeed = aSeed;
  vTraffic = aTraffic;
  vEnable = aEnable;
  vFocus = aFocusRoute.x;
  vRouteId = aFocusRoute.y;
  vDir = aDir;
  vHub = aHub;
  vEmph = 0.0;
  vAltitude = aAltitude;
  vDensity = aDensity;
  vCorridorKeep = aCorridorKeep;
  vCorridorGroup = aCorridorGroup;
  float leadPlane = 1.0 - step(0.0001, abs(aOffset));
  vLead = leadPlane;

  // LOD: thin planes when zoomed out (keep mask based on seed).
  float keepMask = 1.0 - smoothstep(uRouteKeep - 0.12, uRouteKeep, aSeed);
  float densMask = 1.0 - smoothstep(uPlaneDensity - 0.18, uPlaneDensity, aSeed);

  // Prefer keeping high-traffic planes when we thin things out.
  float trafficKeep = smoothstep(0.85, 1.12, aTraffic);
  float thin = clamp(1.0 - uPlaneDensity, 0.0, 1.0);
  keepMask = max(keepMask, trafficKeep * thin);
  densMask = max(densMask, trafficKeep * thin);

  // Zoom-out aggregation: keep hub-connected planes visible longer.
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float altitudeThreshold = mix(0.66, 0.03, zoom);
  float altitudeKeep = smoothstep(altitudeThreshold - 0.14, altitudeThreshold + 0.14, aAltitude);
  altitudeKeep = mix(1.0, altitudeKeep, uAltitudeLodMix);
  float bundleMix = smoothstep(0.35, 0.95, 1.0 - zoom);
  float hubKeep = smoothstep(0.18, 0.88, aHub);
  keepMask = max(keepMask, hubKeep * bundleMix);
  densMask = max(densMask, hubKeep * bundleMix);
  keepMask *= altitudeKeep;
  densMask *= altitudeKeep;

  float localDensity = smoothstep(0.32, 0.96, aDensity);
  float denseThin = localDensity * mix(0.42, 1.0, 1.0 - zoom);
  float localKeepThreshold = max(0.08, uPlaneDensity - denseThin * 0.24);
  float localDensMask = 1.0 - smoothstep(localKeepThreshold - 0.18, localKeepThreshold, aSeed);
  localDensMask = max(localDensMask, trafficKeep * denseThin * 0.9);
  localDensMask = max(localDensMask, leadPlane);
  densMask *= localDensMask;

  float corridorPressure = localDensity * aCorridorGroup * mix(0.18, 0.92, 1.0 - zoom);
  float corridorRep = smoothstep(0.08, 0.66, aCorridorKeep);
  float leadPriority = clamp(corridorRep * 0.54 + trafficKeep * 0.28 + hubKeep * 0.18, 0.0, 1.0);
  float leadKeep = mix(1.0, mix(0.18, 1.0, leadPriority), corridorPressure);
  keepMask = max(keepMask, leadPlane * leadKeep);
  densMask = max(densMask, leadPlane * leadKeep);
  float corridorContext = mix(1.0, mix(0.5, 1.0, corridorRep), corridorPressure);
  densMask *= corridorContext;

  float t = fract(uTime * aSpeed + aPhase + aOffset);
  if (aDir < 0.0) {
    t = 1.0 - t;
  }

  vec3 p = routePoint(aP0, aP1, aP2, aCurve, t);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float tangentStep = 0.018 * aDir;
  float tAhead = clamp(t + tangentStep, 0.0, 1.0);
  float tBehind = clamp(t - tangentStep, 0.0, 1.0);
  vec3 pAhead = routePoint(aP0, aP1, aP2, aCurve, tAhead);
  vec3 pBehind = routePoint(aP0, aP1, aP2, aCurve, tBehind);
  vec4 mvAhead = modelViewMatrix * vec4(pAhead, 1.0);
  vec4 mvBehind = modelViewMatrix * vec4(pBehind, 1.0);
  vec4 clipPosition = projectionMatrix * mvPosition;
  vec4 clipAhead = projectionMatrix * mvAhead;
  vec4 clipBehind = projectionMatrix * mvBehind;
  vec2 ndc = clipPosition.xy / safeClipW(clipPosition);
  vec2 ndcAhead = clipAhead.xy / safeClipW(clipAhead);
  vec2 ndcBehind = clipBehind.xy / safeClipW(clipBehind);
  float aspect = projectionMatrix[1][1] / max(1e-5, projectionMatrix[0][0]);
  vec2 screenDir = ndcAhead - ndcBehind;
  screenDir.x *= aspect;
  screenDir.y *= -1.0;
  if (length(screenDir) <= 1e-5) {
    screenDir = ndcAhead - ndc;
    screenDir.x *= aspect;
    screenDir.y *= -1.0;
  }
  float velLen = length(screenDir);
  vVel2 = velLen > 1e-5 ? (screenDir / velLen) : vec2(0.0, 1.0);

  float dist = max(1.0, -mvPosition.z);

  // Horizon fade helper: 1 = facing camera, 0 = at the limb/horizon.
  vec3 worldPos = (modelMatrix * vec4(p, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  float baseSize = aSize * aTraffic;
  float pointSize = baseSize * uSizeMul * (92.0 / dist);
  pointSize *= mix(0.66, 0.96, uRepresentationMix);
  pointSize *= mix(1.0, 1.08, leadPlane * mix(0.32, 1.0, leadKeep));
  pointSize *= mix(1.0, 0.84, localDensity * mix(0.28, 0.56, 1.0 - zoom));
  pointSize *= mix(1.0, mix(0.82, 1.0, corridorRep), corridorPressure * 0.68);
  float revealStart = max(0.0, aRevealPriority - 0.08);
  float revealEnd = min(1.0, aRevealPriority + 0.08);
  float revealMask = revealEnd > revealStart
    ? smoothstep(revealStart, revealEnd, uRevealProgress)
    : step(aRevealPriority, uRevealProgress);
  vReveal = revealMask;
  pointSize *= aEnable * keepMask * densMask * revealMask;

  gl_PointSize = clamp(pointSize, 0.0, 13.0);
  gl_Position = clipPosition;
}
