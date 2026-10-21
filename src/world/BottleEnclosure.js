import * as THREE from 'three'
import gsap from 'gsap'

/**
 * Модуль скляної пляшки, корка та дерев'яної підставки.
 * Відповідає за відображення 3D моделей пляшки, корка та підставки,
 * а також інтерактивність відкривання корка та табличку з назвою.
 */
export class BottleEnclosure {
    constructor(scene, textureLoader, modelManager = null) {
        this.scene = scene
        this.textureLoader = textureLoader
        this.modelManager = modelManager

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

        this.metalNormal = this.textureLoader.load('/textures/iron/Metal053C_1K-JPG_NormalGL.webp')
        this.metalRoughness = this.textureLoader.load('/textures/iron/Metal053C_1K-JPG_Roughness.webp')
    }

    buildGlassBottle() {
        // Матеріал скла пляшки
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

        this.bottleMesh = this.modelManager ? this.modelManager.getMesh('bottle_glass') : null
        if (this.bottleMesh) {
            this.bottleMesh.material = this.glassMaterial
            this.bottleMesh.renderOrder = 10
            this.bottleMesh.castShadow = false
            this.group.add(this.bottleMesh)
        }
    }

    buildVoxelCork() {
        this.corkGroup = new THREE.Group()
        this.corkGroup.position.set(4.35, 0, 0)
        this.group.add(this.corkGroup)

        this.corkMesh = this.modelManager ? this.modelManager.getMesh('cork') : null
        if (this.corkMesh) {
            this.corkMesh.castShadow = false
            this.corkMesh.receiveShadow = false
            this.corkGroup.add(this.corkMesh)
        }

        // Проксі-меш корка для обробки наведення та кліків
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

        const standModel = this.modelManager ? this.modelManager.getModel('stand') : null
        if (standModel) {
            standModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false
                    child.receiveShadow = false
                    if (child.name === 'TableTop') {
                        child.material = darkWoodMat
                    } else if (child.name === 'StandWood') {
                        child.material = woodMat
                    } else if (child.name === 'StandBrass') {
                        child.material = this.brassMaterial
                    }
                }
            })
            this.group.add(standModel)
        }
    }

    buildBrassNameplate() {
        const canvas = document.createElement('canvas')
        canvas.width = 1024
        canvas.height = 256
        const ctx = canvas.getContext('2d')

        ctx.clearRect(0, 0, 1024, 256)

        // Гравірована рамка таблички
        ctx.strokeStyle = '#5a2e0a'
        ctx.lineWidth = 6
        ctx.strokeRect(36, 28, 952, 200)

        ctx.strokeStyle = '#92400e'
        ctx.lineWidth = 2
        ctx.strokeRect(44, 36, 936, 184)

        // Напис із тінню
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.font = 'bold 84px "Cinzel", "Georgia", "Times New Roman", serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('КОРАБЕЛЬ', 514, 131)

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
