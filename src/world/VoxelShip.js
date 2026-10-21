import * as THREE from 'three'
import { SHIP_PALETTE } from '../config/sceneConfig.js'
import { VoxelBuilder } from '../utils/VoxelBuilder.js'

/**
 * Модуль Воксельного Корабля.
 * Формує воксельний корпус галеона, капітанську каюту зі світильними вікнами,
 * три щогли з вітрилами, прапор та інтерактивні бортові гармати.
 */
export class VoxelShip {
    constructor(scene) {
        this.scene = scene

        this.group = new THREE.Group()
        this.basePosition = new THREE.Vector3(-0.35, -0.32, 0.0)
        this.targetOffset = new THREE.Vector2(0, 0)
        this.group.position.copy(this.basePosition)
        this.scene.add(this.group)

        this.interactiveMeshes = []
        this.cannonballs = []
        this.flagDummy = new THREE.Object3D()

        // Спільні геометрія та матеріал для гарматних ядер
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
        const vb = new VoxelBuilder(this.voxelSize, 1.0)
        const p = SHIP_PALETTE

        // 1. Кіль, борти корпусу та гарматна палуба
        for (let gx = -16; gx <= 17; gx++) {
            const normX = gx / 17
            const halfWidth = Math.max(1, Math.round((1 - normX * normX * 0.72) * 6.5))

            for (let gy = -4; gy <= 4; gy++) {
                const flare = gy > 0 ? Math.round(gy * 0.35) : -Math.round(Math.abs(gy) * 0.35)
                const w = Math.max(1, halfWidth + flare)

                for (let gz = -w; gz <= w; gz++) {
                    const isOuter = Math.abs(gz) >= w - 1 || gx <= -15 || gx >= 15
                    if (gy === 0 && !isOuter) {
                        vb.add(gx, gy, gz, (gx + gz) % 2 === 0 ? p.deck : p.deckAlt, 0.02)
                    } else if (gy < 0 || isOuter) {
                        let col = p.hullMid
                        if (gy <= -3) col = p.keel
                        else if (gy === -1) col = p.trim
                        else if (gy === 3) col = p.gold
                        else if (gy >= 1) col = p.hullLight
                        else col = p.hullDark

                        const isGunport = gy === 2 && Math.abs(gz) === w && gx >= -8 && gx <= 8 && Math.abs(gx) % 5 === 2
                        if (!isGunport) {
                            vb.add(gx, gy, gz, col, 0.03)
                        }
                    }
                }

                if (gy === 2 && gx >= -8 && gx <= 8 && Math.abs(gx) % 5 === 2) {
                    vb.add(gx, gy, -w - 1, p.iron, 0.01)
                    vb.add(gx, gy, w + 1, p.iron, 0.01)
                }
            }
        }

        // 2. Кормова надбудова — Капітанська каюта
        for (let gx = -17; gx <= -9; gx++) {
            const w = gx <= -15 ? 4 : 5
            for (let gy = 1; gy <= 7; gy++) {
                for (let gz = -w; gz <= w; gz++) {
                    const isWall = gx === -17 || gx === -9 || Math.abs(gz) === w || gy === 7
                    if (!isWall) continue

                    const isSternWindow = gx === -17 && gy >= 3 && gy <= 5 && Math.abs(gz) <= 2 && gz % 2 === 0
                    const isSideWindow = Math.abs(gz) === w && gx >= -14 && gx <= -12 && gy >= 3 && gy <= 4
                    if (isSternWindow || isSideWindow) {
                        vb.add(gx, gy, gz, '#fde047', 0.0)
                    } else if (gy === 7) {
                        vb.add(gx, gy, gz, p.deck, 0.02)
                    } else if (gy === 6 || (gx === -17 && gy === 2)) {
                        vb.add(gx, gy, gz, p.gold, 0.02)
                    } else {
                        vb.add(gx, gy, gz, p.hullDark, 0.03)
                    }
                }
            }
        }

        for (let gx = -17; gx <= -10; gx++) {
            vb.add(gx, 8, -5, p.gold, 0.02)
            vb.add(gx, 8, 5, p.gold, 0.02)
        }
        vb.add(-10, 8, 0, p.mast, 0.01)
        vb.add(-10, 9, 0, p.gold, 0.01)
        vb.add(-12, 8, 0, '#1e3a8a', 0.01)
        vb.add(-12, 9, 0, '#dc2626', 0.01)
        vb.add(-12, 10, 0, '#fed7aa', 0.01)
        vb.add(-12, 11, 0, '#111827', 0.01)

        // 3. Носова надбудова та бушприт
        for (let gx = 12; gx <= 18; gx++) {
            const w = Math.max(1, 6 - Math.floor((gx - 11) * 0.75))
            for (let gy = 1; gy <= 5; gy++) {
                for (let gz = -w; gz <= w; gz++) {
                    if (gy === 5) {
                        vb.add(gx, gy, gz, p.deck, 0.02)
                    } else if (Math.abs(gz) === w || gx === 12) {
                        vb.add(gx, gy, gz, gy === 4 ? p.gold : p.hullMid, 0.02)
                    }
                }
            }
        }

        for (let i = 0; i <= 9; i++) {
            vb.add(17 + i, 5 + Math.floor(i * 0.45), 0, p.mast, 0.02)
        }
        vb.add(19, 3, 0, p.gold, 0.01)
        vb.add(20, 4, 0, p.gold, 0.01)
        vb.add(21, 4, 0, '#fbbf24', 0.01)

        vb.fillBox(-4, 1, -2, -2, 2, 2, '#451a03', 0.02)
        vb.fillBox(4, 1, -4, 5, 2, -3, '#92400e', 0.03)
        vb.fillBox(6, 1, 3, 7, 2, 4, '#b45309', 0.03)

        // 4. Три щогли корабля, дерев'яні реї та натягнуті вітрила з такелажем
        const masts = [
            { gx: 9, height: 26, crowY: 19, sailBottom: 7, sailTop: 23, width: 9 },
            { gx: 0, height: 32, crowY: 23, sailBottom: 6, sailTop: 28, width: 12 },
            { gx: -11, height: 24, crowY: 18, sailBottom: 9, sailTop: 21, width: 8 }
        ]

        for (const m of masts) {
            // Щогла (стовбур)
            for (let gy = 1; gy <= m.height; gy++) {
                vb.add(m.gx, gy, 0, p.mast, 0.02)
                vb.add(m.gx - 1, gy, 0, p.hullDark, 0.01)
            }

            // Марсова площадка (вороняче гніздо)
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    vb.add(m.gx + dx, m.crowY, dz, p.hullDark, 0.02)
                }
            }

            const midY = Math.round((m.sailBottom + m.sailTop) * 0.5)

            // Дерев'яні горизонтальні реї (нижня, середня, верхня), надійно закріплені на щоглі
            const yardConfigs = [
                { y: m.sailBottom, w: m.width },
                { y: midY, w: m.width },
                { y: m.sailTop, w: Math.max(4, m.width - 2) }
            ]

            for (const yd of yardConfigs) {
                for (let gz = -yd.w; gz <= yd.w; gz++) {
                    vb.add(m.gx, yd.y, gz, p.mast, 0.02)
                    // Бугелі та кріпильні елементи реї до щогли і вітрила
                    if (Math.abs(gz) <= 1 || Math.abs(gz) === yd.w) {
                        vb.add(m.gx + 1, yd.y, gz, p.hullDark, 0.02)
                    }
                }
            }

            // 1) Нижнє вітрило (Course / грот/фок) — від нижньої реї до середньої
            for (let gy = m.sailBottom; gy <= midY; gy++) {
                const normH = (gy - m.sailBottom) / Math.max(1, midY - m.sailBottom)
                const belly = Math.round(Math.sin(normH * Math.PI) * 1.8)
                const curW = m.width

                for (let gz = -curW; gz <= curW; gz++) {
                    const zArch = Math.round((1 - (gz / curW) * (gz / curW)) * 0.8)
                    const sx = m.gx + 1 + belly + zArch

                    let sailColor = (gy + gz) % 5 === 0 ? p.sailShade : p.sail

                    // Червоний гербовий хрест на центральному грот-вітрилі
                    if (m.gx === 0) {
                        const cy = Math.round((m.sailBottom + midY) * 0.5)
                        const dy = Math.abs(gy - cy)
                        const dz = Math.abs(gz)
                        if ((dy <= 1 && dz <= 4) || (dz <= 1 && dy <= 3) || (dy === 2 && dz === 2)) {
                            sailColor = p.emblem
                        }
                    }

                    vb.add(sx, gy, gz, sailColor, 0.015)
                }
            }

            // 2) Верхнє вітрило (Topsail / марсель) — від середньої реї до верхньої (без жодних прорізів!)
            for (let gy = midY; gy <= m.sailTop; gy++) {
                const normH2 = (gy - midY) / Math.max(1, m.sailTop - midY)
                const belly2 = Math.round(Math.sin(normH2 * Math.PI) * 1.5)
                const taper2 = Math.round(normH2 * 2.0)
                const curW2 = Math.max(3, m.width - 2 - taper2)

                for (let gz = -curW2; gz <= curW2; gz++) {
                    const zArch2 = Math.round((1 - (gz / curW2) * (gz / curW2)) * 0.8)
                    const sx = m.gx + 1 + belly2 + zArch2
                    const sailColor = (gy + gz) % 5 === 0 ? p.sailShade : p.sail
                    vb.add(sx, gy, gz, sailColor, 0.015)
                }
            }

            // Такелажні канати (шкоти), що кріплять нижні кути вітрил до корпусу судна
            for (let dy = 1; dy <= 3; dy++) {
                vb.add(m.gx + 1 - dy, m.sailBottom - dy, m.width, '#78350f', 0.02)
                vb.add(m.gx + 1 - dy, m.sailBottom - dy, -m.width, '#78350f', 0.02)
            }
        }

        // 5. Бушприт та носовий клівер
        for (let b = 0; b <= 7; b++) {
            vb.add(17 + b, 1 + Math.round(b * 0.45), 0, p.mast, 0.02)
        }
        for (let gy = 7; gy <= 19; gy++) {
            const t = (gy - 7) / 12
            const xStart = Math.round(11 + (1 - t) * 5)
            const xEnd = Math.round(15 + (1 - t) * 7)
            for (let gx = xStart; gx <= xEnd; gx++) {
                vb.add(gx, gy, 0, p.sail, 0.015)
            }
        }

        this.shipMesh = vb.buildCulledMesh()
        this.shipMesh.castShadow = true
        this.shipMesh.receiveShadow = true
        this.group.add(this.shipMesh)

        // Габаритний бокс корабля для взаємодії через Raycaster
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
