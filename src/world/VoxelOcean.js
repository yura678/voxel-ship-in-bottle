import * as THREE from 'three'
import { LANDMARK_COORDS, OCEAN_PALETTE } from '../config/sceneConfig.js'
import { applyOceanSurfaceShader, applyUnderwaterVolumeShader } from '../shaders/oceanShaders.js'
import { getBottleInnerRadius, getBottleInnerBaseX } from '../utils/bottleMath.js'

/**
 * Модуль Динамічного Воксельного Океану всередині пляшки.
 * Формує воксельну поверхню хвиль (InstancedMesh з вершинним шейдером хвиль та піни),
 * об'ємну напівпрозору підводну товщу (з раннім відсіканням discard у фрагментному шейдері)
 * та математично розраховує плавучість (buoyancy) корабля, Кракена і бочок.
 */
export class VoxelOcean {
    constructor(scene) {
        this.scene = scene
        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.voxelSize = 0.085
        this.surfaceBaseY = -0.34
        this.waveAmplitude = 1.0
        this.waveSpeed = 1.0
        this.isBioluminescent = false

        this.ripples = []

        this.colorMid = new THREE.Color(OCEAN_PALETTE.mid)
        this.colorShallow = new THREE.Color(OCEAN_PALETTE.shallow)
        this.colorTurquoise = new THREE.Color(OCEAN_PALETTE.turquoise)
        this.colorFoam = new THREE.Color(OCEAN_PALETTE.foam)
        this.colorBioFoam = new THREE.Color(OCEAN_PALETTE.bioFoam)
        this.colorAbyss = new THREE.Color('#063254')
        this.dummy = new THREE.Object3D()

        this.columns = []

        this.initShaderUniforms()
        this.buildOceanVoxels()
        this.buildUnderwaterVolume()
        this.buildRaycastProxy()
    }

    initShaderUniforms() {
        this.oceanUniforms = {
            uTime: { value: 0 },
            uWaveSpeed: { value: this.waveSpeed },
            uWaveAmplitude: { value: this.waveAmplitude },
            uSurfaceBaseY: { value: this.surfaceBaseY },
            uShipPos: { value: new THREE.Vector2(-0.25, 0) },
            uRipples: {
                value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -999, 0))
            },
            uNumRipples: { value: 0 },
            uColorMid: { value: this.colorMid },
            uColorShallow: { value: this.colorShallow },
            uColorTurquoise: { value: this.colorTurquoise },
            uColorFoam: { value: this.colorFoam },
            uColorBioFoam: { value: this.colorBioFoam },
            uAbyssColor: { value: this.colorAbyss },
            uIsBioluminescent: { value: 0.0 }
        }
    }

    getIslandProximity(x, z) {
        const { lighthouseIsland, treasureIsland, seaArch } = LANDMARK_COORDS
        const d1 = Math.hypot(x - lighthouseIsland.x, z - lighthouseIsland.z)
        const d2 = Math.hypot(x - treasureIsland.x, z - treasureIsland.z)
        const d3 = Math.hypot(x - seaArch.x, z - seaArch.z)
        return Math.min(d1, d2, d3)
    }

    buildOceanVoxels() {
        const vs = this.voxelSize
        const half = vs * 0.5
        const minX = -3.30
        // Вода простягається вздовж усієї колби до самої межі горлечка пляшки (maxX = 3.55)
        const maxX = 3.55
        const { lighthouseIsland, treasureIsland } = LANDMARK_COORDS
        const tol = 0.015

        // Гарантує, що вокселі водної гладі щільно вкривають поверхню до внутрішнього скла колби без щілин і без виходу за скло
        const isOceanVoxelInside = (cx, cz) => {
            const maxCz = Math.abs(cz) + half
            for (const xCorner of [cx - half, cx + half]) {
                const innerR = getBottleInnerRadius(xCorner)
                if (innerR <= 0.45) return false
                if (innerR * innerR <= this.surfaceBaseY * this.surfaceBaseY) return false
                const maxZ = Math.sqrt(innerR * innerR - this.surfaceBaseY * this.surfaceBaseY)
                // Допуск для безшовного змикання переднього краю біля купола денця
                const cornerTol = (xCorner >= -3.28 && xCorner <= -3.05) ? 0.045 : tol
                if (maxCz > maxZ + cornerTol) return false
                if (xCorner < -3.22) {
                    const cr = Math.hypot(this.surfaceBaseY, maxCz)
                    if (xCorner < getBottleInnerBaseX(cr) - 0.02) return false
                }
            }
            return true
        }

        for (let x = minX; x <= maxX; x += vs) {
            const innerR = getBottleInnerRadius(x)
            if (innerR <= 0.45) continue

            // Максимальна півширина водної поверхні на рівні води y = surfaceBaseY
            const maxZAtWaterline = Math.sqrt(Math.max(0, innerR * innerR - this.surfaceBaseY * this.surfaceBaseY))
            const stepsZ = Math.ceil((maxZAtWaterline + tol) / vs)

            for (let zi = -stepsZ; zi <= stepsZ; zi++) {
                const z = zi * vs
                if (!isOceanVoxelInside(x, z)) continue

                // Пропускаємо стовпчики води, які на 100% замуровані всередині суцільного каменю обох островів
                const lhDist = Math.hypot((x - lighthouseIsland.x) * 1.02, (z - lighthouseIsland.z) * 1.1)
                const islDist = Math.hypot((x - treasureIsland.x) * 1.04, (z - treasureIsland.z) * 1.08)
                if (lhDist < 0.46 || islDist < 0.36) continue

                const islandDist = this.getIslandProximity(x, z)

                // Коефіцієнт плавного згасання амплітуди хвиль біля самого скла пляшки
                const radialRatio = Math.min(1, Math.abs(z) / Math.max(0.1, maxZAtWaterline))
                const edgeDamping = 0.25 + 0.75 * (1 - radialRatio * radialRatio)

                this.columns.push({
                    x,
                    z,
                    islandDist,
                    edgeDamping
                })
            }
        }

        // Оптимізована висота вокселів хвильової поверхні (vs * 0.76):
        // зменшує площу бічних граней та Overdraw, але гарантує перекриття сусідніх стовпчиків навіть при max амплітуді 2.6
        const surfGeo = new THREE.BoxGeometry(vs * 1.002, vs * 0.76, vs * 1.002)
        surfGeo.translate(0, -vs * 0.36, 0)
        surfGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0.15, this.surfaceBaseY, 0), 3.8)

        // Компактний інстансний атрибут vec2:
        // x: edgeDamping (згасання біля скла), y: islandDist (відстань до берега)
        const oceanParams = new Float32Array(this.columns.length * 2)
        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i]
            oceanParams[i * 2] = col.edgeDamping
            oceanParams[i * 2 + 1] = col.islandDist
        }
        surfGeo.setAttribute('aOceanParams', new THREE.InstancedBufferAttribute(oceanParams, 2))

        this.surfaceMaterial = new THREE.MeshLambertMaterial({
            color: '#ffffff',
            transparent: false
        })
        this.surfaceMaterial.defines = { USE_COLOR: '' }
        applyOceanSurfaceShader(this.surfaceMaterial, this.oceanUniforms)

        this.surfaceMesh = new THREE.InstancedMesh(
            surfGeo,
            this.surfaceMaterial,
            this.columns.length
        )
        this.surfaceMesh.receiveShadow = true
        this.surfaceMesh.castShadow = false
        this.surfaceMesh.frustumCulled = true

        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i]
            this.dummy.position.set(col.x, this.surfaceBaseY, col.z)
            this.dummy.scale.set(1, 1, 1)
            this.dummy.updateMatrix()
            this.surfaceMesh.setMatrixAt(i, this.dummy.matrix)
        }
        this.surfaceMesh.instanceMatrix.needsUpdate = true
        this.group.add(this.surfaceMesh)
    }

    /**
     * Формує монолітну напівпрозору товщу води в нижній половині пляшки (нижче ватерлінії y = -0.34).
     * Забезпечує реалістичне океанічне забарвлення, розсіювання світла та глибинну перспективу для коралів і дна.
     */
    buildUnderwaterVolume() {
        const vsX = 0.10
        const xMin = -3.36, xMax = 3.55
        // Базова ватерлінія циліндричної частини підводної товщі (y = -0.365)
        // та вертикальний запас вгору (crestTopY) для заповнення гребенів високих хвиль (до амплітуди 2.6),
        // який точно підрізається фрагментним шейдером по контуру хвилі без розширення по осі Z
        const waterY = this.surfaceBaseY - 0.025
        const xSteps = Math.ceil((xMax - xMin) / vsX)
        const radSteps = 32
        const profileSteps = radSteps + 2

        const positions = []
        const indices = []

        for (let xi = 0; xi <= xSteps; xi++) {
            const x = xMin + (xi / xSteps) * (xMax - xMin)
            const r = Math.max(0.4, getBottleInnerRadius(x) - 0.012)
            const clampedWaterY = Math.max(-r + 0.05, Math.min(r - 0.05, waterY))
            const alpha = Math.asin(Math.abs(clampedWaterY) / r)
            const a0 = Math.PI + alpha
            const a1 = 2 * Math.PI - alpha
            const zEdge = Math.cos(alpha) * r
            const crestTopY = Math.min(r - 0.04, this.surfaceBaseY + 0.38)

            // Лівий верхній край гребеня хвилі (вертикально над ватерлінією -zEdge)
            positions.push(x, crestTopY, -zEdge)

            for (let ri = 0; ri <= radSteps; ri++) {
                const t = ri / radSteps
                const angle = a0 + t * (a1 - a0)
                const z = Math.cos(angle) * r
                const y = Math.sin(angle) * r
                positions.push(x, y, z)
            }

            // Правий верхній край гребеня хвилі (вертикально над ватерлінією +zEdge)
            positions.push(x, crestTopY, zEdge)
        }

        const stride = profileSteps + 1
        for (let xi = 0; xi < xSteps; xi++) {
            for (let pi = 0; pi < profileSteps; pi++) {
                const i0 = xi * stride + pi
                const i1 = i0 + 1
                const i2 = (xi + 1) * stride + pi
                const i3 = i2 + 1
                indices.push(i0, i1, i2)
                indices.push(i1, i3, i2)
            }
        }

        // Торцеві кришки (End Caps): повністю закривають об'єм води з лівого (дно пляшки) та правого (перед горлечком) боків,
        // гарантуючи ідентичний насичений океанічний відтінок при огляді з будь-якого ракурсу камери!
        // 1. Ліва торцева кришка при xi = 0 (x = xMin)
        const leftCenterIdx = positions.length / 3
        const leftR = Math.max(0.4, getBottleInnerRadius(xMin) - 0.012)
        const leftWaterY = Math.max(-leftR + 0.05, Math.min(leftR - 0.05, waterY))
        positions.push(xMin, (leftWaterY - leftR) * 0.5, 0)
        for (let pi = 0; pi < profileSteps; pi++) {
            indices.push(leftCenterIdx, pi, pi + 1)
        }
        indices.push(leftCenterIdx, profileSteps, 0)

        // 2. Права торцева кришка при xi = xSteps (x = xMax)
        const rightCenterIdx = positions.length / 3
        const rightR = Math.max(0.4, getBottleInnerRadius(xMax) - 0.012)
        const rightWaterY = Math.max(-rightR + 0.05, Math.min(rightR - 0.05, waterY))
        positions.push(xMax, (rightWaterY - rightR) * 0.5, 0)
        const rightOffset = xSteps * stride
        for (let pi = 0; pi < profileSteps; pi++) {
            indices.push(rightCenterIdx, rightOffset + pi + 1, rightOffset + pi)
        }
        indices.push(rightCenterIdx, rightOffset, rightOffset + profileSteps)

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geo.setIndex(indices)
        geo.computeVertexNormals()

        this.underwaterMaterial = new THREE.MeshBasicMaterial({
            color: '#0284c7',
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        applyUnderwaterVolumeShader(this.underwaterMaterial, this.oceanUniforms)

        this.underwaterMesh = new THREE.Mesh(geo, this.underwaterMaterial)
        this.underwaterMesh.renderOrder = 3
        this.underwaterMesh.receiveShadow = false
        this.underwaterMesh.castShadow = false
        this.group.add(this.underwaterMesh)
    }

    /**
     * Застосовує параметри хвиль та кольорову палітру води (поверхня + підводна товща) для обраного режиму погоди
     */
    setWeatherPreset(preset) {
        this.waveAmplitude = preset.waveAmplitude
        this.waveSpeed = preset.waveSpeed
        this.isBioluminescent = preset.isBioluminescent

        if (preset.oceanMid) this.colorMid.set(preset.oceanMid)
        if (preset.oceanShallow) this.colorShallow.set(preset.oceanShallow)
        if (preset.oceanTurquoise) this.colorTurquoise.set(preset.oceanTurquoise)
        if (preset.underwaterColor && this.underwaterMaterial) {
            this.underwaterMaterial.color.set(preset.underwaterColor)
        }
        if (preset.underwaterAbyssColor) {
            this.colorAbyss.set(preset.underwaterAbyssColor)
        }
    }

    /**
     * Площина-проксі поверхні океану для визначення точки кліку через Raycaster
     */
    buildRaycastProxy() {
        const proxyGeo = new THREE.PlaneGeometry(7.0, 4.2)
        proxyGeo.rotateX(-Math.PI * 0.5)
        const proxyMat = new THREE.MeshBasicMaterial({ visible: false })
        this.raycastProxy = new THREE.Mesh(proxyGeo, proxyMat)
        this.raycastProxy.position.set(0.12, this.surfaceBaseY, 0)
        this.raycastProxy.userData = { interactiveType: 'voxel_ocean' }
        this.group.add(this.raycastProxy)
    }

    addRipple(x, z, currentTime, strength = 0.065) {
        this.ripples.push({
            x,
            z,
            startTime: currentTime,
            strength
        })
        if (this.ripples.length > 6) {
            this.ripples.shift()
        }
    }

    getWaveHeight(x, z, time) {
        const t = time * this.waveSpeed * 1.75
        const amp = 0.062 * this.waveAmplitude

        const w1 = Math.sin(x * 2.2 + t) * amp
        const w2 = Math.cos(z * 2.6 - t * 0.85 + x * 0.7) * (amp * 0.6)
        const w3 = Math.sin((x * 1.5 - z * 1.7) * 2.1 + t * 1.3) * (amp * 0.35)

        let rippleSum = 0
        for (let i = 0; i < this.ripples.length; i++) {
            const r = this.ripples[i]
            const age = time - r.startTime
            if (age <= 0 || age > 1.4) {
                continue
            }
            const dist = Math.hypot(x - r.x, z - r.z)
            if (dist < 1.35) {
                const waveFront = dist - age * 1.75
                if (Math.abs(waveFront) < 0.65) {
                    const decay = Math.exp(-age * 2.2 - dist * 1.2)
                    const rangeLimit = dist >= 1.35 ? 0 : (dist <= 0.85 ? 1 : (1.35 - dist) / 0.5)
                    rippleSum += Math.cos(waveFront * 11.5) * r.strength * decay * rangeLimit
                }
            }
        }

        return this.surfaceBaseY + w1 + w2 + w3 + rippleSum
    }

    getBuoyancyTransform(x, z, time, sampleOffset = 0.35) {
        const hCenter = this.getWaveHeight(x, z, time)
        const hFront = this.getWaveHeight(x + sampleOffset, z, time)
        const hBack = this.getWaveHeight(x - sampleOffset, z, time)
        const hLeft = this.getWaveHeight(x, z - sampleOffset, time)
        const hRight = this.getWaveHeight(x, z + sampleOffset, time)

        const pitch = Math.atan2(hFront - hBack, sampleOffset * 2)
        const roll = Math.atan2(hLeft - hRight, sampleOffset * 2)

        return {
            height: (hCenter + (hFront + hBack + hLeft + hRight) * 0.25) * 0.5,
            pitch,
            roll
        }
    }

    /**
     * Оновлення уніформ океану (час, хвилі, сплески, корабель).
     * Усі розрахунки зміщення вершин та піни виконуються паралельно на GPU у вершинному шейдері.
     */
    update(elapsedTime, shipPos = { x: -0.25, z: 0 }) {
        if (!this.oceanUniforms) return

        this.oceanUniforms.uTime.value = elapsedTime
        this.oceanUniforms.uShipPos.value.set(shipPos.x, shipPos.z)
        this.oceanUniforms.uWaveSpeed.value = this.waveSpeed
        this.oceanUniforms.uWaveAmplitude.value = this.waveAmplitude
        this.oceanUniforms.uIsBioluminescent.value = this.isBioluminescent ? 1.0 : 0.0

        // Очищення застарілих кіл хвиль (ripples)
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            if (elapsedTime - this.ripples[i].startTime > 1.4) {
                this.ripples.splice(i, 1)
            }
        }

        // Передача сплесків в уніформи шейдера
        this.oceanUniforms.uNumRipples.value = this.ripples.length
        for (let i = 0; i < 6; i++) {
            if (i < this.ripples.length) {
                const r = this.ripples[i]
                this.oceanUniforms.uRipples.value[i].set(r.x, r.z, r.startTime, r.strength)
            } else {
                this.oceanUniforms.uRipples.value[i].set(0, 0, -999, 0)
            }
        }
    }
}
