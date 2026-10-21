import * as THREE from 'three'
import gsap from 'gsap'

/**
 * Модуль інтерактивності на основі THREE.Raycaster.
 * Обробляє наведення курсора та кліки по проксі-мешах воксельного корабля, океану, маяка,
 * острова скарбів, щупалець Кракена, бочок, хмар та корка пляшки.
 */
export class InteractionManager {
    constructor(camera, canvas, scene, callbacks) {
        this.camera = camera
        this.canvas = canvas
        this.scene = scene
        this.callbacks = callbacks

        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2(-10, -10)
        this.currentIntersect = null
        this.pointerDownPos = { x: 0, y: 0 }
        this.needsRaycast = false
        this.lastRaycastTime = 0

        this.hitMarker = new THREE.Mesh(
            new THREE.RingGeometry(0.035, 0.06, 16),
            new THREE.MeshBasicMaterial({
                color: '#fde047',
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
                depthTest: false
            })
        )
        this.hitMarker.visible = false
        this.scene.add(this.hitMarker)

        this.initEventListeners()
    }

    initEventListeners() {
        window.addEventListener('mousemove', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
            this.needsRaycast = true
        })

        this.canvas.addEventListener('pointerdown', (event) => {
            this.pointerDownPos.x = event.clientX
            this.pointerDownPos.y = event.clientY
        })

        this.canvas.addEventListener('click', (event) => {
            const dx = event.clientX - this.pointerDownPos.x
            const dy = event.clientY - this.pointerDownPos.y
            if (Math.hypot(dx, dy) > 6) return

            if (this.currentIntersect) {
                this.handleObjectClick(this.currentIntersect)
            }
        })
    }

    findInteractiveData(object) {
        let curr = object
        while (curr) {
            if (curr.userData && curr.userData.interactiveType) {
                return { mesh: curr, data: curr.userData }
            }
            curr = curr.parent
        }
        return null
    }

    handleObjectClick(intersect) {
        const found = this.findInteractiveData(intersect.object)
        if (!found) return

        const { data } = found
        const type = data.interactiveType
        const pt = intersect.point

        gsap.fromTo(
            this.hitMarker.scale,
            { x: 2.2, y: 2.2, z: 2.2 },
            { x: 1.0, y: 1.0, z: 1.0, duration: 0.3, ease: 'back.out(2)' }
        )

        switch (type) {
            case 'voxel_ship':
                this.callbacks.onFireCannons?.()
                break

            case 'voxel_ocean':
            case 'floating_prop':
                this.callbacks.onOceanSplash?.(pt)
                break

            case 'lighthouse':
                this.callbacks.onToggleLighthouse?.()
                break

            case 'treasure_island':
                this.callbacks.onTreasureBurst?.()
                break

            case 'kraken':
                this.callbacks.onKrakenAttack?.(pt)
                break

            case 'bottle_cork':
                this.callbacks.onPopCork?.()
                break

            case 'voxel_cloud':
                this.callbacks.onCycleWeather?.()
                break
        }
    }

    update(interactiveObjects, elapsedTime = 0) {
        // Перевірка перетинів променя виконується при русі курсора з інтервалом 40 мс
        if (!this.needsRaycast || elapsedTime - this.lastRaycastTime < 0.04) {
            return
        }
        this.needsRaycast = false
        this.lastRaycastTime = elapsedTime

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const intersects = this.raycaster.intersectObjects(interactiveObjects, false)

        if (intersects.length > 0) {
            const firstHit = intersects[0]
            this.currentIntersect = firstHit
            this.canvas.style.cursor = 'pointer'

            this.hitMarker.visible = true
            this.hitMarker.position.copy(firstHit.point)
            this.hitMarker.lookAt(this.camera.position)
        } else {
            this.currentIntersect = null
            this.canvas.style.cursor = 'default'
            this.hitMarker.visible = false
        }
    }
}
