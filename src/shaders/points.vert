attribute float size;
attribute float aSeed;

uniform vec3 uFlowDir;
uniform float uFlowScale;
uniform float uSizeMul;

varying vec3 vColor;
varying float vSeed;
varying float vFacing;
varying float vFlowCoord;

void main() {
  vColor = color;
  vSeed = aSeed;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Horizon fade helper (helps prevent hard clipping at the limb).
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));
  vFlowCoord = dot(worldPos, normalize(uFlowDir)) * uFlowScale;

  float pointSize = size * uSizeMul * (98.0 / max(1.0, -mvPosition.z));
  gl_PointSize = clamp(pointSize, 0.75, 6.2);

  gl_Position = projectionMatrix * mvPosition;
}
