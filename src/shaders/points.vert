attribute float size;
attribute float aSeed;

uniform vec3 uFlowDir;
uniform float uFlowScale;
uniform float uSizeMul;
uniform float uRevealProgress;

varying vec3 vColor;
varying float vSeed;
varying float vFacing;
varying float vFlowCoord;
varying float vReveal;

void main() {
  vColor = color;
  vSeed = aSeed;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Horizon fade helper (helps prevent hard clipping at the limb).
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));
  vec3 flowDir = length(uFlowDir) > 0.0001 ? normalize(uFlowDir) : vec3(0.74, 0.18, 0.65);
  vFlowCoord = dot(worldPos, flowDir) * uFlowScale;

  float revealCoord = fract(dot(normalize(worldPos), flowDir) * 0.42 + aSeed * 0.58 + 0.5);
  float revealStart = max(0.0, revealCoord - 0.24);
  float revealEnd = min(1.0, revealCoord + 0.18);
  float revealMask = revealEnd > revealStart
    ? smoothstep(revealStart, revealEnd, uRevealProgress)
    : step(revealCoord, uRevealProgress);
  vReveal = revealMask;

  float pointSize = size * uSizeMul * (108.0 / max(1.0, -mvPosition.z));
  pointSize *= revealMask;
  gl_PointSize = clamp(pointSize, 0.0, 8.0);

  gl_Position = projectionMatrix * mvPosition;
}
