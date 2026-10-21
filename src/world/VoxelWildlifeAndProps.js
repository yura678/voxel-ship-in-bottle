import * as THREE from 'three'
import gsap from 'gsap'

/**
 * Модуль морської фауни, хмар та плаваючих деталей всередині пляшки.
 * Відповідає за:
 * 1) Модель та анімацію щупалець Кракена з реакцією на клік.
 * 2) Моделі плаваючих бочок та сигнального буя.
 * 3) Моделі воксельних хмар та зграю чайок.
 */
export class VoxelWildlifeAndProps {
    constructor(scene, modelManager = null) {
        this.scene = scene
        this.modelManager = modelManager
        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.interactiveMeshes = []
        this.barrels = []
        this.clouds = []
        this.seagulls = []
        this.areSeagullsActive = true
        this.tentacleSegments = []
        this.krakenSurgeY = 0

        this.proxyMat = new THREE.MeshBasicMaterial({ visible: false })

        // Допоміжні об'єкти для розрахунку матриць інстансів без алокації
        this.dummySeg = new THREE.Object3D()
        this.dummySucker = new THREE.Object3D()
        this.dummySeg.add(this.dummySucker)
        this.dummySucker.position.set(0.038, 0, 0)
        this.dummySucker.scale.set(0.45, 0.45, 0.45)
        this.dummySucker.updateMatrix()

        this.dummyBarrel = new THREE.Object3D()
        this.dummyBird = new THREE.Object3D()
        this.dummyWing = new THREE.Object3D()

        this.buildKraken()
        this.buildFloatingBarrelsAndBuoy()
        this.buildVoxelCloudsAndSeagulls()
    }

    buildKraken() {
        this.krakenGroup = new THREE.Group()
        this.krakenGroup.position.set(-1.22, -0.34, 0.68)
        this.group.add(this.krakenGroup)

        // Модель тіла Кракена
        this.krakenBodyMesh = this.modelManager ? this.modelManager.getMesh('kraken_body') : null
        if (this.krakenBodyMesh) {
            this.krakenBodyMesh.castShadow = true
            this.krakenBodyMesh.receiveShadow = true
            this.krakenGroup.add(this.krakenBodyMesh)
        }

        // Анімовані щупальця над водою через InstancedMesh
        const segGeo = new THREE.BoxGeometry(0.082, 0.082, 0.082)
        const purpleColor = new THREE.Color('#7e22ce')
        const darkPurpleColor = new THREE.Color('#6b21a8')

        const tentacleMat = new THREE.MeshLambertMaterial()
        const suckerMat = new THREE.MeshLambertMaterial({ color: '#2dd4bf' })

        const tentacleConfigs = [
            { baseX: 0.18, baseZ: -0.14, dirX: 0.14, dirZ: -0.10, count: 10 },
            { baseX: -0.18, baseZ: 0.14, dirX: -0.12, dirZ: 0.10, count: 9 },
            { baseX: 0.15, baseZ: 0.16, dirX: 0.10, dirZ: 0.12, count: 8 },
            { baseX: -0.16, baseZ: -0.15, dirX: -0.10, dirZ: -0.12, count: 8 }
        ]

        const totalSegments = tentacleConfigs.reduce((sum, c) => sum + c.count, 0)
        let totalSuckers = 0
        for (const cfg of tentacleConfigs) {
            for (let s = 0; s < cfg.count; s++) {
                if (s % 2 === 1) totalSuckers++
            }
        }

        this.tentacleInstancedMesh = new THREE.InstancedMesh(segGeo, tentacleMat, totalSegments)
        this.tentacleInstancedMesh.castShadow = true
        this.tentacleInstancedMesh.receiveShadow = true

        this.suckerInstancedMesh = new THREE.InstancedMesh(segGeo, suckerMat, totalSuckers)
        this.suckerInstancedMesh.castShadow = false
        this.suckerInstancedMesh.receiveShadow = false

        let segIdxGlobal = 0
        let suckerIdxGlobal = 0

        for (let t = 0; t < tentacleConfigs.length; t++) {
            const cfg = tentacleConfigs[t]
            for (let s = 0; s < cfg.count; s++) {
                const scale = 1.15 - s * 0.048
                const hasSucker = (s % 2 === 1)
                const suckerIdx = hasSucker ? suckerIdxGlobal++ : -1

                this.tentacleInstancedMesh.setColorAt(
                    segIdxGlobal,
                    s % 2 === 0 ? purpleColor : darkPurpleColor
                )

                this.tentacleSegments.push({
                    globalIdx: segIdxGlobal++,
                    tentacleIdx: t,
                    segIdx: s,
                    scale,
                    baseOffsetX: cfg.baseX,
                    baseOffsetZ: cfg.baseZ,
                    dirX: cfg.dirX,
                    dirZ: cfg.dirZ,
                    suckerIdx
                })
            }
        }

        if (this.tentacleInstancedMesh.instanceColor) {
            this.tentacleInstancedMesh.instanceColor.needsUpdate = true
        }

        this.krakenGroup.add(this.tentacleInstancedMesh)
        this.krakenGroup.add(this.suckerInstancedMesh)

        // Проксі-бокс для взаємодії через клік
        const krakenProxy = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.65), this.proxyMat)
        krakenProxy.position.set(0, 0.1, 0)
        krakenProxy.userData = { interactiveType: 'kraken' }
        this.krakenGroup.add(krakenProxy)
        this.interactiveMeshes.push(krakenProxy)
    }

    triggerKrakenSlap() {
        gsap.killTweensOf(this)
        gsap.fromTo(
            this,
            { krakenSurgeY: 0.24 },
            { krakenSurgeY: 0.0, duration: 0.95, ease: 'elastic.out(1.2, 0.4)' }
        )
    }

    buildFloatingBarrelsAndBuoy() {
        const propProxyGeo = new THREE.BoxGeometry(0.26, 0.28, 0.26)

        // 1. Плаваючі бочки через InstancedMesh
        const barrelMesh = this.modelManager ? this.modelManager.getMesh('barrel') : null
        const barrelPositions = [
            [-1.05, -0.82],
            [0.75, -0.68],
            [0.95, 0.98]
        ]

        if (barrelMesh) {
            this.barrelInstancedMesh = new THREE.InstancedMesh(
                barrelMesh.geometry,
                barrelMesh.material,
                barrelPositions.length
            )
            this.barrelInstancedMesh.castShadow = false
            this.barrelInstancedMesh.receiveShadow = false
            this.group.add(this.barrelInstancedMesh)
        }

        for (let i = 0; i < barrelPositions.length; i++) {
            const [x, z] = barrelPositions[i]
            const proxy = new THREE.Mesh(propProxyGeo, this.proxyMat)
            proxy.position.set(x, -0.34, z)
            proxy.userData = { interactiveType: 'floating_prop' }
            this.interactiveMeshes.push(proxy)
            this.group.add(proxy)

            this.barrels.push({ proxy, x, z, phase: Math.random() * 5 })
        }

        // 2. Морський навігаційний буй
        const buoyMesh = this.modelManager ? this.modelManager.getMesh('buoy') : null
        if (buoyMesh) {
            buoyMesh.castShadow = false
            buoyMesh.position.set(0.95, -0.34, -0.22)

            const buoyProxy = new THREE.Mesh(propProxyGeo, this.proxyMat)
            buoyProxy.userData = { interactiveType: 'floating_prop' }
            buoyMesh.add(buoyProxy)
            this.interactiveMeshes.push(buoyProxy)
            this.group.add(buoyMesh)
            this.buoyProp = { mesh: buoyMesh, x: 0.95, z: -0.22, phase: 1.5 }
        }
    }

    buildVoxelCloudsAndSeagulls() {
        const cloudConfigs = [
            // Базові хмари
            { x: -1.65, y: 1.42, z: 0.35, scale: 1.0, stormOnly: false },
            { x: 0.15, y: 1.52, z: -0.42, scale: 1.1, stormOnly: false },
            { x: 1.55, y: 1.38, z: 0.25, scale: 0.9, stormOnly: false },
            // Додаткові грозові хмари
            { x: -2.25, y: 1.28, z: -0.28, scale: 1.15, stormOnly: true },
            { x: -0.85, y: 1.46, z: -0.15, scale: 1.25, stormOnly: true },
            { x: -0.35, y: 1.34, z: 0.48, scale: 1.1, stormOnly: true },
            { x: 0.92, y: 1.44, z: 0.32, scale: 1.2, stormOnly: true },
            { x: 2.05, y: 1.26, z: -0.25, scale: 1.05, stormOnly: true }
        ]
        const cloudProxyGeo = new THREE.BoxGeometry(0.68, 0.28, 0.42)
        const cloudGeo = this.modelManager ? this.modelManager.getGeometry('clouds') : null

        for (let i = 0; i < cloudConfigs.length; i++) {
            const cfg = cloudConfigs[i]
            const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true })
            const cloudMesh = new THREE.Mesh(cloudGeo || new THREE.BoxGeometry(0.5, 0.25, 0.35), cloudMat)
            cloudMesh.scale.setScalar(cfg.scale)
            cloudMesh.castShadow = true
            cloudMesh.receiveShadow = false
            cloudMesh.position.set(cfg.x, cfg.y, cfg.z)

            if (cfg.stormOnly) {
                cloudMesh.visible = false
                cloudMesh.scale.set(0.01, 0.01, 0.01)
            }

            const cloudProxy = new THREE.Mesh(cloudProxyGeo, this.proxyMat)
            cloudProxy.visible = !cfg.stormOnly
            cloudProxy.userData = { interactiveType: 'voxel_cloud' }
            cloudMesh.add(cloudProxy)
            this.interactiveMeshes.push(cloudProxy)
            this.group.add(cloudMesh)
            this.clouds.push({
                mesh: cloudMesh,
                proxy: cloudProxy,
                baseX: cfg.x,
                baseY: cfg.y,
                baseZ: cfg.z,
                stormOnly: cfg.stormOnly,
                phase: i * 1.7
            })
        }

        // Зграя чайок
        const birdBodyGeo = this.modelManager ? this.modelManager.getGeometry('seagull', 'SeagullBody') : new THREE.BoxGeometry(0.036, 0.024, 0.036)
        const birdWingGeo = this.modelManager ? this.modelManager.getGeometry('seagull', 'SeagullWing') : new THREE.BoxGeometry(0.028, 0.01, 0.08)

        const birdBodyMat = new THREE.MeshLambertMaterial({ vertexColors: true })
        const whiteMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })

        const birdCount = 4
        this.birdBodiesMesh = new THREE.InstancedMesh(birdBodyGeo, birdBodyMat, birdCount)
        this.birdLeftWingsMesh = new THREE.InstancedMesh(birdWingGeo, whiteMat, birdCount)
        this.birdRightWingsMesh = new THREE.InstancedMesh(birdWingGeo, whiteMat, birdCount)

        for (const m of [this.birdBodiesMesh, this.birdLeftWingsMesh, this.birdRightWingsMesh]) {
            m.castShadow = false
            m.receiveShadow = false
            this.group.add(m)
        }

        for (let i = 0; i < birdCount; i++) {
            this.seagulls.push({
                index: i,
                centerX: -0.4 + (i - 1.5) * 0.65,
                centerY: 0.95 + (i % 2) * 0.25,
                radius: 0.45 + (i % 3) * 0.15,
                speed: 1.1 + i * 0.18,
                phase: i * 1.7
            })
        }
    }

    /**
     * Оновлює колір та видимість хмар і чайок відповідно до погодного режиму
     */
    setWeatherMode(mode) {
        const isStorm = mode === 'storm'
        const showSeagulls = mode === 'day' || mode === 'sunset'
        this.areSeagullsActive = showSeagulls
        this.birdBodiesMesh.visible = showSeagulls
        this.birdLeftWingsMesh.visible = showSeagulls
        this.birdRightWingsMesh.visible = showSeagulls

        let targetColor = '#ffffff'
        if (mode === 'storm') targetColor = '#18181b'
        else if (mode === 'night') targetColor = '#334155'
        else if (mode === 'sunset') targetColor = '#fdba74'

        for (const c of this.clouds) {
            c.mesh.material.color.set(targetColor)

            if (c.stormOnly) {
                c.proxy.visible = isStorm
                if (isStorm) {
                    c.mesh.visible = true
                    gsap.to(c.mesh.scale, {
                        x: 1.2,
                        y: 1.15,
                        z: 1.2,
                        duration: 0.65,
                        ease: 'back.out(1.4)'
                    })
                } else {
                    gsap.to(c.mesh.scale, {
                        x: 0.01,
                        y: 0.01,
                        z: 0.01,
                        duration: 0.45,
                        onComplete: () => {
                            if (mode !== 'storm') c.mesh.visible = false
                        }
                    })
                }
            } else {
                const s = isStorm ? 1.25 : 1.0
                gsap.to(c.mesh.scale, {
                    x: s,
                    y: s,
                    z: s,
                    duration: 0.6
                })
            }
        }
    }

    update(elapsedTime, ocean) {
        // Плавучість тіла Кракена на хвилях
        const kBuoy = ocean.getBuoyancyTransform(-1.22, 0.68, elapsedTime, 0.22)
        this.krakenGroup.position.y = kBuoy.height + this.krakenSurgeY
        this.krakenGroup.rotation.z = kBuoy.pitch * 0.55
        this.krakenGroup.rotation.x = kBuoy.roll * 0.55

        for (let i = 0; i < this.tentacleSegments.length; i++) {
            const seg = this.tentacleSegments[i]
            const s = seg.segIdx
            const wave = Math.sin(elapsedTime * 2.8 - s * 0.48 + seg.tentacleIdx * 1.6)
            const waveZ = Math.cos(elapsedTime * 2.3 - s * 0.42 + seg.tentacleIdx * 1.6)
            const arch = Math.sin((s / 9) * Math.PI)

            const posX = seg.baseOffsetX + seg.dirX * arch + wave * (s * 0.012)
            const posY = -0.16 + s * 0.046
            const posZ = seg.baseOffsetZ + seg.dirZ * arch + waveZ * (s * 0.012)
            const rotZ = -wave * 0.28
            const rotX = waveZ * 0.28

            this.dummySeg.position.set(posX, posY, posZ)
            this.dummySeg.rotation.set(rotX, 0, rotZ)
            this.dummySeg.scale.setScalar(seg.scale)
            this.dummySeg.updateMatrix()

            this.tentacleInstancedMesh.setMatrixAt(seg.globalIdx, this.dummySeg.matrix)

            if (seg.suckerIdx !== -1) {
                this.dummySucker.updateMatrix()
                this.dummySucker.matrixWorld.multiplyMatrices(this.dummySeg.matrix, this.dummySucker.matrix)
                this.suckerInstancedMesh.setMatrixAt(seg.suckerIdx, this.dummySucker.matrixWorld)
            }
        }
        this.tentacleInstancedMesh.instanceMatrix.needsUpdate = true
        this.suckerInstancedMesh.instanceMatrix.needsUpdate = true

        // Плаваючі бочки
        if (this.barrelInstancedMesh) {
            for (let i = 0; i < this.barrels.length; i++) {
                const b = this.barrels[i]
                const buoy = ocean.getBuoyancyTransform(b.x, b.z, elapsedTime, 0.16)
                this.dummyBarrel.position.set(b.x, buoy.height, b.z)
                this.dummyBarrel.rotation.set(buoy.roll * 1.15, 0, buoy.pitch * 1.15)
                this.dummyBarrel.updateMatrix()
                this.barrelInstancedMesh.setMatrixAt(i, this.dummyBarrel.matrix)
                b.proxy.position.set(b.x, buoy.height, b.z)
            }
            this.barrelInstancedMesh.instanceMatrix.needsUpdate = true
        }

        // Сигнальний буй
        if (this.buoyProp) {
            const buoy = ocean.getBuoyancyTransform(this.buoyProp.x, this.buoyProp.z, elapsedTime, 0.16)
            this.buoyProp.mesh.position.y = buoy.height
            this.buoyProp.mesh.rotation.z = buoy.pitch * 1.15
            this.buoyProp.mesh.rotation.x = buoy.roll * 1.15
        }

        for (const c of this.clouds) {
            c.mesh.position.x = c.baseX + Math.sin(elapsedTime * 0.35 + c.phase) * 0.22
            c.mesh.position.y = c.baseY + Math.cos(elapsedTime * 0.6 + c.phase) * 0.04
        }

        // Політ чайок
        if (!this.areSeagullsActive) return

        for (let i = 0; i < this.seagulls.length; i++) {
            const b = this.seagulls[i]
            const angle = elapsedTime * b.speed + b.phase
            const nextX = b.centerX + Math.cos(angle) * b.radius
            const nextZ = Math.sin(angle) * (b.radius * 0.75)
            const nextY = b.centerY + Math.sin(elapsedTime * 2.2 + b.phase) * 0.06

            this.dummyBird.position.set(nextX, nextY, nextZ)
            this.dummyBird.rotation.set(0, -angle + Math.PI * 0.5, 0)
            this.dummyBird.updateMatrix()
            this.birdBodiesMesh.setMatrixAt(i, this.dummyBird.matrix)

            const flap = Math.sin(elapsedTime * 14 + b.phase) * 0.55

            this.dummyWing.position.set(0, 0.01, -0.030)
            this.dummyWing.rotation.set(flap, 0, 0)
            this.dummyWing.updateMatrix()
            this.dummyWing.matrix.premultiply(this.dummyBird.matrix)
            this.birdLeftWingsMesh.setMatrixAt(i, this.dummyWing.matrix)

            this.dummyWing.position.set(0, 0.01, 0.030)
            this.dummyWing.rotation.set(-flap, 0, 0)
            this.dummyWing.updateMatrix()
            this.dummyWing.matrix.premultiply(this.dummyBird.matrix)
            this.birdRightWingsMesh.setMatrixAt(i, this.dummyWing.matrix)
        }
        this.birdBodiesMesh.instanceMatrix.needsUpdate = true
        this.birdLeftWingsMesh.instanceMatrix.needsUpdate = true
        this.birdRightWingsMesh.instanceMatrix.needsUpdate = true
    }
}
