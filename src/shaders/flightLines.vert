attribute vec4 aMotion; // t, speed, phase, seed
attribute vec4 aMeta; // traffic, focus, routeId, signed(1 + hub)

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
  float dirHub = aMeta.w;
  vT = aMotion.x;
  vSpeed = aMotion.y;
  vPhase = aMotion.z;
  vSeed = aMotion.w;
  vTraffic = aMeta.x;
  vFocus = aMeta.y;
  vRouteId = aMeta.z;
  vDir = dirHub >= 0.0 ? 1.0 : -1.0;
  vHub = max(0.0, abs(dirHub) - 1.0);

  // Horizon fade helper: 1 = facing camera, 0 = at the limb/horizon.
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
