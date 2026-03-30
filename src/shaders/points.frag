precision mediump float;

uniform float uTime; // mantido por compatibilidade (não usado)
uniform float uCameraDistance;
uniform vec3 uColorMul;
uniform float uAlphaMul;
uniform float uFlowSpeed;     // não usado
uniform float uFlowWidth;     // não usado
uniform float uFlowStrength;  // não usado
uniform vec3 uFlowColor;      // não usado

varying vec3 vColor;
varying float vSeed;
varying float vFacing;
varying float vFlowCoord;
varying float vReveal;

void main() {
  if (vReveal < 0.001) discard;

  // Coordenada local do ponto
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);

  // Limite máximo do sprite
  if (d > 0.5) discard;

  // ─────────────────────────────
  // Camera + reveal
  // ─────────────────────────────
  float zoom = clamp((32.0 - uCameraDistance) / 16.0, 0.0, 1.0);
  float zoomFade = 0.65 + 0.35 * zoom;

  float revealFade = smoothstep(0.0, 1.0, vReveal);

  float limb = smoothstep(0.02, 0.18, vFacing);
  limb = pow(limb, 1.25);

  // ─────────────────────────────
  // Forma do ponto (SEM animação)
  // ─────────────────────────────
  float core = 1.0 - smoothstep(0.0, 0.24, d);   // centro sólido
  float soft = 1.0 - smoothstep(0.10, 0.40, d);  // corpo do ponto
  float halo = 1.0 - smoothstep(0.22, 0.50, d);  // brilho externo

  // ─────────────────────────────
  // Alpha (define tamanho visual)
  // ─────────────────────────────
  float alpha =
      core * 1.15 +
      soft * 0.65 +
      halo * 0.30;

  float outAlpha =
      alpha *
      zoomFade *
      uAlphaMul *
      limb *
      revealFade;

  // ─────────────────────────────
  // Cor (brilho estático)
  // ─────────────────────────────
  vec3 col = vColor * uColorMul;

  // brilho suave (sem animação)
  col *= 1.0 + halo * 0.35;

  // leve reforço no centro
  col *= 0.95 + core * 0.1;

  // reveal suave
  col *= mix(0.9, 1.0, revealFade);

  gl_FragColor = vec4(col, outAlpha);
}