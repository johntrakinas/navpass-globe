import * as THREE from 'three'

export function createInnerSphere(radius: number) {
  const geometry = new THREE.SphereGeometry(radius * 0.99, 64, 64)

  const material = new THREE.MeshBasicMaterial({
    // Slightly lifted base tone so the globe doesn't feel "crushed" in blacks,
    // while keeping the Google-Research dark aesthetic.
    color: 0x111d33,
    side: THREE.BackSide,
    depthWrite: true
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 0

  return mesh
}
