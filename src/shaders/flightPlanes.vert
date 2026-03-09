precision mediump float;

attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute float aAltitude;

attribute vec4 aAnimA; // speed, phase, offset, dir
attribute vec4 aAnimB; // size, seed, traffic, enable

uniform float uTime;
uniform float uCameraDistance;
uniform float uRouteKeep;
uniform float uPlaneDensity;
uniform float uAltitudeLodMix;
uniform float uRepresentationMix;
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
varying float vLead;

vec3 bezierPoint(vec3 p0, vec3 p1, vec3 p2, float t) {
  float omt = 1.0 - t;
  return p0 * (omt * omt) + p1 * (2.0 * omt * t) + p2 * (t * t);
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
  // Plane sprites are decorative; lines carry the precise route focus/selection state.
  vFocus = 1.0;
  vRouteId = -999.0;
  vDir = aDir;
  vHub = aTraffic;
  vEmph = 0.0;
  vAltitude = aAltitude;
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
  float hubKeep = smoothstep(0.72, 1.12, aTraffic);
  keepMask = max(keepMask, hubKeep * bundleMix);
  densMask = max(densMask, hubKeep * bundleMix);
  keepMask = max(keepMask, leadPlane);
  densMask = max(densMask, leadPlane);
  keepMask *= altitudeKeep;
  densMask *= altitudeKeep;

  float t = fract(uTime * aSpeed + aPhase + aOffset);
  if (aDir < 0.0) {
    t = 1.0 - t;
  }

  vec3 p = bezierPoint(aP0, aP1, aP2, t);

  // Safety clamp: never place a plane inside the globe.
  float minShell = min(length(aP0), length(aP2)) * 0.995;
  float pLen = length(p);
  if (pLen < 1e-6) {
    vec3 fallbackDir = aP0 + aP2;
    float fLen = length(fallbackDir);
    if (fLen < 1e-6) {
      fallbackDir = aP0;
      fLen = max(length(fallbackDir), 1e-6);
    }
    p = (fallbackDir / fLen) * minShell;
  } else if (pLen < minShell) {
    p *= minShell / pLen;
  }

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float tangentStep = 0.018 * aDir;
  float tAhead = clamp(t + tangentStep, 0.0, 1.0);
  float tBehind = clamp(t - tangentStep, 0.0, 1.0);
  vec3 pAhead = bezierPoint(aP0, aP1, aP2, tAhead);
  vec3 pBehind = bezierPoint(aP0, aP1, aP2, tBehind);
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
  pointSize *= mix(1.0, 1.08, leadPlane);
  pointSize *= aEnable * keepMask * densMask;

  gl_PointSize = clamp(pointSize, 0.0, 13.0);
  gl_Position = clipPosition;
}
