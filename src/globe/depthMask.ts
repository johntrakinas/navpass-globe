import * as THREE from 'three'

export function createDepthMaskSphere(radius: number) {
  const geometry = new THREE.SphereGeometry(radius * 1.0005, 96, 96)

  // NOTE:
  // Some Safari/WebKit + Apple GPU combos can produce white square artifacts
  // with colorWrite=false depth masks. Keep this as a real dark occluder so
  // depth remains stable across platforms.
  const material = new THREE.MeshBasicMaterial({
    color: 0x07090d,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    toneMapped: false
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 0 // desenha primeiro, antes de linhas/pontos
  mesh.frustumCulled = false
  return mesh
}
