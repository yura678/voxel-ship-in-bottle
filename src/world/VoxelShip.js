import * as THREE from 'three'

/**
 * Модуль воксельного корабля.
 * Відповідає за позиціонування 3D моделі корабля, плавучість на хвилях,
 * прапор, освітлення каюти та стрільбу з гармат.
 */
export class VoxelShip {
    constructor(scene, modelManager = null) {
        this.modelManager = modelManager
        this.scene = scene

        this.group = new THREE.Group()
        this.basePosition = new THREE.Vector3(-0.35, -0.32, 0.0)
        this.targetOffset = new THREE.Vector2(0, 0)
        this.group.position.copy(this.basePosition)
        this.scene.add(this.group)

        this.interactiveMeshes = []
        this.cannonballs = []
        this.flagDummy = new THREE.Object3D()

        // Геометрія та матеріал для гарматних ядер
        this.ballGeo = new THREE.BoxGeometry(0.065, 0.065, 0.065)
        this.ballMat = new THREE.MeshStandardMaterial({
            color: '#1e293b',
            emissive: '#ff6b00',
            emissiveIntensity: 1.5,
            metalness: 0.8,
            roughness: 0.2
        })

        this.voxelSize = 0.04
        this.buildShipVoxels()
        this.buildCabinLightsAndFlag()
    }

    buildShipVoxels() {
        this.shipMesh = this.modelManager ? this.modelManager.getMesh('ship') : null
        if (this.shipMesh) {
            this.shipMesh.castShadow = true
            this.shipMesh.receiveShadow = true
            this.group.add(this.shipMesh)
        }

        // Проксі-бокс корабля для обробки кліків
        const shipHitProxy = new THREE.Mesh(
            new THREE.BoxGeometry(1.65, 1.45, 0.72),
            new THREE.MeshBasicMaterial({ visible: false })
        )
        shipHitProxy.position.set(0.05, 0.52, 0)
        shipHitProxy.userData = { interactiveType: 'voxel_ship' }
        this.interactiveMeshes.push(shipHitProxy)
        this.group.add(shipHitProxy)
    }

    buildCabinLightsAndFlag() {
        this.baseCabinIntensity = 0.0
        this.cabinLight = new THREE.PointLight('#ffb703', this.baseCabinIntensity, 2.5)
        this.cabinLight.position.set(-0.75, 0.25, 0)
        this.group.add(this.cabinLight)

        const flagCount = 8
        const flagGeo = new THREE.BoxGeometry(this.voxelSize * 1.002, this.voxelSize * 1.002, this.voxelSize * 1.002)
        const flagMat = new THREE.MeshLambertMaterial()
        this.flagInstancedMesh = new THREE.InstancedMesh(flagGeo, flagMat, flagCount)
        this.flagInstancedMesh.castShadow = false
        this.flagInstancedMesh.receiveShadow = false

        const goldColor = new THREE.Color('#f59e0b')
        const redColor = new THREE.Color('#ef4444')

        for (let i = 0; i < flagCount; i++) {
            this.flagDummy.position.set(-i * this.voxelSize, 32 * this.voxelSize, 0)
            this.flagDummy.updateMatrix()
            this.flagInstancedMesh.setMatrixAt(i, this.flagDummy.matrix)
            this.flagInstancedMesh.setColorAt(i, i % 3 === 0 ? goldColor : redColor)
        }
        if (this.flagInstancedMesh.instanceColor) {
            this.flagInstancedMesh.instanceColor.needsUpdate = true
        }
        this.flagInstancedMesh.instanceMatrix.needsUpdate = true
        this.group.add(this.flagInstancedMesh)
    }

    fireBroadside(currentTime) {
        const sides = [-1, 1]
        const xOffsets = [-0.14, 0.14]

        for (const side of sides) {
            for (const xOff of xOffsets) {
                const mesh = new THREE.Mesh(this.ballGeo, this.ballMat)
                const worldStart = new THREE.Vector3(xOff, 0.1, side * 0.26)
                this.group.localToWorld(worldStart)
                mesh.position.copy(worldStart)
                this.scene.add(mesh)

                this.cannonballs.push({
                    mesh,
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.4,
                        1.15 + Math.random() * 0.3,
                        side * (1.45 + Math.random() * 0.35)
                    ),
                    bornTime: currentTime
                })
            }
        }
    }

    /**
     * Вмикає кормовий ліхтар корабля вночі та в шторм і вимикає його вдень та ввечері
     */
    setWeatherMode(mode) {
        const isLanternOn = mode === 'night' || mode === 'storm'
        this.baseCabinIntensity = isLanternOn ? 1.6 : 0.0
        this.cabinLight.intensity = this.baseCabinIntensity
    }

    steer(dx, dz) {
        this.targetOffset.x = Math.max(-0.55, Math.min(0.65, this.targetOffset.x + dx))
        this.targetOffset.y = Math.max(-0.42, Math.min(0.42, this.targetOffset.y + dz))
    }

    update(elapsedTime, deltaTime, ocean, onWaterSplash) {
        if (this.cabinLight.intensity > this.baseCabinIntensity + 0.01) {
            this.cabinLight.intensity = THREE.MathUtils.lerp(
                this.cabinLight.intensity,
                this.baseCabinIntensity,
                deltaTime * 6
            )
            if (this.cabinLight.intensity < this.baseCabinIntensity + 0.05) {
                this.cabinLight.intensity = this.baseCabinIntensity
            }
        }

        const targetX = this.basePosition.x + this.targetOffset.x + Math.sin(elapsedTime * 0.35) * 0.14
        const targetZ = this.basePosition.z + this.targetOffset.y + Math.cos(elapsedTime * 0.28) * 0.08

        this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, targetX, deltaTime * 2.5)
        this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, targetZ, deltaTime * 2.5)

        const buoy = ocean.getBuoyancyTransform(
            this.group.position.x,
            this.group.position.z,
            elapsedTime,
            0.42
        )

        this.group.position.y = buoy.height + 0.05
        this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, buoy.pitch * 0.85, deltaTime * 5)
        this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, buoy.roll * 0.95, deltaTime * 5)
        this.group.rotation.y = Math.sin(elapsedTime * 0.4) * 0.08 - this.targetOffset.y * 0.25

        for (let i = 0; i < 8; i++) {
            const z = Math.sin(elapsedTime * 7.5 - i * 0.6) * (i * 0.008)
            const y = 32 * this.voxelSize + Math.cos(elapsedTime * 6.0 - i * 0.5) * 0.006
            this.flagDummy.position.set(-i * this.voxelSize, y, z)
            this.flagDummy.updateMatrix()
            this.flagInstancedMesh.setMatrixAt(i, this.flagDummy.matrix)
        }
        this.flagInstancedMesh.instanceMatrix.needsUpdate = true

        for (let i = this.cannonballs.length - 1; i >= 0; i--) {
            const b = this.cannonballs[i]
            b.velocity.y -= 4.8 * deltaTime
            b.mesh.position.addScaledVector(b.velocity, deltaTime)
            b.mesh.rotation.x += 8 * deltaTime
            b.mesh.rotation.z += 6 * deltaTime

            const waterY = ocean.getWaveHeight(b.mesh.position.x, b.mesh.position.z, elapsedTime)
            if (b.mesh.position.y <= waterY || elapsedTime - b.bornTime > 3.0) {
                if (b.mesh.position.y <= waterY) {
                    ocean.addRipple(b.mesh.position.x, b.mesh.position.z, elapsedTime, 0.045)
                    if (onWaterSplash) onWaterSplash(b.mesh.position)
                }
                this.scene.remove(b.mesh)
                this.cannonballs.splice(i, 1)
            }
        }
    }
}
