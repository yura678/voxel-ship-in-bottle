import * as THREE from 'three'
import { LANDMARK_COORDS } from '../config/sceneConfig.js'
import { VoxelBuilder } from '../utils/VoxelBuilder.js'
import { getBottleInnerRadius, getBottleInnerBaseX } from '../utils/bottleMath.js'

/**
 * Модуль Статичного Воксельного Архипелагу та Коралового Рифу всередині пляшки.
 * Відповідає за:
 * 1) Підводне піщане дно в нижній частині колби, різнобарвні корали та зарості водоростей.
 * 2) Базальтовий острів із червоно-білим маяком, що виростає з самого морського дна.
 * 3) Тропічний кораловий атол із пальмами та скринею скарбів на кам'янистому рифовому фундаменті.
 * 4) Кам'яну морську арку біля горлечка пляшки, опори якої спираються на дно.
 */
export class VoxelLandscape {
    constructor(scene) {
        this.scene = scene
        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.interactiveMeshes = []
        this.lighthouseOn = false

        // Оптимізований пул монет золота на єдиному THREE.InstancedMesh (1 Draw Call замість 14..42)
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
        const vs = 0.055
        const vb = new VoxelBuilder(vs, 1.0)
        const halfS = vs * 1.001 * 0.5

        const numSegments = 44
        const cosHalfDPhi = Math.cos(Math.PI / numSegments)
        const margin = 0.020
        /**
         * Перевіряє, чи всі 8 кутів воксельного кубика (gx, gy, gz) строго знаходяться
         * всередині внутрішньої стінки скляної колби пляшки без жодних виступів назовні.
         * Враховує 3D кривизну сферичного купола денця (вздовж осі X), плоскі полігональні
         * хорди 44-сегментного LatheGeometry та нахил звуження колби.
         */
        const isVoxelInsideBottle = (gx, gy, gz) => {
            const vx = gx * vs
            const vy = gy * vs
            const vz = gz * vs

            for (const dx of [-halfS, halfS]) {
                const cx = vx + dx
                if (cx < -3.38 || cx > 4.55) return false

                for (const dy of [-halfS, halfS]) {
                    const cy = vy + dy
                    for (const dz of [-halfS, halfS]) {
                        const cz = vz + dz
                        const cr = Math.hypot(cy, cz)

                        const rMax = getBottleInnerRadius(cx)
                        if (rMax <= 0.1) return false
                        if (cr > rMax * cosHalfDPhi - margin) return false

                        // У зоні сферичного купола денця (cx < -3.08) перевіряємо поздовжню межу X
                        if (cx < -3.08) {
                            const xMinAllowed = getBottleInnerBaseX(cr) + margin
                            if (cx < xMinAllowed) return false
                        }
                    }
                }
            }
            return true
        }

        const addClamped = (wx, wy, wz, color, jitter = 0.03) => {
            const gx = Math.round(wx / vs)
            const gy = Math.round(wy / vs)
            const gz = Math.round(wz / vs)
            if (isVoxelInsideBottle(gx, gy, gz)) {
                vb.add(gx, gy, gz, color, jitter)
            }
        }

        // 1. Рельєфне піщано-скелясте морське дно вздовж нижньої частини колби
        // Поширюється на стабільному горизонтальному рівні (duneTopY ≈ -1.36)
        // від сферичного денця (wx = -3.36) до природного змикання з підйомом скла спереду (wx = 3.10)
        for (let wx = -3.36; wx <= 3.10; wx += vs) {
            const innerR = getBottleInnerRadius(wx)
            if (innerR <= 0.45) continue

            for (let wz = -innerR; wz <= innerR; wz += vs) {
                const rSq = innerR * innerR - wz * wz
                if (rSq <= 0) continue
                const glassBottomY = -Math.sqrt(rSq)
                const duneTopY = -1.36 + Math.sin(wx * 2.1) * Math.cos(wz * 2.4) * 0.08

                if (glassBottomY <= duneTopY) {
                    for (let wy = glassBottomY; wy <= duneTopY; wy += vs) {
                        // Пісок формує лише верхній поверхневий шар дна (wy >= duneTopY - vs * 1.2),
                        // а вся глибинна товща дна є суцільною скельною основою (кам'яний моноліт #475569)
                        const isSurfaceSand = wy >= duneTopY - vs * 1.2 && wx > -3.20
                        const isPebble = vb.hash(Math.round(wx * 20), Math.round(wy * 20), Math.round(wz * 20)) > 0.85
                        const col = isSurfaceSand ? (isPebble ? '#94a3b8' : '#d6b283') : '#475569'
                        addClamped(wx, wy, wz, col, 0.04)
                    }
                }
            }
        }

        // Яскраві коралові кущі на морському дні
        const coralSpots = [
            { x: -1.1, z: -0.55, color: '#ec4899', h: 7 },
            { x: -0.45, z: 0.62, color: '#f97316', h: 8 },
            { x: 0.35, z: -0.58, color: '#a855f7', h: 7 },
            { x: 0.92, z: 0.48, color: '#06b6d4', h: 6 },
            { x: -1.55, z: 0.42, color: '#f43f5e', h: 7 },
            { x: 0.15, z: 0.12, color: '#eab308', h: 6 }
        ]

        for (const c of coralSpots) {
            const baseY = -1.36
            for (let branch = 0; branch < 4; branch++) {
                const bx = c.x + (branch - 1.5) * vs * 1.2
                const bz = c.z + ((branch % 2) - 0.5) * vs * 1.2
                for (let i = 0; i < c.h; i++) {
                    addClamped(
                        bx + Math.sin(i + branch) * vs * 0.6,
                        baseY + i * vs,
                        bz + Math.cos(i + branch) * vs * 0.6,
                        c.color,
                        0.05
                    )
                }
            }
        }

        // Смарагдові водорості на морському дні
        const kelpPositions = [
            [-0.85, -0.65], [-0.72, -0.55], [0.55, 0.65], [0.68, 0.52], [-1.75, 0.48], [1.12, -0.55]
        ]
        for (const [kx, kz] of kelpPositions) {
            const baseY = -1.36
            for (let i = 0; i < 14; i++) {
                addClamped(
                    kx + Math.sin(i * 0.6) * vs * 0.5,
                    baseY + i * vs,
                    kz,
                    i % 2 === 0 ? '#10b981' : '#059669',
                    0.03
                )
            }
        }

        // 2. Базальтовий острів із Маяком (скеляста підводна гора від самого дна пляшки до вершини)
        const lhCenter = LANDMARK_COORDS.lighthouseIsland
        for (let wx = -3.0; wx <= -1.45; wx += vs) {
            const innerR = getBottleInnerRadius(wx)
            if (innerR <= 0.4) continue

            for (let wz = -1.42; wz <= 0.35; wz += vs) {
                const rSq = innerR * innerR - wz * wz
                if (rSq <= 0) continue
                const glassBottomY = -Math.sqrt(rSq)

                const cragNoise = Math.sin(wx * 8.5 + wz * 7.2) * 0.05
                const dist = Math.hypot((wx - lhCenter.x) * 1.02, (wz - lhCenter.z) * 1.1) - cragNoise

                if (dist < 0.92) {
                    const surfaceRadius = 0.72
                    // Плоске плато на вершині острова (dist <= 0.42), щоб маяк і будиночок стояли рівно на землі
                    let topY
                    if (dist <= 0.42) {
                        topY = 0.08
                    } else if (dist < surfaceRadius) {
                        const slopeT = (dist - 0.42) / (surfaceRadius - 0.42)
                        topY = 0.08 - Math.pow(slopeT, 1.4) * 0.40
                    } else {
                        topY = -0.32 - ((dist - surfaceRadius) / (0.92 - surfaceRadius)) * 1.05
                    }

                    for (let wy = glassBottomY; wy <= topY; wy += vs) {
                        const depthProgress = Math.max(0, (-0.32 - wy) / 1.1)
                        const allowedRadiusAtY = surfaceRadius + depthProgress * 0.22 + Math.sin(wy * 9 + wx * 6) * 0.035
                        if (dist > allowedRadiusAtY) continue

                        let col = '#334155'
                        if (wy >= topY - vs * 1.2 && wy > -0.14 && dist < 0.56) {
                            col = '#4d7c0f' // трава на вершині острова
                        } else if (wy > -0.34) {
                            col = '#64748b' // надводна базальтова скеля
                        } else if (wy > -0.65) {
                            col = '#475569' // мокрий береговий камінь біля ватерлінії
                        } else {
                            const isAlgae = vb.hash(Math.round(wx * 18), Math.round(wy * 18), Math.round(wz * 18)) > 0.78
                            col = isAlgae ? '#115e59' : '#1e293b'
                        }
                        addClamped(wx, wy, wz, col, 0.04)
                    }
                }
            }
        }

        // Вежа червоно-білого воксельного маяка (на лівому боці плато острова)
        const towerX = -2.42
        const towerZ = -0.62
        const towerBaseY = 0.06
        for (let level = 0; level <= 20; level++) {
            const wy = towerBaseY + level * vs
            const radiusVox = level < 16 ? 2.6 - (level / 20) * 0.9 : 2.1
            const stripeColor = Math.floor(level / 4) % 2 === 0 ? '#ef4444' : '#f8fafc'

            for (let dx = -3; dx <= 3; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const d = Math.hypot(dx, dz)
                    if (level <= 15 && d <= radiusVox) {
                        addClamped(towerX + dx * vs, wy, towerZ + dz * vs, stripeColor, 0.02)
                    } else if (level === 16 && d <= 2.6) {
                        addClamped(towerX + dx * vs, wy, towerZ + dz * vs, '#1e293b', 0.02)
                    } else if (level >= 17 && level <= 19 && d <= 1.6) {
                        addClamped(towerX + dx * vs, wy, towerZ + dz * vs, '#fef08a', 0.0)
                    } else if (level === 20 && d <= 2.0) {
                        addClamped(towerX + dx * vs, wy, towerZ + dz * vs, '#b91c1c', 0.02)
                    }
                }
            }
        }
        addClamped(towerX, towerBaseY + 21 * vs, towerZ, '#f59e0b', 0.0)
        addClamped(towerX, towerBaseY + 22 * vs, towerZ, '#f59e0b', 0.0)

        // Будиночок доглядача маяка (щільно стоїть на кам'яному фундаменті на плато поруч із маяком)
        const houseX = -2.06
        const houseZ = -0.52
        const houseBaseY = 0.06
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                // Кам'яний фундамент, що входить у плато острова
                for (let f = -2; f <= -1; f++) {
                    addClamped(houseX + dx * vs, houseBaseY + f * vs, houseZ + dz * vs, '#475569', 0.02)
                }
                // Стіни будиночка
                for (let dy = 0; dy <= 3; dy++) {
                    const wx = houseX + dx * vs
                    const wy = houseBaseY + dy * vs
                    const wz = houseZ + dz * vs
                    const isWindow = dy === 1 && (dx === 2 || dz === 2) && Math.abs(dx + dz) <= 2
                    addClamped(wx, wy, wz, isWindow ? '#fde047' : '#cbd5e1', 0.02)
                }
                // Черепичний дах
                if (Math.abs(dz) <= 2) {
                    addClamped(houseX + dx * vs, houseBaseY + 4 * vs, houseZ + dz * vs, '#ea580c', 0.03)
                }
                if (Math.abs(dz) <= 1) {
                    addClamped(houseX + dx * vs, houseBaseY + 5 * vs, houseZ + dz * vs, '#c2410c', 0.03)
                }
            }
        }

        // Дерев'яний пірс з палями
        for (let i = 0; i < 7; i++) {
            const px = -1.75 + i * vs
            const pz = -0.22 + i * vs * 0.5
            addClamped(px, -0.22, pz, '#78350f', 0.02)
            addClamped(px, -0.22, pz + vs, '#78350f', 0.02)
            if (i % 3 === 0) {
                for (let py = -0.55; py <= -0.16; py += vs) {
                    addClamped(px, py, pz, py > -0.2 ? '#f59e0b' : '#451a03', 0.02)
                }
            }
        }

        // 3. Тропічний кораловий атол зі скринею скарбів (стоїть на рифово-вапняковій підводній горі від самого дна)
        const islCenter = LANDMARK_COORDS.treasureIsland
        for (let wx = 0.95; wx <= 2.35; wx += vs) {
            const innerR = getBottleInnerRadius(wx)
            if (innerR <= 0.4) continue

            for (let wz = -0.08; wz <= 1.28; wz += vs) {
                const rSq = innerR * innerR - wz * wz
                if (rSq <= 0) continue
                const glassBottomY = -Math.sqrt(rSq)

                const reefNoise = Math.cos(wx * 9.0 - wz * 8.0) * 0.045
                const dist = Math.hypot((wx - islCenter.x) * 1.04, (wz - islCenter.z) * 1.08) - reefNoise

                if (dist < 0.78) {
                    const beachRadius = 0.58
                    // Рівний майданчик на вершині атолу (dist <= 0.32) для пальм та скрині скарбів
                    let topY
                    if (dist <= 0.32) {
                        topY = 0.08
                    } else if (dist < beachRadius) {
                        const slopeT = (dist - 0.32) / (beachRadius - 0.32)
                        topY = 0.08 - Math.pow(slopeT, 1.35) * 0.40
                    } else {
                        topY = -0.32 - ((dist - beachRadius) / (0.78 - beachRadius)) * 1.05
                    }

                    for (let wy = glassBottomY; wy <= topY; wy += vs) {
                        const depthProgress = Math.max(0, (-0.32 - wy) / 1.1)
                        const allowedRadiusAtY = beachRadius + depthProgress * 0.20 + Math.cos(wy * 10 + wz * 7) * 0.035
                        if (dist > allowedRadiusAtY) continue

                        let col = '#57534e'
                        if (wy >= topY - vs && wy > -0.12 && dist < 0.36) {
                            col = '#65a30d' // тропічна зелень на верхівці атолу
                        } else if (wy >= -0.36) {
                            col = '#fcd34d' // золотий піщаний пляж над водою
                        } else if (wy >= -0.58) {
                            col = '#d4a373' // підводний піщаний схил мілководдя
                        } else {
                            const hVal = vb.hash(Math.round(wx * 19), Math.round(wy * 19), Math.round(wz * 19))
                            col = hVal > 0.84 ? '#0d9488' : hVal > 0.72 ? '#78716c' : '#44403c'
                        }
                        addClamped(wx, wy, wz, col, 0.03)
                    }
                }
            }
        }

        const buildPalmTree = (baseX, baseY, baseZ, heightSteps, bendX, bendZ) => {
            let topX = baseX
            let topY = baseY
            let topZ = baseZ
            for (let i = 0; i <= heightSteps; i++) {
                const t = i / heightSteps
                topX = baseX + t * t * bendX
                topY = baseY + i * vs
                topZ = baseZ + t * t * bendZ
                addClamped(topX, topY, topZ, i % 2 === 0 ? '#78350f' : '#92400e', 0.03)
            }
            addClamped(topX + vs, topY - vs, topZ, '#451a03', 0.02)
            addClamped(topX - vs, topY - vs, topZ + vs, '#451a03', 0.02)

            for (let f = 0; f < 6; f++) {
                const angle = (f / 6) * Math.PI * 2 + 0.3
                for (let step = 1; step <= 6; step++) {
                    const fx = topX + Math.cos(angle) * step * vs
                    const fz = topZ + Math.sin(angle) * step * vs
                    const fy = topY + (step <= 2 ? vs * 0.6 : -(step - 2) * vs * 0.55)
                    addClamped(fx, fy, fz, step <= 3 ? '#22c55e' : '#15803d', 0.03)
                }
            }
        }

        // Дві пальми розташовані позаду/праворуч на атолі (не перетинаються зі скринею)
        buildPalmTree(1.82, 0.06, 0.66, 13, 0.16, -0.10)
        buildPalmTree(1.74, 0.06, 0.38, 10, 0.14, -0.14)

        // Скриня зі скарбами стоїть на відкритій передній галявині атолу (x = 1.48, z = 0.62)
        const cx = 1.48, cy = 0.08, cz = 0.62
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                addClamped(cx + dx * vs, cy - vs, cz + dz * vs, '#fcd34d', 0.02) // піщана основа під скринею
                addClamped(cx + dx * vs, cy, cz + dz * vs, '#7c2d12', 0.02)      // корпус скрині
                addClamped(cx + dx * vs, cy + vs, cz + dz * vs, '#facc15', 0.01) // золоті монети
            }
        }
        addClamped(cx, cy + vs, cz, '#ef4444', 0.0) // рубін у центрі скарбів

        // 4. Монолітна суцільна кам'яна морська арка (зміщена назад до задньої стінки і лівіше)
        const archCenter = LANDMARK_COORDS.seaArch
        const archRx = 0.36
        const archRy = 0.72
        const archRz = 0.16
        const numSteps = 80

        for (let step = 0; step <= numSteps; step++) {
            const angle = (step / numSteps) * Math.PI
            const ax = archCenter.x + Math.cos(angle) * archRx
            const ay = archCenter.y + Math.sin(angle) * archRy
            const az = archCenter.z - Math.cos(angle) * archRz

            // Щільний монолітний профіль арки без жодних розривів чи "літаючих" кубиків
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue

                        const wx = ax + dx * vs
                        const wy = ay + dy * vs
                        const wz = az + dz * vs
                        const isTop = ay + dy * vs > 0.16
                        const isMoss = isTop && dy >= 0
                        let col = '#475569'
                        if (isMoss) col = '#15803d'
                        else if (ay > -0.05) col = '#64748b'
                        else col = '#334155'

                        addClamped(wx, wy, wz, col, 0.03)
                    }
                }
            }
        }

        // Потужні суцільні кам'яні опори арки, що спускаються під воду до дна
        for (const endAngle of [0, Math.PI]) {
            const legX = archCenter.x + Math.cos(endAngle) * archRx
            const legZ = archCenter.z - Math.cos(endAngle) * archRz
            for (let wy = -1.45; wy <= archCenter.y + 0.08; wy += vs) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        if (dx * dx + dz * dz > 5) continue
                        const col = wy > -0.32 ? '#475569' : '#1e293b'
                        addClamped(legX + dx * vs, wy, legZ + dz * vs, col, 0.03)
                    }
                }
            }
        }

        // Надводна частина архіпелагу (острови, маяк, будиночок, пірс, пальми, скриня, морська арка):
        // відкидає та приймає м'які тіні на поверхню води та об'єкти
        this.landscapeMesh = vb.buildCulledMesh({}, (_v, _cx, cy) => cy > -0.38)
        this.landscapeMesh.castShadow = true
        this.landscapeMesh.receiveShadow = true
        this.group.add(this.landscapeMesh)

        // Підводна частина (піщане дно, корали, водорості та глибинний фундамент скель):
        // не рендериться в Shadow Map, що економить ~80% полігонів при розрахунку тіней
        this.seabedMesh = vb.buildCulledMesh({}, (_v, _cx, cy) => cy <= -0.38)
        this.seabedMesh.castShadow = false
        this.seabedMesh.receiveShadow = false
        this.group.add(this.seabedMesh)

        // Проксі-меші зон Маяка та Острова Скарбів для взаємодії через Raycaster
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
        // Змінюємо інтенсивність замість visible на джерелі світла, щоб Three.js не перекомпільовував шейдери сцени
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

                // Плавне згасання розміру монет перед зануренням або зникненням
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
