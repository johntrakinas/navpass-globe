precision mediump float;

attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;

attribute vec4 aAnimA; // speed, phase, offset, dir
attribute vec4 aAnimB; // size, seed, traffic, enable

uniform float uTime;
uniform float uCameraDistance;
uniform float uRouteKeep;
uniform float uPlaneDensity;
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
  float bundleMix = smoothstep(0.35, 0.95, 1.0 - zoom);
  float hubKeep = smoothstep(0.72, 1.12, aTraffic);
  keepMask = max(keepMask, hubKeep * bundleMix);
  densMask = max(densMask, hubKeep * bundleMix);

  float t = fract(uTime * aSpeed + aPhase + aOffset);
  if (aDir < 0.0) {
    t = 1.0 - t;
  }

  float omt = 1.0 - t;
  vec3 p = aP0 * (omt * omt) + aP1 * (2.0 * omt * t) + aP2 * (t * t);

  // Screen-space velocity direction (for a small "comet" trail in the fragment shader).
  vec3 dpdt = 2.0 * (1.0 - t) * (aP1 - aP0) + 2.0 * t * (aP2 - aP1);
  dpdt *= aDir; // actual motion direction (handles reversed routes)
  vec3 velView = (modelViewMatrix * vec4(dpdt, 0.0)).xyz;
  vec2 vel2 = velView.xy;
  float velLen = length(vel2);
  vVel2 = velLen > 1e-5 ? (vel2 / velLen) : vec2(0.0, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float dist = max(1.0, -mvPosition.z);

  // Horizon fade helper: 1 = facing camera, 0 = at the limb/horizon.
  vec3 worldPos = (modelMatrix * vec4(p, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  float baseSize = aSize * aTraffic;
  float pointSize = baseSize * uSizeMul * (136.0 / dist);
  pointSize *= aEnable * keepMask * densMask;

  gl_PointSize = clamp(pointSize, 0.0, 20.0);
  gl_Position = projectionMatrix * mvPosition;
}
