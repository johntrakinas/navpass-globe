precision mediump float;

attribute float aKind; // 0 = hover, 1 = selected
attribute float aRole; // 0 = origin, 1 = destination
attribute float aSeed;

uniform float uTime;
uniform float uCameraDistance;
uniform float uHoverMix;
uniform float uSelectedMix;

varying float vRole;
varying float vSeed;
varying float vMix;
varying float vFacing;

void main() {
  vRole = aRole;
  vSeed = aSeed;

  float kind = step(0.5, aKind);
  float showMix = mix(uHoverMix, uSelectedMix, kind);
  vMix = showMix;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(1.0, -mvPosition.z);

  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float pulse = 0.94 + 0.06 * sin(uTime * 1.4 + aSeed * 6.2831);

  float base = mix(1.60, 2.80, zoom);
  float pointSize = base * pulse * showMix * (210.0 / dist);
  gl_PointSize = clamp(pointSize, 0.0, 20.0);

  // Horizon fade helper: 1 = facing camera, 0 = at the limb/horizon.
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  gl_Position = projectionMatrix * mvPosition;
}
