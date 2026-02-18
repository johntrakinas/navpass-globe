precision mediump float;

attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;

attribute vec4 aMotion; // speed, phase, offset, dir
attribute vec4 aVisual; // size, seed, traffic, enable
attribute vec4 aMeta; // focus, routeId, hub, spare

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
  float speed = aMotion.x;
  float phase = aMotion.y;
  float offset = aMotion.z;
  float dir = aMotion.w;
  float size = aVisual.x;
  float seed = aVisual.y;
  float traffic = aVisual.z;
  float enable = aVisual.w;
  float focus = aMeta.x;
  float routeId = aMeta.y;
  float hub = aMeta.z;

  vSeed = seed;
  vTraffic = traffic;
  vEnable = enable;
  vFocus = focus;
  vRouteId = routeId;
  vDir = dir;
  vHub = hub;

  float isHover = 1.0 - step(0.5, abs(routeId - uHoverRouteId));
  float isSel = 1.0 - step(0.5, abs(routeId - uSelectedRouteId));
  float emphasize = max(isHover * uHoverMix, isSel * uSelectedMix);
  vEmph = emphasize;

  // LOD: thin planes when zoomed out (keep mask based on seed).
  float keepMask = smoothstep(uRouteKeep, uRouteKeep - 0.12, seed);
  keepMask = max(keepMask, emphasize);
  float densMask = smoothstep(uPlaneDensity, uPlaneDensity - 0.18, seed);
  densMask = max(densMask, emphasize);

  // Prefer keeping high-traffic planes when we thin things out.
  float trafficKeep = smoothstep(0.85, 1.12, traffic);
  float thin = clamp(1.0 - uPlaneDensity, 0.0, 1.0);
  keepMask = max(keepMask, trafficKeep * thin);
  densMask = max(densMask, trafficKeep * thin);

  // Zoom-out aggregation: keep hub-connected planes visible longer.
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float bundleMix = smoothstep(0.35, 0.95, 1.0 - zoom);
  float hubKeep = smoothstep(0.18, 0.88, hub);
  keepMask = max(keepMask, hubKeep * bundleMix);
  densMask = max(densMask, hubKeep * bundleMix);

  float t = fract(uTime * speed + phase + offset);
  if (dir < 0.0) {
    t = 1.0 - t;
  }

  float omt = 1.0 - t;
  vec3 p = aP0 * (omt * omt) + aP1 * (2.0 * omt * t) + aP2 * (t * t);

  // Screen-space velocity direction (for a small "comet" trail in the fragment shader).
  vec3 dpdt = 2.0 * (1.0 - t) * (aP1 - aP0) + 2.0 * t * (aP2 - aP1);
  dpdt *= dir; // actual motion direction (handles reversed routes)
  vec3 velView = (modelViewMatrix * vec4(dpdt, 0.0)).xyz;
  vec2 vel2 = velView.xy;
  float velLen = length(vel2);
  vVel2 = velLen > 1e-5 ? (vel2 / velLen) : vec2(0.0, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float dist = max(1.0, -mvPosition.z);

  // Horizon fade helper: 1 = facing camera, 0 = at the limb/horizon.
  vec3 worldPos = (modelMatrix * vec4(p, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  float baseSize = size * traffic;
  float pointSize = baseSize * uSizeMul * (398.0 / dist);
  pointSize *= (1.0 + emphasize * 0.55);
  pointSize *= enable * keepMask * densMask;

  gl_PointSize = clamp(pointSize, 0.0, 62.0);
  gl_Position = projectionMatrix * mvPosition;
}
