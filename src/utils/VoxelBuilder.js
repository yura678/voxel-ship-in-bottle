import * as THREE from 'three'

/**
 * Конструктор воксельних моделей з алгоритмом відсікання невидимих граней (Hidden Face Culling).
 * Генерує оптимізований BufferGeometry лише з видимих зовнішніх граней сусідніх вокселів,
 * що дозволяє рендерити складні воксельні об'єкти за 1 Draw Call.
 */
export class VoxelBuilder {
    constructor(voxelSize = 0.065, gapScale = 1.0) {
        this.voxelSize = voxelSize
        this.gapScale = gapScale
        this.voxels = new Map()
    }

    add(gx, gy, gz, hexColor, jitter = 0.03) {
        const ix = Math.round(gx)
        const iy = Math.round(gy)
        const iz = Math.round(gz)
        const key = `${ix},${iy},${iz}`
        const color = new THREE.Color(hexColor)
        if (jitter > 0) {
            const offset = (this.hash(ix, iy, iz) - 0.5) * jitter
            color.offsetHSL(0, 0, offset)
        }
        this.voxels.set(key, {
            gx: ix,
            gy: iy,
            gz: iz,
            color
        })
    }

    fillBox(x1, y1, z1, x2, y2, z2, hexColor, jitter = 0.03) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
        const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2)

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    this.add(x, y, z, hexColor, jitter)
                }
            }
        }
    }

    fillEllipsoid(cx, cy, cz, rx, ry, rz, hexColor, jitter = 0.04) {
        const minX = Math.floor(cx - rx), maxX = Math.ceil(cx + rx)
        const minY = Math.floor(cy - ry), maxY = Math.ceil(cy + ry)
        const minZ = Math.floor(cz - rz), maxZ = Math.ceil(cz + rz)

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const dx = (x - cx) / rx
                    const dy = (y - cy) / ry
                    const dz = (z - cz) / rz
                    if (dx * dx + dy * dy + dz * dz <= 1.0) {
                        this.add(x, y, z, hexColor, jitter)
                    }
                }
            }
        }
    }

    fillCylinderY(cx, yStart, yEnd, rBottom, rTop, hexColor, jitter = 0.03, cz = 0) {
        const minY = Math.min(yStart, yEnd)
        const maxY = Math.max(yStart, yEnd)
        const height = Math.max(1, maxY - minY)

        for (let y = minY; y <= maxY; y++) {
            const t = (y - minY) / height
            const r = rBottom + (rTop - rBottom) * t
            const rCeil = Math.ceil(r)
            for (let x = Math.floor(cx - rCeil); x <= Math.ceil(cx + rCeil); x++) {
                for (let z = Math.floor(cz - rCeil); z <= Math.ceil(cz + rCeil); z++) {
                    const dx = x - cx
                    const dz = z - cz
                    if (dx * dx + dz * dz <= r * r + 0.2) {
                        this.add(x, y, z, hexColor, jitter)
                    }
                }
            }
        }
    }

    hash(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
        return n - Math.floor(n)
    }

    /**
     * Побудова монолітного оптимізованого Mesh з відсіканням невидимих граней (Face Culling).
     * Генерує суцільний BufferGeometry виключно з видимих зовнішніх граней вокселів,
     * запікає кольори вершин (geometry.setAttribute('color', ...)) та нормалі,
     * що зменшує полігонаж у 3-4 рази та рендерить об'єкт за 1 Draw Call.
     */
    buildCulledMesh(materialOptions = {}, filterFn = null) {
        // Для монолітної воксельної сітки грані повинні прилягати без зазорів (1.001 усуває субпіксельні щілини растеризації)
        const halfS = (this.voxelSize * Math.max(1.001, this.gapScale)) * 0.5
        const positions = []
        const normals = []
        const colors = []
        const indices = []
        let vertexCount = 0

        const faces = [
            { dir: [1, 0, 0], norm: [1, 0, 0], quad: [[halfS, -halfS, -halfS], [halfS, halfS, -halfS], [halfS, halfS, halfS], [halfS, -halfS, halfS]] },
            { dir: [-1, 0, 0], norm: [-1, 0, 0], quad: [[-halfS, -halfS, halfS], [-halfS, halfS, halfS], [-halfS, halfS, -halfS], [-halfS, -halfS, -halfS]] },
            { dir: [0, 1, 0], norm: [0, 1, 0], quad: [[-halfS, halfS, -halfS], [-halfS, halfS, halfS], [halfS, halfS, halfS], [halfS, halfS, -halfS]] },
            { dir: [0, -1, 0], norm: [0, -1, 0], quad: [[-halfS, -halfS, halfS], [-halfS, -halfS, -halfS], [halfS, -halfS, -halfS], [halfS, -halfS, halfS]] },
            { dir: [0, 0, 1], norm: [0, 0, 1], quad: [[halfS, -halfS, halfS], [halfS, halfS, halfS], [-halfS, halfS, halfS], [-halfS, -halfS, halfS]] },
            { dir: [0, 0, -1], norm: [0, 0, -1], quad: [[-halfS, -halfS, -halfS], [-halfS, halfS, -halfS], [halfS, halfS, -halfS], [halfS, -halfS, -halfS]] }
        ]

        for (const v of this.voxels.values()) {
            const { gx, gy, gz, color } = v
            const cx = gx * this.voxelSize
            const cy = gy * this.voxelSize
            const cz = gz * this.voxelSize

            if (filterFn && !filterFn(v, cx, cy, cz)) continue

            for (const f of faces) {
                const neighborKey = `${gx + f.dir[0]},${gy + f.dir[1]},${gz + f.dir[2]}`
                if (!this.voxels.has(neighborKey)) {
                    const baseIdx = vertexCount
                    for (const p of f.quad) {
                        positions.push(cx + p[0], cy + p[1], cz + p[2])
                        normals.push(f.norm[0], f.norm[1], f.norm[2])
                        colors.push(color.r, color.g, color.b)
                    }
                    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3)
                    vertexCount += 4
                }
            }
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
        geometry.setIndex(indices)

        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            ...materialOptions
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = false
        mesh.receiveShadow = false
        return mesh
    }
}
