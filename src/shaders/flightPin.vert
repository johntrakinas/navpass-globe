precision mediump float;

attribute float aKind; // 0 = hover, 1 = selected
attribute float aSeed;

uniform float uTime;
uniform float uCameraDistance;
uniform float uHoverMix;
uniform float uSelectedMix;

varying float vKind;
varying float vSeed;
varying float vMix;
varying float vFacing;
varying float vZoom;

void main() {
  vKind = aKind;
  vSeed = aSeed;

  float kind = step(0.5, aKind);
  float showMix = mix(uHoverMix, uSelectedMix, kind);
  vMix = showMix;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(1.0, -mvPosition.z);

  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  vZoom = zoom;

  float pulse = 0.98 + 0.02 * sin(uTime * 0.6 + aSeed * 6.2831 + kind * 0.7);
  float base = mix(1.35, 2.10, zoom);
  float pointSize = base * pulse * showMix * (185.0 / dist);

  // Horizon fade helper.
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vFacing = dot(normalize(worldPos), normalize(cameraPosition));

  gl_PointSize = clamp(pointSize, 0.0, 18.0);
  gl_Position = projectionMatrix * mvPosition;
}
