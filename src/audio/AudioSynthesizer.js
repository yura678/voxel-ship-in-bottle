/**
 * Модуль звукового супроводу морської діорами "Корабель у пляшці" (Web Audio API + Audio).
 * Генерує звуки гарматного залпу, сплеску хвиль, туманного горна маяка, відкорковування пляшки та дзвону монет.
 */
export class AudioSynthesizer {
    constructor() {
        this.enabled = true
        this.ctx = null
        this.hitSound = new Audio('/sounds/hit.mp3')
    }

    initContext() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext
            if (AudioCtx) {
                this.ctx = new AudioCtx()
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume()
        }
    }

    playCannonSound() {
        if (!this.enabled) return
        this.initContext()
        this.hitSound.volume = 0.65
        this.hitSound.currentTime = 0
        this.hitSound.play().catch(() => {})

        if (!this.ctx) return
        const now = this.ctx.currentTime
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(125, now)
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.45)

        gain.gain.setValueAtTime(0.28, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start(now)
        osc.stop(now + 0.5)
    }

    playSplashSound() {
        if (!this.enabled) return
        this.initContext()
        if (!this.ctx) return

        const now = this.ctx.currentTime
        const bufferSize = this.ctx.sampleRate * 0.28
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.09))
        }

        const noise = this.ctx.createBufferSource()
        noise.buffer = buffer

        const filter = this.ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(650, now)
        filter.frequency.exponentialRampToValueAtTime(280, now + 0.25)

        const gain = this.ctx.createGain()
        gain.gain.setValueAtTime(0.22, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28)

        noise.connect(filter)
        filter.connect(gain)
        gain.connect(this.ctx.destination)
        noise.start(now)
    }

    playFoghornSound() {
        if (!this.enabled) return
        this.initContext()
        if (!this.ctx) return

        const now = this.ctx.currentTime
        const osc1 = this.ctx.createOscillator()
        const osc2 = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc1.type = 'sawtooth'
        osc2.type = 'triangle'
        osc1.frequency.setValueAtTime(98, now)
        osc2.frequency.setValueAtTime(147, now)

        const filter = this.ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(320, now)

        gain.gain.setValueAtTime(0.01, now)
        gain.gain.linearRampToValueAtTime(0.16, now + 0.12)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75)

        osc1.connect(filter)
        osc2.connect(filter)
        filter.connect(gain)
        gain.connect(this.ctx.destination)

        osc1.start(now)
        osc2.start(now)
        osc1.stop(now + 0.75)
        osc2.stop(now + 0.75)
    }

    playCorkPopSound() {
        if (!this.enabled) return
        this.initContext()
        if (!this.ctx) return

        const now = this.ctx.currentTime
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(160, now)
        osc.frequency.exponentialRampToValueAtTime(690, now + 0.085)

        gain.gain.setValueAtTime(0.26, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)

        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start(now)
        osc.stop(now + 0.11)
    }

    playCoinChimeSound() {
        if (!this.enabled) return
        this.initContext()
        if (!this.ctx) return

        const notes = [880, 1108.73, 1318.51, 1760]
        notes.forEach((freq, idx) => {
            const now = this.ctx.currentTime + idx * 0.06
            const osc = this.ctx.createOscillator()
            const gain = this.ctx.createGain()
            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, now)
            gain.gain.setValueAtTime(0.11, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.25)
        })
    }
}
