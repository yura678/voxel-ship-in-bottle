import GUI from 'lil-gui'

/**
 * Модуль керування lil-gui для проєкту "Воксельний Корабель у Скляній Пляшці".
 */
export class GuiController {
    constructor({
        ocean,
        callbacks
    }) {
        this.gui = new GUI({ title: '⚓ Ship in a Bottle Controls', width: 280 })

        this.debugObject = {
            weather: 'day'
        }

        // Хвилі та Атмосфера
        const oceanFolder = this.gui.addFolder('🌊 Хвилі та Атмосфера')
        oceanFolder
            .add(this.debugObject, 'weather', {
                '☀️ Карибський День': 'day',
                '🌅 Багряний Захід': 'sunset',
                '🌙 Біолюмінесцентна Ніч': 'night',
                '⛈️ Морський Шторм': 'storm'
            })
            .name('Погода в пляшці')
            .listen()
            .onChange((mode) => {
                callbacks.onSelectWeather(mode)
            })

        oceanFolder
            .add(ocean, 'waveAmplitude')
            .min(0.15)
            .max(2.6)
            .step(0.05)
            .name('Висота хвиль')
            .listen()

        oceanFolder
            .add(ocean, 'waveSpeed')
            .min(0.2)
            .max(2.5)
            .step(0.05)
            .name('Швидкість хвиль')
            .listen()
    }
}
