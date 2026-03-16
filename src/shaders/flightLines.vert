attribute vec4 aAnim0; // t, speed, phase, seed
attribute vec4 aAnim1; // traffic, focus, routeId, dir
attribute float aHub;
attribute float aAltitude;
attribute float aDensity;
attribute float aCorridorKeep;
attribute float aCorridorGroup;

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
  vT = aAnim0.x;
  vSpeed = aAnim0.y;
  vPhase = aAnim0.z;
  vSeed = aAnim0.w;
  vTraffic = aAnim1.x;
  vFocus = aAnim1.y;
  vRouteId = aAnim1.z;
  vDir = aAnim1.w;
  vHub = aHub;
  vAltitude = aAltitude;
  vDensity = aDensity;
  vCorridorKeep = aCorridorKeep;
  vCorridorGroup = aCorridorGroup;
  
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
