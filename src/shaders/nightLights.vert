precision mediump float;

attribute float size;
attribute float aSeed;

uniform float uTime;
uniform float uCameraDistance;
uniform vec3 uSunDir;

varying float vSeed;
varying float vNight;
varying float vFacing;
varying float vZoom;

void main() {
  vSeed = aSeed;

  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 normal = normalize(worldPos);

  // 1 when facing camera, 0 near the horizon (helps avoid hard clipping).
  vFacing = dot(normal, normalize(cameraPosition));

  float ndl = dot(normal, normalize(uSunDir));

  // Night factor: soft terminator + slightly deeper night emphasis.
  float softness = 0.22;
  float day = smoothstep(-softness, softness, ndl);
  float night = 1.0 - day;
  float deep = pow(clamp(-ndl, 0.0, 1.0), 0.75);
  vNight = night * (0.55 + 0.45 * deep);

  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  vZoom = zoom;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(1.0, -mvPosition.z);

  float pulse = 0.84 + 0.16 * sin(uTime * 1.6 + aSeed * 6.2831);

  // A little richer when closer, but never huge.
  float base = size * pulse * (0.6 + 0.4 * zoom) * (0.55 + 0.45 * vNight);
  float pointSize = base * (150.0 / dist);

  gl_PointSize = clamp(pointSize, 0.0, 12.0);
  gl_Position = projectionMatrix * mvPosition;
}
