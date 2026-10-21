import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Timer } from 'three/addons/misc/Timer.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import gsap from 'gsap'

import { CAMERA_CONFIG } from './config/sceneConfig.js'
import { AudioSynthesizer } from './audio/AudioSynthesizer.js'
import { EnvironmentManager } from './core/EnvironmentManager.js'
import { ModelManager } from './core/ModelManager.js'
import { InteractionManager } from './core/InteractionManager.js'
import { BottleEnclosure } from './world/BottleEnclosure.js'
import { VoxelOcean } from './world/VoxelOcean.js'
import { VoxelShip } from './world/VoxelShip.js'
import { VoxelLandscape } from './world/VoxelLandscape.js'
import { VoxelWildlifeAndProps } from './world/VoxelWildlifeAndProps.js'
import { ParticleManager } from './world/ParticleManager.js'
import { HudController } from './ui/HudController.js'
import { GuiController } from './ui/GuiController.js'

/**
 * ВОКСЕЛЬНИЙ КОРАБЕЛЬ У СКЛЯНІЙ ПЛЯШЦІ
 * Головний модуль-оркестратор сцени Three.js.
 */

// 1. Ініціалізація полотна, сцени та базових сервісів
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
const textureLoader = new THREE.TextureLoader()
const audio = new AudioSynthesizer()

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

// 2. Камера та контролер орбіти
const camera = new THREE.PerspectiveCamera(
    CAMERA_CONFIG.fov,
    sizes.width / sizes.height,
    CAMERA_CONFIG.near,
    CAMERA_CONFIG.far
)
camera.position.set(...CAMERA_CONFIG.presets[0].pos)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = CAMERA_CONFIG.dampingFactor
controls.target.set(...CAMERA_CONFIG.presets[0].target)
controls.minDistance = CAMERA_CONFIG.minDistance
controls.maxDistance = CAMERA_CONFIG.maxDistance
controls.maxPolarAngle = CAMERA_CONFIG.maxPolarAngle

let camPresetIdx = 0

// 3. WebGLRenderer (ACESFilmicToneMapping + Швидкий апаратний PCFShadowMap)
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(1)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.35

// 5.1 Монітор продуктивності Stats (FPS, ms, Calls \ Time)
const statsWrapper = document.createElement('div')
statsWrapper.id = 'stats-widget'
statsWrapper.className = 'stats-widget'

const stats = new Stats()
stats.showPanel(0)
stats.dom.classList.add('stats-panel')
statsWrapper.appendChild(stats.dom)

const telemetryBadge = document.createElement('div')
telemetryBadge.id = 'stats-telemetry'
telemetryBadge.className = 'stats-telemetry'
telemetryBadge.textContent = '0 calls · 0ms'
statsWrapper.appendChild(telemetryBadge)

document.body.appendChild(statsWrapper)

function toggleStatsVisibility() {
    statsWrapper.classList.toggle('hidden')
}

// 7. Обробники вікна (Resize та Fullscreen)
window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(1)
})

window.addEventListener('dblclick', (event) => {
    if (event.target !== canvas) return
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement
    if (!fullscreenElement) {
        if (canvas.requestFullscreen) canvas.requestFullscreen()
    } else {
        if (document.exitFullscreen) document.exitFullscreen()
    }
})

// Головна асинхронна функція ініціалізації додатку
async function init() {
    // 4. Завантаження 3D-моделей (.glb) та побудова підсистем світу
    const modelManager = new ModelManager()
    try {
        await modelManager.loadAll()
    } catch (err) {
        console.warn('Помилка завантаження 3D моделей:', err)
    }

    const envManager = new EnvironmentManager(scene, renderer)
    const bottle = new BottleEnclosure(scene, textureLoader, modelManager)
    const ocean = new VoxelOcean(scene)
    const ship = new VoxelShip(scene, modelManager)
    const landscape = new VoxelLandscape(scene, modelManager)
    const wildlife = new VoxelWildlifeAndProps(scene, modelManager)
    const particles = new ParticleManager(scene, textureLoader)

    const timer = new Timer()

    // 5. Координатори дій між 3D-підсистемами, звуком та UI
    function handleFireCannons() {
        const t = timer.getElapsed()
        audio.playCannonSound()
        ship.fireBroadside(t)
        ocean.addRipple(ship.group.position.x, ship.group.position.z, t, 0.055)
    }

    function handleOceanSplash(point = null) {
        const t = timer.getElapsed()
        audio.playSplashSound()
        const px = point ? point.x : (Math.random() - 0.5) * 2.4
        const pz = point ? point.z : (Math.random() - 0.5) * 1.2
        const py = point ? point.y : -0.32
        ocean.addRipple(px, pz, t, 0.070)
        particles.spawnWaterSplash({ x: px, y: py, z: pz }, t)
    }

    function handleToggleLighthouse() {
        audio.playFoghornSound()
        landscape.toggleLighthouse()
    }

    function handleTreasureBurst() {
        const t = timer.getElapsed()
        audio.playCoinChimeSound()
        landscape.spawnTreasureBurst(t)
    }

    function handleKrakenAttack(point) {
        const t = timer.getElapsed()
        audio.playSplashSound()
        wildlife.triggerKrakenSlap()
        ocean.addRipple(-1.25, 0.72, t, 0.080)
        particles.spawnWaterSplash(point || { x: -1.25, y: -0.3, z: 0.72 }, t)
    }

    function handleSelectWeather(mode) {
        envManager.setWeather(mode, ocean, particles, landscape, wildlife, ship)
        guiController.debugObject.weather = mode
    }

    function handleCycleWeather() {
        const nextMode = envManager.cycleWeather(ocean, particles, landscape, wildlife, ship)
        guiController.debugObject.weather = nextMode
    }

    function handlePopCork() {
        audio.playCorkPopSound()
        bottle.popCork()
    }

    function handleCycleCamera() {
        camPresetIdx = (camPresetIdx + 1) % CAMERA_CONFIG.presets.length
        const p = CAMERA_CONFIG.presets[camPresetIdx]
        gsap.to(camera.position, {
            x: p.pos[0],
            y: p.pos[1],
            z: p.pos[2],
            duration: 1.15,
            ease: 'power2.inOut'
        })
        gsap.to(controls.target, {
            x: p.target[0],
            y: p.target[1],
            z: p.target[2],
            duration: 1.15,
            ease: 'power2.inOut'
        })
    }

    // 6. Підключення шару UI (HUD + lil-gui) та Raycaster
    const hudController = new HudController({
        onFireCannons: handleFireCannons,
        onOceanSplash: handleOceanSplash,
        onCycleWeatherWithSound: () => {
            audio.playCorkPopSound()
            handleCycleWeather()
        },
        onToggleLighthouse: handleToggleLighthouse,
        onTreasureBurst: handleTreasureBurst,
        onPopCork: handlePopCork,
        onCycleCamera: handleCycleCamera,
        onToggleStats: toggleStatsVisibility,
        onSteerShip: (dx, dz) => ship.steer(dx, dz)
    })

    const guiController = new GuiController({
        ocean,
        callbacks: {
            onSelectWeather: handleSelectWeather
        }
    })

    const interaction = new InteractionManager(camera, canvas, scene, {
        onFireCannons: handleFireCannons,
        onOceanSplash: handleOceanSplash,
        onToggleLighthouse: handleToggleLighthouse,
        onTreasureBurst: handleTreasureBurst,
        onKrakenAttack: handleKrakenAttack,
        onPopCork: handlePopCork,
        onCycleWeather: () => {
            audio.playCorkPopSound()
            handleCycleWeather()
        }
    })

    // 8. Головний цикл анімації tick()
    const interactiveList = [
        ocean.raycastProxy,
        ...ship.interactiveMeshes,
        ...landscape.interactiveMeshes,
        ...wildlife.interactiveMeshes,
        ...bottle.interactiveMeshes
    ]

    let prevElapsed = 0
    let lastFpsTime = performance.now()

    const tick = () => {
        stats.begin()
        timer.update()
        const elapsedTime = timer.getElapsed()
        const deltaTime = Math.min(0.1, elapsedTime - prevElapsed)
        prevElapsed = elapsedTime

        const now = performance.now()
        if (now - lastFpsTime >= 250) {
            lastFpsTime = now
            const calls = renderer.info.render.calls
            const ms = Math.round(deltaTime * 1000)
            telemetryBadge.textContent = `${calls} calls · ${ms}ms`
        }

        ocean.update(elapsedTime, ship.group.position)
        ship.update(elapsedTime, deltaTime, ocean, (hitPos) => {
            audio.playSplashSound()
            particles.spawnWaterSplash(hitPos, elapsedTime)
        })
        landscape.update(elapsedTime, deltaTime)
        wildlife.update(elapsedTime, ocean)
        particles.update(elapsedTime, deltaTime)
        envManager.update(elapsedTime)

        interaction.update(interactiveList, elapsedTime)

        controls.update()
        renderer.render(scene, camera)

        stats.end()
        window.requestAnimationFrame(tick)
    }

    tick()
}

init().catch(err => {
    console.error('Помилка ініціалізації сцени:', err)
})
