import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import gsap from 'gsap'
import { VoxelBuilder } from '../utils/VoxelBuilder.js'

/**
 * Модуль Динамічної Морської Фауни, Хмар та Плаваючих Деталей всередині пляшки.
 * Відповідає за:
 * 1) Анімовані щупальця воксельного Кракена з інтерактивним ударом по воді.
 * 2) Плаваючі на хвилях бочки з ромом та сигнальний навігаційний буй.
 * 3) Пухнасті воксельні хмари та зграю чайок під скляним склепінням пляшки.
 */
export class VoxelWildlifeAndProps {
    constructor(scene) {
        this.scene = scene
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

        // Математичні dummy-об'єкти для розрахунку матриць інстансів без алокації пам'яті
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

    /**
     * Побудова повноцінного воксельного Кракена: підводний тулуб, куполоподібна мантія з плавниками,
     * світильні очі біля ватерлінії, глибинні кореневі щупальця під водою та 4 рухомі бойові щупальця.
     */
    buildKraken() {
        this.krakenGroup = new THREE.Group()
        this.krakenGroup.position.set(-1.22, -0.34, 0.68)
        this.group.add(this.krakenGroup)

        const vs = 0.042
        const vb = new VoxelBuilder(vs, 1.0)

        // 1. Куполоподібна голова та мантія Кракена (частково виринає над водою та уходить під воду: gy = -7..+5)
        vb.fillEllipsoid(0, 0, 0, 3.8, 4.8, 3.6, '#7e22ce', 0.04)
        vb.fillEllipsoid(-0.5, 2.5, -0.5, 3.2, 3.5, 3.0, '#9333ea', 0.04)
        vb.fillEllipsoid(-1.0, 4.5, -0.8, 2.2, 2.2, 2.2, '#a855f7', 0.03)

        // Бічні плавники на мантії Кракена
        vb.fillBox(-4, 2, -1, -3, 4, 1, '#6b21a8', 0.03)
        vb.fillBox(3, 2, -1, 4, 4, 1, '#6b21a8', 0.03)

        // Надбрівні дуги та яскраві жовто-багряні очі Кракена, спрямовані на корабель
        for (const sideZ of [-2, 2]) {
            vb.add(3, 1, sideZ, '#581c87', 0.01)
            vb.add(4, 0, sideZ, '#facc15', 0.0) // золоте світильне око
            vb.add(4, 0, sideZ + (sideZ > 0 ? -1 : 1), '#ef4444', 0.0) // багряна зіниця
        }

        // Біолюмінесцентні бірюзові плями на мантії
        const bioSpots = [
            [-2, 3, 2], [1, 4, -2], [-3, 1, -2], [0, 5, 1], [-2, -2, 3], [2, -3, -2]
        ]
        for (const [bx, by, bz] of bioSpots) {
            vb.add(bx, by, bz, '#2dd4bf', 0.0)
        }

        // 2. Підводна частина тіла та 6 глибинних щупалець під водою (gy = -5..-18)
        vb.fillCylinderY(0, -10, -4, 2.6, 3.5, '#581c87', 0.04)
        for (let arm = 0; arm < 6; arm++) {
            const angle = (arm / 6) * Math.PI * 2
            for (let depth = 5; depth <= 18; depth++) {
                const t = (depth - 5) / 13
                const r = 2.4 + t * 3.8 + Math.sin(depth * 0.6 + arm) * 0.6
                const gx = Math.round(Math.cos(angle + t * 0.5) * r)
                const gy = -depth
                const gz = Math.round(Math.sin(angle + t * 0.5) * r)
                vb.add(gx, gy, gz, depth % 3 === 0 ? '#6b21a8' : '#4c1d95', 0.03)
                if (depth % 4 === 0) {
                    vb.add(gx, gy + 1, gz, '#14b8a6', 0.0)
                }
            }
        }

        this.krakenBodyMesh = vb.buildCulledMesh()
        this.krakenBodyMesh.castShadow = true
        this.krakenBodyMesh.receiveShadow = true
        this.krakenGroup.add(this.krakenBodyMesh)

        // 3. Чотири рухомі бойові щупальця над водою (MeshLambertMaterial ідентичний до тулуба Кракена)
        const segGeo = new THREE.BoxGeometry(0.082, 0.082, 0.082)
        const purpleColor = new THREE.Color('#7e22ce')
        const darkPurpleColor = new THREE.Color('#6b21a8')

        const tentacleMat = new THREE.MeshLambertMaterial()
        const suckerMat = new THREE.MeshLambertMaterial({
            color: '#2dd4bf'
        })

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

        // Габаритний проксі-бокс Кракена для миттєвої взаємодії через Raycaster
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
        const barrelVb = new VoxelBuilder(0.04, 1.0)
        barrelVb.fillBox(-2, -2, -2, 2, 2, 2, '#92400e', 0.03)
        barrelVb.fillBox(-2, -1, -2, 2, -1, 2, '#334155', 0.01)
        barrelVb.fillBox(-2, 1, -2, 2, 1, 2, '#334155', 0.01)
        const sampleBarrelMesh = barrelVb.buildCulledMesh()

        const barrelPositions = [
            [-1.05, -0.82],
            [0.75, -0.68],
            [0.95, 0.98]
        ]
        this.barrelInstancedMesh = new THREE.InstancedMesh(
            sampleBarrelMesh.geometry,
            sampleBarrelMesh.material,
            barrelPositions.length
        )
        this.barrelInstancedMesh.castShadow = false
        this.barrelInstancedMesh.receiveShadow = false
        this.group.add(this.barrelInstancedMesh)

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
        const buoyVb = new VoxelBuilder(0.038, 1.0)
        buoyVb.fillCylinderY(0, -2, 2, 2.5, 2.0, '#ef4444', 0.02)
        buoyVb.fillCylinderY(0, 3, 6, 1.5, 0.8, '#f8fafc', 0.02)
        buoyVb.add(0, 7, 0, '#00ff9d', 0.0)
        const buoyMesh = buoyVb.buildCulledMesh()
        buoyMesh.castShadow = false
        buoyMesh.position.set(0.95, -0.34, -0.22)

        const buoyProxy = new THREE.Mesh(propProxyGeo, this.proxyMat)
        buoyProxy.userData = { interactiveType: 'floating_prop' }
        buoyMesh.add(buoyProxy)
        this.interactiveMeshes.push(buoyProxy)
        this.group.add(buoyMesh)
        this.buoyProp = { mesh: buoyMesh, x: 0.95, z: -0.22, phase: 1.5 }
    }

    buildVoxelCloudsAndSeagulls() {
        const cloudConfigs = [
            // Базові хмари (видимі за будь-якої погоди)
            { x: -1.65, y: 1.42, z: 0.35, scale: 1.0, stormOnly: false },
            { x: 0.15, y: 1.52, z: -0.42, scale: 1.1, stormOnly: false },
            { x: 1.55, y: 1.38, z: 0.25, scale: 0.9, stormOnly: false },
            // Додаткові грозові хмари (з'являються під час шторму)
            { x: -2.25, y: 1.28, z: -0.28, scale: 1.15, stormOnly: true },
            { x: -0.85, y: 1.46, z: -0.15, scale: 1.25, stormOnly: true },
            { x: -0.35, y: 1.34, z: 0.48, scale: 1.1, stormOnly: true },
            { x: 0.92, y: 1.44, z: 0.32, scale: 1.2, stormOnly: true },
            { x: 2.05, y: 1.26, z: -0.25, scale: 1.05, stormOnly: true }
        ]
        const cloudProxyGeo = new THREE.BoxGeometry(0.68, 0.28, 0.42)

        for (let i = 0; i < cloudConfigs.length; i++) {
            const cfg = cloudConfigs[i]
            const vb = new VoxelBuilder(0.055 * cfg.scale, 1.0)
            vb.fillEllipsoid(0, 0, 0, 5, 2.2, 3, '#ffffff', 0.02)
            vb.fillEllipsoid(-3, -0.5, 1, 3.5, 1.8, 2.5, '#e2e8f0', 0.02)
            vb.fillEllipsoid(3, -0.5, -1, 3.5, 1.8, 2.5, '#cbd5e1', 0.02)
            // Безшовний суцільний меш без щілин та прихованих граней
            const cloudMesh = vb.buildCulledMesh()
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

        // 1. Геометрія тіла чайки з дзьобом (vertexColors)
        const bodyGeo = new THREE.BoxGeometry(0.036, 0.024, 0.036)
        const countBody = bodyGeo.attributes.position.count
        const bodyColors = new Float32Array(countBody * 3)
        bodyColors.fill(1.0)
        bodyGeo.setAttribute('color', new THREE.BufferAttribute(bodyColors, 3))

        const beakGeo = new THREE.BoxGeometry(0.036 * 0.6, 0.024 * 0.5, 0.036 * 0.5)
        beakGeo.translate(0.022, 0, 0)
        const countBeak = beakGeo.attributes.position.count
        const beakColors = new Float32Array(countBeak * 3)
        const beakColor = new THREE.Color('#f59e0b')
        for (let k = 0; k < countBeak; k++) {
            beakColors[k * 3] = beakColor.r
            beakColors[k * 3 + 1] = beakColor.g
            beakColors[k * 3 + 2] = beakColor.b
        }
        beakGeo.setAttribute('color', new THREE.BufferAttribute(beakColors, 3))

        const mergedBirdBodyGeo = mergeGeometries([bodyGeo, beakGeo])
        const birdBodyMat = new THREE.MeshLambertMaterial({
            vertexColors: true
        })

        // 2. Геометрія крил
        const wingGeo = new THREE.BoxGeometry(0.036 * 0.8, 0.024 * 0.4, 0.036 * 2.2)
        const whiteMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })

        const birdCount = 4
        this.birdBodiesMesh = new THREE.InstancedMesh(mergedBirdBodyGeo, birdBodyMat, birdCount)
        this.birdLeftWingsMesh = new THREE.InstancedMesh(wingGeo, whiteMat, birdCount)
        this.birdRightWingsMesh = new THREE.InstancedMesh(wingGeo, whiteMat, birdCount)

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
     * Оновлює кількість, розмір та колір хмар, а також видимість чайок відповідно до погодного режиму
     */
    setWeatherMode(mode) {
        const isStorm = mode === 'storm'
        const showSeagulls = mode === 'day' || mode === 'sunset'
        this.areSeagullsActive = showSeagulls
        this.birdBodiesMesh.visible = showSeagulls
        this.birdLeftWingsMesh.visible = showSeagulls
        this.birdRightWingsMesh.visible = showSeagulls

        let targetColor = '#ffffff'
        if (mode === 'storm') targetColor = '#18181b'      // густі чорно-графітові грозові хмари
        else if (mode === 'night') targetColor = '#334155' // темно-сині нічні хмари
        else if (mode === 'sunset') targetColor = '#fdba74'// багряно-золоті хмари заходу сонця

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
        // Плавучість тулуба Кракена на хвилях + вертикальний ривок при кліку
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

        // Анімація плаваючих бочок
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

        // Навігаційний буй
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

        // Анімація зграї чайок (активна лише вдень та на заході сонця)
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
