import * as THREE from 'three'
import { getBottleInnerRadius } from '../utils/bottleMath.js'

/**
 * Модуль Системи Частинок всередині скляної пляшки.
 * Усі частинки (морські бризки, світлячки, штормовий дощ та воксельні сплески води)
 * математично обмежені внутрішнім об'ємом пляшки getBottleInnerRadius(x).
 */
export class ParticleManager {
    constructor(scene, textureLoader) {
        this.scene = scene
        this.textureLoader = textureLoader

        this.particleTexture = this.textureLoader.load('/textures/particles/2.png')
        this.count = 120
        this.mode = 'day'

        // Оптимізований пул воксельних кубиків сплесків на єдиному THREE.InstancedMesh (1 Draw Call замість 48)
        this.maxSplashCubes = 72
        this.splashPoolIdx = 0
        this.splashData = []
        this.splashDummy = new THREE.Object3D()
        this.hasActiveSplashes = false

        this.splashGeo = new THREE.BoxGeometry(0.042, 0.042, 0.042)
        this.splashMat = new THREE.MeshLambertMaterial({
            color: '#48cae4'
        })
        this.splashMesh = new THREE.InstancedMesh(this.splashGeo, this.splashMat, this.maxSplashCubes)
        this.splashMesh.frustumCulled = false
        this.splashMesh.castShadow = false
        this.splashMesh.receiveShadow = false

        this.splashDummy.position.set(0, -999, 0)
        this.splashDummy.scale.set(0, 0, 0)
        this.splashDummy.updateMatrix()
        for (let i = 0; i < this.maxSplashCubes; i++) {
            this.splashMesh.setMatrixAt(i, this.splashDummy.matrix)
            this.splashData.push({
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
                rotSpeedZ: 0,
                born: 0,
                life: 1.1
            })
        }
        this.splashMesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.splashMesh)

        this.buildEncapsulatedParticles()
        this.buildUnderwaterBubbles()
    }

    buildUnderwaterBubbles() {
        this.bubbleCount = 30
        this.bubbleGeo = new THREE.BufferGeometry()
        const positions = new Float32Array(this.bubbleCount * 3)
        const colors = new Float32Array(this.bubbleCount * 3)
        this.bubbleData = []

        const baseColor = new THREE.Color('#7dd3fc')

        for (let i = 0; i < this.bubbleCount; i++) {
            const i3 = i * 3
            const x = -2.7 + Math.random() * 5.2
            const maxR = Math.max(0.35, getBottleInnerRadius(x) - 0.18)
            const y = -1.35 + Math.random() * 0.95
            const maxZ = Math.sqrt(Math.max(0.01, maxR * maxR - y * y)) * 0.85
            const z = (Math.random() - 0.5) * 2 * maxZ

            positions[i3] = x
            positions[i3 + 1] = y
            positions[i3 + 2] = z

            this.bubbleData.push({
                baseX: x,
                baseZ: z,
                speed: 0.16 + Math.random() * 0.24,
                swaySpeed: 1.5 + Math.random() * 2.0,
                swayAmp: 0.025 + Math.random() * 0.035,
                phase: Math.random() * Math.PI * 2
            })

            colors[i3] = baseColor.r
            colors[i3 + 1] = baseColor.g
            colors[i3 + 2] = baseColor.b
        }

        this.bubbleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.bubbleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

        this.bubbleMaterial = new THREE.PointsMaterial({
            size: 0.055,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.72,
            alphaMap: this.particleTexture,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        })

        this.bubblePoints = new THREE.Points(this.bubbleGeo, this.bubbleMaterial)
        this.bubblePoints.renderOrder = 4
        this.scene.add(this.bubblePoints)
    }

    buildEncapsulatedParticles() {
        this.geometry = new THREE.BufferGeometry()
        const positions = new Float32Array(this.count * 3)
        const colors = new Float32Array(this.count * 3)
        this.particleData = []

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3
            const x = -2.95 + Math.random() * 5.85
            const maxR = Math.max(0.3, getBottleInnerRadius(x) - 0.22)
            const angle = Math.random() * Math.PI * 2
            const r = Math.sqrt(Math.random()) * maxR
            const y = -0.25 + Math.abs(Math.sin(angle) * r) * 0.85
            const z = Math.cos(angle) * r * 0.85

            positions[i3] = x
            positions[i3 + 1] = y
            positions[i3 + 2] = z

            this.particleData.push({
                baseX: x,
                baseY: y,
                baseZ: z,
                maxR,
                speed: 0.4 + Math.random() * 0.8,
                phase: Math.random() * Math.PI * 2
            })

            colors[i3] = 0.85
            colors[i3 + 1] = 0.96
            colors[i3 + 2] = 1.0
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

        this.material = new THREE.PointsMaterial({
            size: 0.065,
            sizeAttenuation: true,
            transparent: true,
            alphaMap: this.particleTexture,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        })

        this.points = new THREE.Points(this.geometry, this.material)
        this.scene.add(this.points)
    }

    setWeatherMode(mode) {
        this.mode = mode
        const colorAttr = this.geometry.attributes.color
        const arr = colorAttr.array

        const c1 = new THREE.Color()
        const c2 = new THREE.Color()

        if (mode === 'day') {
            c1.set('#e0f2fe')
            c2.set('#fef08a')
            this.material.size = 0.07
            this.splashMat.color.set('#48cae4')
            this.splashMat.emissive.set('#000000')
            this.splashMat.emissiveIntensity = 0.0
        } else if (mode === 'sunset') {
            c1.set('#fde047')
            c2.set('#fb923c')
            this.material.size = 0.08
            this.splashMat.color.set('#388697')
            this.splashMat.emissive.set('#000000')
            this.splashMat.emissiveIntensity = 0.0
        } else if (mode === 'night') {
            c1.set('#00f5d4')
            c2.set('#38bdf8')
            this.material.size = 0.095
            this.splashMat.color.set('#155e75')
            this.splashMat.emissive.set('#00f5d4')
            this.splashMat.emissiveIntensity = 0.25
        } else if (mode === 'storm') {
            c1.set('#bae6fd')
            c2.set('#94a3b8')
            this.material.size = 0.085
            this.splashMat.color.set('#274e6b')
            this.splashMat.emissive.set('#000000')
            this.splashMat.emissiveIntensity = 0.0
        }

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3
            const mixed = c1.clone().lerp(c2, (i % 7) / 6)
            arr[i3] = mixed.r
            arr[i3 + 1] = mixed.g
            arr[i3 + 2] = mixed.b
        }
        colorAttr.needsUpdate = true

        if (this.bubbleGeo) {
            const bArr = this.bubbleGeo.attributes.color.array
            const bCol = new THREE.Color()
            if (mode === 'night') bCol.set('#2dd4bf')
            else if (mode === 'storm') bCol.set('#38bdf8')
            else if (mode === 'sunset') bCol.set('#5eead4')
            else bCol.set('#7dd3fc')

            for (let i = 0; i < this.bubbleCount; i++) {
                const i3 = i * 3
                bArr[i3] = bCol.r
                bArr[i3 + 1] = bCol.g
                bArr[i3 + 2] = bCol.b
            }
            this.bubbleGeo.attributes.color.needsUpdate = true
        }
    }

    spawnWaterSplash(pos, currentTime) {
        const countToSpawn = 12
        for (let s = 0; s < countToSpawn; s++) {
            const idx = this.splashPoolIdx
            this.splashPoolIdx = (this.splashPoolIdx + 1) % this.maxSplashCubes
            const p = this.splashData[idx]

            p.active = true
            p.x = pos.x + (Math.random() - 0.5) * 0.08
            p.y = pos.y + 0.04
            p.z = pos.z + (Math.random() - 0.5) * 0.08
            p.vx = (Math.random() - 0.5) * 1.15
            p.vy = 0.85 + Math.random() * 0.75
            p.vz = (Math.random() - 0.5) * 1.15
            p.rotX = Math.random() * Math.PI * 2
            p.rotY = Math.random() * Math.PI * 2
            p.rotZ = Math.random() * Math.PI * 2
            p.rotSpeedX = (Math.random() - 0.5) * 14
            p.rotSpeedZ = (Math.random() - 0.5) * 14
            p.born = currentTime
            p.life = 0.85 + Math.random() * 0.35
        }
        this.hasActiveSplashes = true
    }

    update(elapsedTime, deltaTime) {
        const posArr = this.geometry.attributes.position.array

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3
            const d = this.particleData[i]

            if (this.mode === 'storm') {
                const rainCycle = (elapsedTime * 2.2 * d.speed + d.phase) % 1.6
                const x = d.baseX - rainCycle * 0.25
                const y = 1.25 - rainCycle
                const z = d.baseZ
                const rLimit = getBottleInnerRadius(x) - 0.16
                if (y * y + z * z <= rLimit * rLimit && y > -0.32) {
                    posArr[i3] = x
                    posArr[i3 + 1] = y
                    posArr[i3 + 2] = z
                } else {
                    posArr[i3] = d.baseX
                    posArr[i3 + 1] = 0.2 + Math.abs(d.baseY) * 0.5
                    posArr[i3 + 2] = d.baseZ
                }
            } else {
                const x = d.baseX + Math.sin(elapsedTime * 0.5 * d.speed + d.phase) * 0.14
                const y = -0.22 + ((d.baseY + elapsedTime * 0.12 * d.speed) % 1.35)
                const z = d.baseZ + Math.cos(elapsedTime * 0.6 * d.speed + d.phase) * 0.12

                const rLimit = getBottleInnerRadius(x) - 0.16
                const distYZ = Math.hypot(y, z)
                if (distYZ > rLimit && distYZ > 0.001) {
                    const scale = (rLimit * 0.92) / distYZ
                    posArr[i3] = x
                    posArr[i3 + 1] = y * scale
                    posArr[i3 + 2] = z * scale
                } else {
                    posArr[i3] = x
                    posArr[i3 + 1] = y
                    posArr[i3 + 2] = z
                }
            }
        }

        this.geometry.attributes.position.needsUpdate = true

        if (this.bubbleGeo) {
            const bPos = this.bubbleGeo.attributes.position.array
            for (let i = 0; i < this.bubbleCount; i++) {
                const i3 = i * 3
                const d = this.bubbleData[i]

                let y = bPos[i3 + 1] + d.speed * deltaTime
                let x = d.baseX + Math.sin(elapsedTime * d.swaySpeed + d.phase) * d.swayAmp
                let z = d.baseZ + Math.cos(elapsedTime * (d.swaySpeed * 0.8) + d.phase) * d.swayAmp

                const maxR = Math.max(0.35, getBottleInnerRadius(x) - 0.18)

                if (y >= -0.35 || (y * y + z * z) > maxR * maxR) {
                    y = -1.35 + Math.random() * 0.25
                    const safeMaxZ = Math.sqrt(Math.max(0.01, maxR * maxR - y * y)) * 0.85
                    d.baseX = -2.7 + Math.random() * 5.2
                    d.baseZ = (Math.random() - 0.5) * 2 * safeMaxZ
                    x = d.baseX
                    z = d.baseZ
                }

                bPos[i3] = x
                bPos[i3 + 1] = y
                bPos[i3 + 2] = z
            }
            this.bubbleGeo.attributes.position.needsUpdate = true
        }

        if (this.hasActiveSplashes) {
            let stillActive = false
            for (let i = 0; i < this.maxSplashCubes; i++) {
                const p = this.splashData[i]
                if (!p.active) continue

                const age = elapsedTime - p.born
                if (age >= p.life || p.y < -0.42) {
                    p.active = false
                    this.splashDummy.position.set(0, -999, 0)
                    this.splashDummy.scale.set(0, 0, 0)
                    this.splashDummy.updateMatrix()
                    this.splashMesh.setMatrixAt(i, this.splashDummy.matrix)
                    continue
                }

                stillActive = true
                p.vy -= 3.8 * deltaTime
                p.x += p.vx * deltaTime
                p.y += p.vy * deltaTime
                p.z += p.vz * deltaTime
                p.rotX += p.rotSpeedX * deltaTime
                p.rotZ += p.rotSpeedZ * deltaTime

                // Плавне згасання розміру кубика (scale shrink) перед зануренням у воду
                const progress = age / p.life
                const scale = Math.max(0.001, 1.0 - progress * progress)

                this.splashDummy.position.set(p.x, p.y, p.z)
                this.splashDummy.rotation.set(p.rotX, p.rotY, p.rotZ)
                this.splashDummy.scale.set(scale, scale, scale)
                this.splashDummy.updateMatrix()
                this.splashMesh.setMatrixAt(i, this.splashDummy.matrix)
            }
            this.splashMesh.instanceMatrix.needsUpdate = true
            this.hasActiveSplashes = stillActive
        }
    }
}
