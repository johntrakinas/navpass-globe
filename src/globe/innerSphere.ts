import * as THREE from 'three'

export function createInnerSphere(radius: number) {
  const geometry = new THREE.SphereGeometry(radius * 0.99, 64, 64)

  const material = new THREE.MeshBasicMaterial({
    color: 0x07090d,
    side: THREE.BackSide,
    depthWrite: true,
    toneMapped: false
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 0

  return mesh
}
