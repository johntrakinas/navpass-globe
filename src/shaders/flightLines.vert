attribute float aT;
attribute float aSpeed;
attribute float aPhase;
attribute float aSeed;
attribute float aTraffic;
attribute float aFocus;
attribute float aRouteId;
attribute float aDir;
attribute float aHub;

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
  vT = aT;
  vSpeed = aSpeed;
  vPhase = aPhase;
  vSeed = aSeed;
  vTraffic = aTraffic;
  vFocus = aFocus;
  vRouteId = aRouteId;
  vDir = aDir;
  vHub = aHub;

  // Horizon fade helper: 1 = facing camera, 0 = at the limb/horizon.
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
