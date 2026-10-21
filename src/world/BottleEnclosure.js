import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import gsap from 'gsap'
import { VoxelBuilder } from '../utils/VoxelBuilder.js'

/**
 * Модуль Скляної Пляшки, Корка та Дерев'яної Підставки.
 * Створює горизонтальну двостінну скляну пляшку (LatheGeometry + фізичний матеріал скла MeshPhysicalMaterial),
 * воксельний корок із сургучевою печаткою та дерев'яний постамент із гравірованою табличкою.
 */
export class BottleEnclosure {
    constructor(scene, textureLoader) {
        this.scene = scene
        this.textureLoader = textureLoader

        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.interactiveMeshes = []
        this.isCorkPopped = false

        this.loadTextures()
        this.buildGlassBottle()
        this.buildVoxelCork()
        this.buildWoodenStandAndTable()
        this.buildBrassNameplate()
    }

    loadTextures() {
        this.woodColor = this.textureLoader.load('/textures/wood_cabinet_worn_long/wood_cabinet_worn_long_diff_1k.jpg')
        this.woodNormal = this.textureLoader.load('/textures/wood_cabinet_worn_long/wood_cabinet_worn_long_nor_gl_1k.png')
        this.woodARM = this.textureLoader.load('/textures/wood_cabinet_worn_long/wood_cabinet_worn_long_arm_1k.jpg')
        this.woodColor.colorSpace = THREE.SRGBColorSpace

        for (const tex of [this.woodColor, this.woodNormal, this.woodARM]) {
            tex.repeat.set(3, 3)
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
        }

        this.metalNormal = this.textureLoader.load('/resources/iron/Metal053C_1K-JPG_NormalGL.webp')
        this.metalRoughness = this.textureLoader.load('/resources/iron/Metal053C_1K-JPG_Roughness.webp')
    }

    buildGlassBottle() {
        const outerBaseCurve = new THREE.SplineCurve([
            new THREE.Vector2(0.0, -3.45),
            new THREE.Vector2(1.4, -3.52),
            new THREE.Vector2(1.98, -3.46),
            new THREE.Vector2(2.18, -3.28),
            new THREE.Vector2(2.22, -3.05)
        ])
        const outerShoulderCurve = new THREE.SplineCurve([
            new THREE.Vector2(2.22, 2.32),
            new THREE.Vector2(2.14, 2.62),
            new THREE.Vector2(1.82, 2.95),
            new THREE.Vector2(1.25, 3.28),
            new THREE.Vector2(0.84, 3.55),
            new THREE.Vector2(0.78, 3.75)
        ])
        const innerShoulderCurve = new THREE.SplineCurve([
            new THREE.Vector2(0.67, 3.58),
            new THREE.Vector2(1.12, 3.24),
            new THREE.Vector2(1.7, 2.88),
            new THREE.Vector2(2.08, 2.52),
            new THREE.Vector2(2.11, 2.28)
        ])
        const innerBaseCurve = new THREE.SplineCurve([
            new THREE.Vector2(2.11, -3.08),
            new THREE.Vector2(1.92, -3.32),
            new THREE.Vector2(1.2, -3.38),
            new THREE.Vector2(0.0, -3.32)
        ])

        const profilePoints = [
            ...outerBaseCurve.getPoints(16),
            new THREE.Vector2(2.22, 2.32),
            ...outerShoulderCurve.getPoints(24).slice(1),
            new THREE.Vector2(0.78, 4.35),
            new THREE.Vector2(0.89, 4.4),
            new THREE.Vector2(0.89, 4.54),
            new THREE.Vector2(0.76, 4.58),
            new THREE.Vector2(0.67, 4.55),
            new THREE.Vector2(0.67, 3.58),
            ...innerShoulderCurve.getPoints(20).slice(1),
            new THREE.Vector2(2.11, -3.08),
            ...innerBaseCurve.getPoints(16).slice(1)
        ]

        const latheGeo = new THREE.LatheGeometry(profilePoints, 44)
        latheGeo.rotateZ(-Math.PI * 0.5)
        latheGeo.computeVertexNormals()

        // Фізичний матеріал скла (MeshPhysicalMaterial з коефіцієнтом заломлення IOR = 1.52 та чистими PBR-відблисками PMREM)
        this.glassMaterial = new THREE.MeshPhysicalMaterial({
            color: '#e0f7ff',
            transparent: true,
            opacity: 0.16,
            roughness: 0.05,
            metalness: 0.05,
            ior: 1.52,
            reflectivity: 0.95,
            envMapIntensity: 1.5,
            side: THREE.FrontSide,
            depthWrite: false
        })

        this.bottleMesh = new THREE.Mesh(latheGeo, this.glassMaterial)
        this.bottleMesh.renderOrder = 10
        this.bottleMesh.castShadow = false
        this.group.add(this.bottleMesh)
    }

    buildVoxelCork() {
        this.corkGroup = new THREE.Group()
        this.corkGroup.position.set(4.35, 0, 0)
        this.group.add(this.corkGroup)

        const vb = new VoxelBuilder(0.065, 1.0)

        for (let gx = -6; gx <= 4; gx++) {
            const r = gx < 0 ? 8.8 : 9.4
            for (let gy = -10; gy <= 10; gy++) {
                for (let gz = -10; gz <= 10; gz++) {
                    if (gy * gy + gz * gz <= r * r) {
                        const isDarkSpeck = vb.hash(gx, gy, gz) > 0.78
                        vb.add(gx, gy, gz, isDarkSpeck ? '#9c6b3b' : '#c8965a', 0.04)
                    }
                }
            }
        }

        for (let gx = 5; gx <= 9; gx++) {
            const r = gx <= 7 ? 11.2 : 10.2
            for (let gy = -12; gy <= 12; gy++) {
                for (let gz = -12; gz <= 12; gz++) {
                    const distSq = gy * gy + gz * gz
                    if (distSq <= r * r) {
                        const isWax = gx >= 7 || distSq >= (r - 1.6) * (r - 1.6)
                        vb.add(gx, gy, gz, isWax ? '#b91c1c' : '#b8834a', 0.03)
                    }
                }
            }
        }

        for (let gy = -5; gy <= 5; gy++) {
            for (let gz = -5; gz <= 5; gz++) {
                const d = Math.sqrt(gy * gy + gz * gz)
                if (d >= 2.8 && d <= 5.0) {
                    vb.add(10, gy, gz, '#f59e0b', 0.02)
                }
            }
        }

        this.corkMesh = vb.buildCulledMesh()
        this.corkMesh.castShadow = false
        this.corkMesh.receiveShadow = false
        this.corkGroup.add(this.corkMesh)

        // Проксі-меш корка для обробки наведення та кліків через Raycaster
        const corkProxyGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.15, 12)
        corkProxyGeo.rotateZ(Math.PI * 0.5)
        const corkHitProxy = new THREE.Mesh(
            corkProxyGeo,
            new THREE.MeshBasicMaterial({ visible: false })
        )
        corkHitProxy.position.set(0.12, 0, 0)
        corkHitProxy.userData = { interactiveType: 'bottle_cork' }
        this.interactiveMeshes.push(corkHitProxy)
        this.corkGroup.add(corkHitProxy)
    }

    popCork() {
        this.isCorkPopped = !this.isCorkPopped
        const targetX = this.isCorkPopped ? 4.88 : 4.35
        gsap.to(this.corkGroup.position, {
            x: targetX,
            y: 0,
            duration: 0.55,
            ease: 'back.out(2)'
        })
        gsap.fromTo(
            this.corkGroup.rotation,
            { x: 0, y: 0, z: 0 },
            { x: this.isCorkPopped ? Math.PI * 0.5 : 0, y: 0, z: 0, duration: 0.55, ease: 'power2.out' }
        )
    }

    buildWoodenStandAndTable() {
        const woodMat = new THREE.MeshStandardMaterial({
            color: '#5c3a21',
            map: this.woodColor,
            normalMap: this.woodNormal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            aoMap: this.woodARM,
            roughnessMap: this.woodARM,
            roughness: 0.75,
            metalness: 0.0,
            envMapIntensity: 0.35
        })

        const darkWoodMat = new THREE.MeshStandardMaterial({
            color: '#4e301d',
            map: this.woodColor,
            normalMap: this.woodNormal,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughness: 0.92,
            metalness: 0.0,
            envMapIntensity: 0.12
        })

        this.brassMaterial = new THREE.MeshStandardMaterial({
            color: '#eab308',
            normalMap: this.metalNormal,
            roughnessMap: this.metalRoughness,
            metalness: 0.88,
            roughness: 0.24
        })

        const tableTop = new THREE.Mesh(
            new THREE.CylinderGeometry(7.5, 7.8, 0.35, 36),
            darkWoodMat
        )
        tableTop.position.y = -3.05
        tableTop.receiveShadow = false
        this.group.add(tableTop)

        const woodGeometries = []
        const brassGeometries = []

        // 1. Дерев'яна основа підставки
        const standBaseGeo = new THREE.BoxGeometry(5.6, 0.28, 2.85)
        standBaseGeo.translate(-0.35, -2.74, 0)
        woodGeometries.push(standBaseGeo)

        // 2. Дерев'яні ложементи та бічні лапи
        const cradleXPositions = [-2.15, 1.45]
        for (const cx of cradleXPositions) {
            const lowerBlockGeo = new THREE.BoxGeometry(0.42, 0.36, 3.12)
            lowerBlockGeo.translate(cx, -2.48, 0)
            woodGeometries.push(lowerBlockGeo)

            for (const side of [-1, 1]) {
                const armGeo = new THREE.BoxGeometry(0.38, 0.68, 0.42)
                armGeo.rotateX(-side * 0.42)
                armGeo.translate(cx, -2.18, side * 1.50)
                woodGeometries.push(armGeo)

                // Латунні тримачі (конуси/ковпачки) точно торкаються зовнішнього скла (R = 2.22),
                // а дерев'яні лапи підтримують їх зовні без заглиблення в скло
                const capGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.42, 20)
                capGeo.rotateZ(Math.PI * 0.5)
                capGeo.translate(cx, -1.904, side * 1.461)
                brassGeometries.push(capGeo)
            }
        }

        // 3. Латунні з'єднувальні стрижні
        for (const side of [-1, 1]) {
            const rodGeo = new THREE.CylinderGeometry(0.055, 0.055, 4.1, 16)
            rodGeo.rotateZ(Math.PI * 0.5)
            rodGeo.translate(-0.35, -2.42, side * 1.25)
            brassGeometries.push(rodGeo)
        }

        // 4. Латунна пластина таблички (об'єднана з іншою латунню)
        const plateGeo = new THREE.BoxGeometry(2.35, 0.34, 0.06)
        plateGeo.rotateX(-0.22)
        plateGeo.translate(-0.35, -2.68, 1.44)
        brassGeometries.push(plateGeo)

        // Злиття деталей дерев'яної підставки в єдину геометрію
        const mergedWoodGeo = mergeGeometries(woodGeometries)
        const standWoodMesh = new THREE.Mesh(mergedWoodGeo, woodMat)
        standWoodMesh.castShadow = false
        standWoodMesh.receiveShadow = false
        this.group.add(standWoodMesh)

        // Злиття латунних деталей фурнітури в єдину геометрію
        const mergedBrassGeo = mergeGeometries(brassGeometries)
        const standBrassMesh = new THREE.Mesh(mergedBrassGeo, this.brassMaterial)
        standBrassMesh.castShadow = false
        standBrassMesh.receiveShadow = false
        this.group.add(standBrassMesh)
    }

    buildBrassNameplate() {
        const canvas = document.createElement('canvas')
        canvas.width = 1024
        canvas.height = 256
        const ctx = canvas.getContext('2d')

        ctx.clearRect(0, 0, 1024, 256)

        // Тонка золотисто-бронзова гравірована рамка
        ctx.strokeStyle = '#5a2e0a'
        ctx.lineWidth = 6
        ctx.strokeRect(36, 28, 952, 200)

        ctx.strokeStyle = '#92400e'
        ctx.lineWidth = 2
        ctx.strokeRect(44, 36, 936, 184)

        // М'яка тінь для об'ємного рельєфного тиснення
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.font = 'bold 84px "Cinzel", "Georgia", "Times New Roman", serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('КОРАБЕЛЬ', 514, 131)

        // Глибокий темно-бронзовий напис
        ctx.fillStyle = '#291707'
        ctx.fillText('КОРАБЕЛЬ', 512, 128)

        const textTexture = new THREE.CanvasTexture(canvas)
        textTexture.colorSpace = THREE.SRGBColorSpace

        const textMat = new THREE.MeshStandardMaterial({
            map: textTexture,
            transparent: true,
            roughness: 0.35,
            metalness: 0.75,
            depthWrite: false
        })

        const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 0.32), textMat)
        textMesh.position.set(-0.35, -2.68, 1.44)
        textMesh.rotation.x = -0.22
        textMesh.translateZ(0.033)
        this.group.add(textMesh)
    }
}
