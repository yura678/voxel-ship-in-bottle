import * as THREE from 'three'

/**
 * Модуль статичного ландшафту та дна всередині пляшки.
 * Відповідає за розміщення 3D моделей островів, морської арки та дна,
 * промінь маяка та анімацію монет зі скрині скарбів.
 */
export class VoxelLandscape {
    constructor(scene, modelManager = null) {
        this.modelManager = modelManager
        this.scene = scene
        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.interactiveMeshes = []
        this.lighthouseOn = false

        // Пул монет золота на InstancedMesh
        this.maxCoins = 56
        this.coinPoolIdx = 0
        this.coinData = []
        this.coinDummy = new THREE.Object3D()
        this.hasActiveCoins = false

        this.coinGeo = new THREE.BoxGeometry(0.048, 0.048, 0.048)
        this.coinMat = new THREE.MeshStandardMaterial({
            color: '#fde047',
            emissive: '#f59e0b',
            emissiveIntensity: 1.2,
            metalness: 0.85,
            roughness: 0.15
        })
        this.coinMesh = new THREE.InstancedMesh(this.coinGeo, this.coinMat, this.maxCoins)
        this.coinMesh.frustumCulled = false
        this.coinMesh.castShadow = false
        this.coinMesh.receiveShadow = false

        this.coinDummy.position.set(0, -999, 0)
        this.coinDummy.scale.set(0, 0, 0)
        this.coinDummy.updateMatrix()
        for (let i = 0; i < this.maxCoins; i++) {
            this.coinMesh.setMatrixAt(i, this.coinDummy.matrix)
            this.coinData.push({
                active: false,
                x: 0,
                y: -999,
                z: 0,
                vx: 0,
                vy: 0,
                vz: 0,
                rotX: 0,
                rotY: 0,
                rotZ: 0,
                rotSpeedX: 0,
                rotSpeedY: 0,
                born: 0,
                life: 1.8
            })
        }
        this.coinMesh.instanceMatrix.needsUpdate = true
        this.group.add(this.coinMesh)

        this.proxyMat = new THREE.MeshBasicMaterial({ visible: false })

        this.buildStaticLandscapesAndReef()
        this.buildLighthouseBeam()
    }

    buildStaticLandscapesAndReef() {
        const lighthouseModel = this.modelManager ? this.modelManager.getMesh('lighthouse_island') : null
        const treasureModel = this.modelManager ? this.modelManager.getMesh('treasure_island') : null
        const seaArchModel = this.modelManager ? this.modelManager.getMesh('sea_arch') : null
        const seabedModel = this.modelManager ? this.modelManager.getMesh('seabed') : null

        if (lighthouseModel) {
            this.lighthouseIslandMesh = lighthouseModel
            this.lighthouseIslandMesh.castShadow = true
            this.lighthouseIslandMesh.receiveShadow = true
            this.group.add(this.lighthouseIslandMesh)
        }

        if (treasureModel) {
            this.treasureIslandMesh = treasureModel
            this.treasureIslandMesh.castShadow = true
            this.treasureIslandMesh.receiveShadow = true
            this.group.add(this.treasureIslandMesh)
        }

        if (seaArchModel) {
            this.seaArchMesh = seaArchModel
            this.seaArchMesh.castShadow = true
            this.seaArchMesh.receiveShadow = true
            this.group.add(this.seaArchMesh)
        }

        if (seabedModel) {
            this.seabedMesh = seabedModel
            this.seabedMesh.castShadow = false
            this.seabedMesh.receiveShadow = false
            if (this.seabedMesh.material) {
                this.seabedMesh.material.polygonOffset = true
                this.seabedMesh.material.polygonOffsetFactor = 1.0
                this.seabedMesh.material.polygonOffsetUnits = 1.0
            }
            this.group.add(this.seabedMesh)
        }

        // Проксі-меші для кліків та взаємодії
        const lighthouseProxy = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.85, 1.15), this.proxyMat)
        lighthouseProxy.position.set(-2.22, 0.35, -0.58)
        lighthouseProxy.userData = { interactiveType: 'lighthouse' }
        this.interactiveMeshes.push(lighthouseProxy)
        this.group.add(lighthouseProxy)

        const treasureProxy = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.05), this.proxyMat)
        treasureProxy.position.set(1.65, 0.22, 0.58)
        treasureProxy.userData = { interactiveType: 'treasure_island' }
        this.interactiveMeshes.push(treasureProxy)
        this.group.add(treasureProxy)
    }

    buildLighthouseBeam() {
        this.lighthousePivot = new THREE.Group()
        this.lighthousePivot.position.set(-2.42, 1.09, -0.62)
        this.group.add(this.lighthousePivot)

        this.lighthousePointLight = new THREE.PointLight('#fef08a', 0.0, 4.5)
        this.lighthousePivot.add(this.lighthousePointLight)

        const coneGeo = new THREE.ConeGeometry(0.45, 2.35, 24, 1, true)
        coneGeo.translate(0, -1.175, 0)
        coneGeo.rotateX(-Math.PI * 0.5)

        this.beamMaterial = new THREE.MeshBasicMaterial({
            color: '#fef08a',
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.beamMesh = new THREE.Mesh(coneGeo, this.beamMaterial)
        this.beamMesh.visible = false
        this.lighthousePivot.add(this.beamMesh)
    }

    setLighthouseState(isOn) {
        this.lighthouseOn = Boolean(isOn)
        this.lighthousePointLight.intensity = this.lighthouseOn ? 3.5 : 0
        this.beamMesh.visible = this.lighthouseOn
        return this.lighthouseOn
    }

    toggleLighthouse() {
        return this.setLighthouseState(!this.lighthouseOn)
    }

    spawnTreasureBurst(currentTime) {
        const countToSpawn = 14
        for (let i = 0; i < countToSpawn; i++) {
            const idx = this.coinPoolIdx
            this.coinPoolIdx = (this.coinPoolIdx + 1) % this.maxCoins
            const c = this.coinData[idx]

            c.active = true
            c.x = 1.48 + (Math.random() - 0.5) * 0.08
            c.y = 0.18
            c.z = 0.62 + (Math.random() - 0.5) * 0.08
            c.vx = (Math.random() - 0.5) * 0.95
            c.vy = 1.1 + Math.random() * 0.65
            c.vz = (Math.random() - 0.5) * 0.95
            c.rotX = Math.random() * Math.PI * 2
            c.rotY = Math.random() * Math.PI * 2
            c.rotZ = Math.random() * Math.PI * 2
            c.rotSpeedX = 6 + Math.random() * 6
            c.rotSpeedY = 8 + Math.random() * 6
            c.born = currentTime
            c.life = 1.4 + Math.random() * 0.4
        }
        this.hasActiveCoins = true
    }

    update(elapsedTime, deltaTime) {
        if (this.lighthousePivot && this.lighthouseOn) {
            this.lighthousePivot.rotation.y = elapsedTime * 1.15
        }

        if (this.hasActiveCoins) {
            let stillActive = false
            for (let i = 0; i < this.maxCoins; i++) {
                const c = this.coinData[i]
                if (!c.active) continue

                const age = elapsedTime - c.born
                if (age >= c.life || c.y < -0.45) {
                    c.active = false
                    this.coinDummy.position.set(0, -999, 0)
                    this.coinDummy.scale.set(0, 0, 0)
                    this.coinDummy.updateMatrix()
                    this.coinMesh.setMatrixAt(i, this.coinDummy.matrix)
                    continue
                }

                stillActive = true
                c.vy -= 3.2 * deltaTime
                c.x += c.vx * deltaTime
                c.y += c.vy * deltaTime
                c.z += c.vz * deltaTime
                c.rotX += c.rotSpeedX * deltaTime
                c.rotY += c.rotSpeedY * deltaTime

                const progress = age / c.life
                const scale = Math.max(0.001, 1.0 - progress * progress * progress)

                this.coinDummy.position.set(c.x, c.y, c.z)
                this.coinDummy.rotation.set(c.rotX, c.rotY, c.rotZ)
                this.coinDummy.scale.set(scale, scale, scale)
                this.coinDummy.updateMatrix()
                this.coinMesh.setMatrixAt(i, this.coinDummy.matrix)
            }
            this.coinMesh.instanceMatrix.needsUpdate = true
            this.hasActiveCoins = stillActive
        }
    }
}
