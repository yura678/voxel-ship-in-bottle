/**
 * Централізована конфігурація сцени, пресетів камери, погодних режимів та палітри кольорів.
 */

export const CAMERA_CONFIG = {
    fov: 42,
    near: 0.1,
    far: 100,
    minDistance: 2.6,
    maxDistance: 15,
    maxPolarAngle: Math.PI * 0.54,
    dampingFactor: 0.05,
    presets: [
        { pos: [0.3, 1.35, 7.2], target: [0.1, -0.15, 0] },      // Класичний бічний огляд усієї пляшки
        { pos: [-1.8, 0.85, 3.6], target: [-0.35, 0.1, 0] },     // Макро-огляд корабля
        { pos: [4.2, 1.4, 4.6], target: [-0.8, -0.1, -0.2] },    // Погляд з боку горлечка та острова скарбів
        { pos: [-0.2, -1.25, 4.8], target: [-0.2, -0.85, 0] }    // Підводний огляд коралового рифу крізь скло
    ]
}

export const WEATHER_MODES = ['day', 'sunset', 'night', 'storm']

export const WEATHER_PRESETS = {
    day: {
        bgColor: '#11151c',
        envIntensity: 0.95,
        sunColor: '#fffbeb',
        sunIntensity: 3.6,
        sunPosition: [4.2, 7.5, 4.5],
        shadowsEnabled: true,
        shadowIntensity: 0.72,
        ambientColor: '#e0f2fe',
        ambientIntensity: 0.75,
        hemiColor: '#ffffff',
        hemiGroundColor: '#0e7490',
        hemiIntensity: 0.85,
        oceanMid: '#006494',
        oceanShallow: '#00a8e8',
        oceanTurquoise: '#48cae4',
        underwaterColor: '#0284c7',
        underwaterAbyssColor: '#063254',
        waveAmplitude: 1.0,
        waveSpeed: 1.0,
        isBioluminescent: false,
        forceLighthouse: false
    },
    sunset: {
        bgColor: '#181216',
        envIntensity: 0.80,
        sunColor: '#fb923c',
        sunIntensity: 4.0,
        sunPosition: [-5.6, 4.2, 4.4],
        shadowsEnabled: true,
        shadowIntensity: 0.68,
        ambientColor: '#fed7aa',
        ambientIntensity: 0.55,
        hemiColor: '#fdba74',
        hemiGroundColor: '#13382e',
        hemiIntensity: 0.65,
        oceanMid: '#133c55',
        oceanShallow: '#1d5f7a',
        oceanTurquoise: '#388697',
        underwaterColor: '#134e3e',
        underwaterAbyssColor: '#07221b',
        waveAmplitude: 1.15,
        waveSpeed: 0.95,
        isBioluminescent: false,
        forceLighthouse: false
    },
    night: {
        bgColor: '#090d16',
        envIntensity: 0.18,
        sunColor: '#93c5fd',
        sunIntensity: 2.8,
        sunPosition: [-4.5, 6.2, 4.8],
        shadowsEnabled: true,
        shadowIntensity: 0.55,
        ambientColor: '#1e293b',
        ambientIntensity: 0.25,
        hemiColor: '#38bdf8',
        hemiGroundColor: '#082f49',
        hemiIntensity: 0.35,
        oceanMid: '#07223b',
        oceanShallow: '#0c3b5e',
        oceanTurquoise: '#155e75',
        underwaterColor: '#07223a',
        underwaterAbyssColor: '#020b16',
        waveAmplitude: 0.85,
        waveSpeed: 0.85,
        isBioluminescent: true,
        forceLighthouse: true
    },
    storm: {
        bgColor: '#070a10',
        envIntensity: 0.08,
        sunColor: '#64748b',
        sunIntensity: 0.0,
        sunPosition: [0.0, 7.0, 0.0],
        shadowsEnabled: false,
        shadowIntensity: 0.0,
        ambientColor: '#334155',
        ambientIntensity: 0.38,
        hemiColor: '#475569',
        hemiGroundColor: '#091320',
        hemiIntensity: 0.45,
        oceanMid: '#0c2238',
        oceanShallow: '#163854',
        oceanTurquoise: '#274e6b',
        underwaterColor: '#091b2e',
        underwaterAbyssColor: '#030912',
        waveAmplitude: 2.15,
        waveSpeed: 1.65,
        isBioluminescent: false,
        forceLighthouse: true
    }
}

export const OCEAN_PALETTE = {
    mid: '#006494',
    shallow: '#00a8e8',
    turquoise: '#48cae4',
    foam: '#f1fafe',
    bioFoam: '#00f5d4'
}

export const LANDMARK_COORDS = {
    lighthouseIsland: { x: -2.25, z: -0.55 },
    treasureIsland: { x: 1.65, z: 0.58 },
    seaArch: { x: 1.40, y: -0.36, z: -0.95 }
}
