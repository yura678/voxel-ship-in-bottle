/**
 * Контролер HTML-інтерфейсу (HUD) та клавіатурного керування.
 * Відокремлює роботу з DOM-деревом і клавіатурними подіями від основного 3D-циклу сцени.
 */
export class HudController {
    constructor(callbacks) {
        this.callbacks = callbacks
        this.hudEl = document.getElementById('hud')

        this.bindButtons()
        this.bindKeyboard()
    }

    bindButtons() {
        document.getElementById('btn-cannons')?.addEventListener('click', () => this.callbacks.onFireCannons?.())
        document.getElementById('btn-wave')?.addEventListener('click', () => this.callbacks.onOceanSplash?.(null))
        document.getElementById('btn-weather')?.addEventListener('click', () => this.callbacks.onCycleWeatherWithSound?.())
        document.getElementById('btn-lighthouse')?.addEventListener('click', () => this.callbacks.onToggleLighthouse?.())
        document.getElementById('btn-treasure')?.addEventListener('click', () => this.callbacks.onTreasureBurst?.())
        document.getElementById('btn-cork')?.addEventListener('click', () => this.callbacks.onPopCork?.())
        document.getElementById('btn-camera')?.addEventListener('click', () => this.callbacks.onCycleCamera?.())
        document.getElementById('btn-stats')?.addEventListener('click', () => this.callbacks.onToggleStats?.())
        document.getElementById('btn-toggle-hud')?.addEventListener('click', () => this.toggleHudVisibility())
    }

    bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyH') this.toggleHudVisibility()
            if (e.code === 'KeyF') this.callbacks.onToggleStats?.()
            if (e.code === 'Space') {
                e.preventDefault()
                this.callbacks.onFireCannons?.()
            }
            if (e.code === 'KeyD' || e.code === 'ArrowRight') this.callbacks.onSteerShip?.(0.12, 0)
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.callbacks.onSteerShip?.(-0.12, 0)
            if (e.code === 'KeyW' || e.code === 'ArrowUp') this.callbacks.onSteerShip?.(0, -0.09)
            if (e.code === 'KeyS' || e.code === 'ArrowDown') this.callbacks.onSteerShip?.(0, 0.09)
        })
    }

    toggleHudVisibility() {
        this.hudEl?.classList.toggle('hidden')
    }
}
