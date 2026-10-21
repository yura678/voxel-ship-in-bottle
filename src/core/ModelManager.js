import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

/**
 * Менеджер завантаження та кешування 3D моделей (.glb).
 * Підтримує асинхронне завантаження з Draco-декодуванням,
 * паралельні запити з прогрес-колбеком та зручний доступ
 * до геометрій і клонів моделей для інстансів і компонентів сцени.
 */
export class ModelManager {
    constructor(loadingManager = null) {
        this.models = new Map()
        this.loadingManager = loadingManager || new THREE.LoadingManager()

        this.dracoLoader = new DRACOLoader(this.loadingManager)
        this.dracoLoader.setDecoderPath('/draco/gltf/')

        this.gltfLoader = new GLTFLoader(this.loadingManager)
        this.gltfLoader.setDRACOLoader(this.dracoLoader)

        this.modelList = [
            { id: 'bottle_glass', path: '/models/bottle_glass.glb' },
            { id: 'cork', path: '/models/cork.glb' },
            { id: 'stand', path: '/models/stand.glb' },
            { id: 'lighthouse_island', path: '/models/lighthouse_island.glb' },
            { id: 'treasure_island', path: '/models/treasure_island.glb' },
            { id: 'sea_arch', path: '/models/sea_arch.glb' },
            { id: 'seabed', path: '/models/seabed.glb' },
            { id: 'ship', path: '/models/ship.glb' },
            { id: 'kraken_body', path: '/models/kraken_body.glb' },
            { id: 'buoy', path: '/models/buoy.glb' },
            { id: 'barrel', path: '/models/barrel.glb' },
            { id: 'clouds', path: '/models/clouds.glb' },
            { id: 'seagull', path: '/models/seagull.glb' }
        ]
    }

    /**
     * Завантажує всі 3D моделі сцени паралельно
     * @param {Function} [onProgress] - (loadedCount, totalCount) => void
     * @returns {Promise<Map<string, Object>>}
     */
    async loadAll(onProgress = null) {
        let loaded = 0
        const total = this.modelList.length

        const loadPromises = this.modelList.map(item => {
            return new Promise((resolve, reject) => {
                this.gltfLoader.load(
                    item.path,
                    (gltf) => {
                        this.models.set(item.id, gltf)
                        loaded++
                        if (onProgress) onProgress(loaded, total)
                        resolve(gltf)
                    },
                    undefined,
                    (error) => {
                        console.error(`Помилка завантаження моделі ${item.id} (${item.path}):`, error)
                        reject(error)
                    }
                )
            })
        })

        await Promise.all(loadPromises)
        return this.models
    }

    /**
     * Отримує копію (клоновану групу або меш) завантаженої моделі
     * @param {string} id
     * @returns {THREE.Object3D|null}
     */
    getModel(id) {
        const gltf = this.models.get(id)
        if (!gltf) {
            console.warn(`[ModelManager] Модель '${id}' не знайдена в кеші!`)
            return null
        }
        return gltf.scene.clone(true)
    }

    /**
     * Знаходить конкретний Mesh за іменем або перший знайдений Mesh у моделі
     * @param {string} id
     * @param {string} [meshName]
     * @returns {THREE.Mesh|null}
     */
    getMesh(id, meshName = null) {
        const gltf = this.models.get(id)
        if (!gltf) return null

        let foundMesh = null
        gltf.scene.traverse((child) => {
            if (foundMesh) return
            if (child.isMesh) {
                if (!meshName || child.name === meshName) {
                    foundMesh = child
                }
            }
        })
        if (!foundMesh) return null

        const mesh = foundMesh.clone()
        // Для воксельних моделей встановлюємо MeshLambertMaterial з підтримкою кольорів вершин
        if (id !== 'bottle_glass' && id !== 'stand') {
            mesh.material = new THREE.MeshLambertMaterial({
                vertexColors: true
            })
        }
        return mesh
    }

    /**
     * Отримує копію BufferGeometry потрібного меша моделі
     * @param {string} id
     * @param {string} [meshName]
     * @returns {THREE.BufferGeometry|null}
     */
    getGeometry(id, meshName = null) {
        const gltf = this.models.get(id)
        if (!gltf) return null

        let foundGeo = null
        gltf.scene.traverse((child) => {
            if (foundGeo) return
            if (child.isMesh && child.geometry) {
                if (!meshName || child.name === meshName) {
                    foundGeo = child.geometry
                }
            }
        })
        return foundGeo ? foundGeo.clone() : null

    }

    /**
     * Звільнення ресурсів декодера
     */
    dispose() {
        if (this.dracoLoader) {
            this.dracoLoader.dispose()
        }
    }
}
