import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import gsap from 'gsap'
import { WEATHER_MODES, WEATHER_PRESETS } from '../config/sceneConfig.js'

/**
 * Модуль освітлення, фізичного оточення (PMREM RoomEnvironment), погодних режимів та грозових блискавок.
 * Керує джерелами світла (DirectionalLight, HemisphereLight, AmbientLight),
 * м'якими тінями всередині колби, локалізованими розрядами блискавки під час шторму
 * та синхронізацією кольорової палітри океану, частинок і хмар.
 */
export class EnvironmentManager {
    constructor(scene, renderer) {
        this.scene = scene
        this.renderer = renderer

        this.weatherModes = WEATHER_MODES
        this.weatherIndex = 0
        this.currentWeather = 'day'

        this.backgroundColor = new THREE.Color(WEATHER_PRESETS.day.bgColor)
        this.scene.background = this.backgroundColor

        this.strikePositions = [
            { x: -1.65, z: 0.15 },
            { x: -0.65, z: -0.18 },
            { x: 0.45, z: 0.20 },
            { x: 1.05, z: -0.15 }
        ]
        this.nextStrikeTime = 1.8
        this.activeStrikeStart = -10
        this.activeStrikeDuration = 0.24

        this.setupEnvironment()
        this.setupLights()
        this.setupStormLightning()
    }

    setupEnvironment() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer)
        const roomEnv = new RoomEnvironment()
        this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture
        this.scene.environmentIntensity = WEATHER_PRESETS.day.envIntensity
        roomEnv.dispose()
        pmremGenerator.dispose()
    }

    setupLights() {
        const day = WEATHER_PRESETS.day

        this.ambientLight = new THREE.AmbientLight(day.ambientColor, day.ambientIntensity)
        this.scene.add(this.ambientLight)

        this.hemiLight = new THREE.HemisphereLight(day.hemiColor, day.hemiGroundColor, day.hemiIntensity)
        this.hemiLight.position.set(0, 5, 0)
        this.scene.add(this.hemiLight)

        this.sunLight = new THREE.DirectionalLight(day.sunColor, day.sunIntensity)
        this.sunLight.position.set(...day.sunPosition)
        this.sunLight.castShadow = true
        this.sunLight.shadow.mapSize.set(1024, 1024)
        this.sunLight.shadow.camera.near = 1.5
        this.sunLight.shadow.camera.far = 14.0
        this.sunLight.shadow.camera.top = 2.6
        this.sunLight.shadow.camera.right = 3.5
        this.sunLight.shadow.camera.bottom = -2.6
        this.sunLight.shadow.camera.left = -3.5
        this.sunLight.shadow.radius = 2.4
        this.sunLight.shadow.intensity = day.shadowIntensity
        this.sunLight.shadow.normalBias = 0.014
        this.sunLight.shadow.bias = -0.0005
        this.scene.add(this.sunLight)
    }

    /**
     * Створює 3D-геометрію розгалуженої блискавки та локальне точкове джерело світла (PointLight).
     * Світло має обмежений радіус згасання (distance = 3.6, decay = 2.0), тому освітлює об'єкти
     * лише з боку удару блискавки всередині пляшки і не засвічує корок зовні.
     */
    setupStormLightning() {
        this.lightningGroup = new THREE.Group()
        this.lightningGroup.visible = false
        this.scene.add(this.lightningGroup)

        const createSegment = (x1, y1, z1, x2, y2, z2, thickness) => {
            const start = new THREE.Vector3(x1, y1, z1)
            const end = new THREE.Vector3(x2, y2, z2)
            const dir = new THREE.Vector3().subVectors(end, start)
            const len = dir.length()
            const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)

            const geo = new THREE.BoxGeometry(thickness, len + thickness * 0.4, thickness)
            const quat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                dir.normalize()
            )
            const mat4 = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1))
            geo.applyMatrix4(mat4)
            return geo
        }

        // Вузлові точки зигзагоподібного стовбура блискавки від грозових хмар до води
        const mainNodes = [
            [0.0, 1.38, 0.0],
            [0.08, 1.12, -0.04],
            [-0.07, 0.86, 0.05],
            [0.09, 0.58, 0.02],
            [-0.05, 0.30, -0.04],
            [0.06, 0.02, 0.03],
            [-0.02, -0.32, 0.0]
        ]

        // Бічні відгалуження блискавки
        const branchSegments = [
            [[-0.07, 0.86, 0.05], [-0.22, 0.64, 0.10], [-0.30, 0.46, 0.06]],
            [[0.09, 0.58, 0.02], [0.24, 0.38, -0.06], [0.31, 0.22, -0.02]]
        ]

        const coreGeos = []
        const glowGeos = []

        for (let i = 0; i < mainNodes.length - 1; i++) {
            const a = mainNodes[i]
            const b = mainNodes[i + 1]
            coreGeos.push(createSegment(a[0], a[1], a[2], b[0], b[1], b[2], 0.024))
            glowGeos.push(createSegment(a[0], a[1], a[2], b[0], b[1], b[2], 0.068))
        }

        for (const branch of branchSegments) {
            for (let i = 0; i < branch.length - 1; i++) {
                const a = branch[i]
                const b = branch[i + 1]
                coreGeos.push(createSegment(a[0], a[1], a[2], b[0], b[1], b[2], 0.015))
                glowGeos.push(createSegment(a[0], a[1], a[2], b[0], b[1], b[2], 0.042))
            }
        }

        this.lightningCoreMat = new THREE.MeshBasicMaterial({
            color: '#f8fafc',
            transparent: true,
            opacity: 1.0
        })
        this.lightningGlowMat = new THREE.MeshBasicMaterial({
            color: '#38bdf8',
            transparent: true,
            opacity: 0.48,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })

        const coreMesh = new THREE.Mesh(mergeGeometries(coreGeos), this.lightningCoreMat)
        const glowMesh = new THREE.Mesh(mergeGeometries(glowGeos), this.lightningGlowMat)
        this.lightningGroup.add(coreMesh, glowMesh)

        // Точкове світло блискавки (intensity = 0 у спокої, щоб уникнути перекомпіляції шейдерів)
        this.lightningLight = new THREE.PointLight('#bae6fd', 0, 3.6, 2.0)
        this.lightningLight.position.set(0, 0.78, 0)
        this.lightningGroup.add(this.lightningLight)
    }

    /**
     * Застосовує пресет погоди та часу доби всередині пляшки за конфігурацією WEATHER_PRESETS
     */
    setWeather(mode, ocean, particles, landscape, wildlife, ship) {
        const preset = WEATHER_PRESETS[mode] || WEATHER_PRESETS.day
        this.currentWeather = mode
        this.weatherIndex = Math.max(0, this.weatherModes.indexOf(mode))

        if (preset.bgColor) {
            this.backgroundColor.set(preset.bgColor)
            this.scene.background = this.backgroundColor
        }
        if (preset.envIntensity !== undefined) {
            this.scene.environmentIntensity = preset.envIntensity
        }

        this.sunLight.color.set(preset.sunColor)
        this.sunLight.intensity = preset.sunIntensity
        this.sunLight.shadow.intensity = preset.shadowsEnabled === false ? 0.0 : (preset.shadowIntensity ?? 0.72)

        if (preset.sunPosition) {
            gsap.to(this.sunLight.position, {
                x: preset.sunPosition[0],
                y: preset.sunPosition[1],
                z: preset.sunPosition[2],
                duration: 1.1,
                ease: 'power2.inOut'
            })
        }

        this.ambientLight.color.set(preset.ambientColor)
        this.ambientLight.intensity = preset.ambientIntensity

        if (this.hemiLight) {
            if (preset.hemiColor) this.hemiLight.color.set(preset.hemiColor)
            if (preset.hemiGroundColor) this.hemiLight.groundColor.set(preset.hemiGroundColor)
            if (preset.hemiIntensity !== undefined) this.hemiLight.intensity = preset.hemiIntensity
        }

        if (mode !== 'storm') {
            this.lightningGroup.visible = false
            this.lightningLight.intensity = 0
        }

        if (ocean) {
            ocean.setWeatherPreset(preset)
        }

        if (landscape) {
            landscape.setLighthouseState(Boolean(preset.forceLighthouse))
        }

        if (ship) {
            ship.setWeatherMode(mode)
        }

        if (particles) {
            particles.setWeatherMode(mode)
        }

        if (wildlife) {
            wildlife.setWeatherMode(mode)
        }
    }

    cycleWeather(ocean, particles, landscape, wildlife, ship) {
        const nextIndex = (this.weatherIndex + 1) % this.weatherModes.length
        const nextMode = this.weatherModes[nextIndex]
        this.setWeather(nextMode, ocean, particles, landscape, wildlife, ship)
        return nextMode
    }

    update(elapsedTime) {
        if (this.currentWeather !== 'storm') return

        if (elapsedTime >= this.nextStrikeTime) {
            this.activeStrikeStart = elapsedTime
            this.nextStrikeTime = elapsedTime + 2.2 + Math.random() * 1.8

            const spot = this.strikePositions[Math.floor(Math.random() * this.strikePositions.length)]
            this.lightningGroup.position.set(spot.x, 0, spot.z)
            this.lightningGroup.rotation.y = (Math.random() - 0.5) * Math.PI * 0.8
        }

        const strikeAge = elapsedTime - this.activeStrikeStart
        if (strikeAge >= 0 && strikeAge <= this.activeStrikeDuration) {
            // Подвійний імпульс розряду блискавки (головний спалах + повторний розряд)
            const pulse1 = Math.exp(-Math.pow((strikeAge - 0.03) / 0.028, 2))
            const pulse2 = 0.75 * Math.exp(-Math.pow((strikeAge - 0.11) / 0.042, 2))
            const flashStrength = Math.min(1.0, pulse1 + pulse2)

            this.lightningGroup.visible = flashStrength > 0.06
            this.lightningCoreMat.opacity = flashStrength
            this.lightningGlowMat.opacity = flashStrength * 0.55
            this.lightningLight.intensity = flashStrength * 14.0
        } else if (this.lightningGroup.visible) {
            this.lightningGroup.visible = false
            this.lightningLight.intensity = 0
        }
    }
}
