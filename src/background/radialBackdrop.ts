import * as THREE from 'three'

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function toCssRgb(color: THREE.Color, alpha = 1) {
  const r = Math.round(clamp01(color.r) * 255)
  const g = Math.round(clamp01(color.g) * 255)
  const b = Math.round(clamp01(color.b) * 255)
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

export function createRadialBackdrop(
  width: number,
  height: number,
  centerColor: THREE.ColorRepresentation,
  cornerColor: THREE.ColorRepresentation
) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D canvas context not available (radial backdrop)')
  }
  const context = ctx

  const center = new THREE.Color(centerColor)
  const corner = new THREE.Color(cornerColor)
  const topEdge = new THREE.Color()
  const bottomEdge = new THREE.Color()
  const centerMid = new THREE.Color()
  const centerShade = new THREE.Color()
  const cornerGlow = new THREE.Color()
  const sunBloomColor = new THREE.Color()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  function redraw(nextWidth: number, nextHeight: number) {
    const w = Math.max(320, Math.round(nextWidth))
    const h = Math.max(320, Math.round(nextHeight))
    canvas.width = w
    canvas.height = h

    topEdge.copy(corner).lerp(new THREE.Color('#ffffff'), 0.08)
    bottomEdge.copy(corner).lerp(center, 0.32)

    const baseVertical = context.createLinearGradient(0, 0, 0, h)
    baseVertical.addColorStop(0, toCssRgb(topEdge))
    baseVertical.addColorStop(1, toCssRgb(bottomEdge))
    context.fillStyle = baseVertical
    context.fillRect(0, 0, w, h)

    const cx = w * 0.5
    const cy = h * 0.5
    const radius = Math.hypot(w * 0.56, h * 0.56)
    centerMid.copy(center).lerp(corner, 0.32)
    centerShade.copy(center).multiplyScalar(0.72)
    const centerVignette = context.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.95)
    centerVignette.addColorStop(0, toCssRgb(centerShade, 0.54))
    centerVignette.addColorStop(0.56, toCssRgb(centerMid, 0.22))
    centerVignette.addColorStop(1, toCssRgb(corner, 0.0))
    context.fillStyle = centerVignette
    context.fillRect(0, 0, w, h)

    cornerGlow.copy(corner).lerp(new THREE.Color('#ffffff'), 0.24)
    const cornerRadius = Math.hypot(w, h) * 0.68
    const drawCornerGlow = (x: number, y: number, strength: number) => {
      const gradient = context.createRadialGradient(x, y, 0, x, y, cornerRadius)
      gradient.addColorStop(0, toCssRgb(cornerGlow, strength))
      gradient.addColorStop(0.35, toCssRgb(cornerGlow, strength * 0.42))
      gradient.addColorStop(1, toCssRgb(cornerGlow, 0))
      context.fillStyle = gradient
      context.fillRect(0, 0, w, h)
    }
    drawCornerGlow(0, 0, 0.30)
    drawCornerGlow(w, 0, 0.34)
    drawCornerGlow(0, h, 0.22)
    drawCornerGlow(w, h, 0.26)

    sunBloomColor.copy(cornerGlow).lerp(new THREE.Color('#FBBC05'), 0.22)
    const sunX = w * 0.78
    const sunY = h * 0.18
    const sunRadius = Math.hypot(w, h) * 0.34
    const sunBloom = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius)
    sunBloom.addColorStop(0, toCssRgb(sunBloomColor, 0.26))
    sunBloom.addColorStop(0.35, toCssRgb(sunBloomColor, 0.12))
    sunBloom.addColorStop(1, toCssRgb(sunBloomColor, 0.0))
    context.fillStyle = sunBloom
    context.fillRect(0, 0, w, h)

    texture.needsUpdate = true
  }

  function setPalette(nextCenter: THREE.ColorRepresentation, nextCorner: THREE.ColorRepresentation) {
    center.set(nextCenter)
    corner.set(nextCorner)
    redraw(canvas.width || width, canvas.height || height)
  }

  function resize(nextWidth: number, nextHeight: number) {
    redraw(nextWidth, nextHeight)
  }

  redraw(width, height)
  return { texture, setPalette, resize }
}
