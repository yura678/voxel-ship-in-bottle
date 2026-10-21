import * as THREE from 'three'

/**
 * Математичні функції внутрішньої геометрії скляної пляшки.
 * Розраховує внутрішній радіус скляної колби пляшки у точній відповідності
 * до LatheGeometry з BottleEnclosure.js (Catmull-Rom сплайни плеча та дна).
 */

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

const shoulderPoints = innerShoulderCurve.getPoints(40) // p.y is x, p.x is r
const basePoints = innerBaseCurve.getPoints(40)

/**
 * Повертає точний внутрішній радіус скляної колби пляшки вздовж горизонтальної осі X
 */
export function getBottleInnerRadius(x) {
    if (x < -3.38 || x > 4.55) return 0
    if (x >= 3.58) return 0.67

    if (x >= 2.28) {
        for (let i = 0; i < shoulderPoints.length - 1; i++) {
            const pA = shoulderPoints[i]
            const pB = shoulderPoints[i + 1]
            if ((x <= pA.y && x >= pB.y) || (x >= pA.y && x <= pB.y)) {
                const t = (x - pA.y) / (pB.y - pA.y)
                return pA.x + t * (pB.x - pA.x)
            }
        }
        return 2.11
    }

    if (x >= -3.08) {
        return 2.11
    }

    for (let i = 0; i < basePoints.length - 1; i++) {
        const pA = basePoints[i]
        const pB = basePoints[i + 1]
        if ((x <= pA.y && x >= pB.y) || (x >= pA.y && x <= pB.y)) {
            const t = (x - pA.y) / (pB.y - pA.y)
            return Math.max(0, pA.x + t * (pB.x - pA.x))
        }
    }
    return 0
}

/**
 * Повертає мінімальну координату X внутрішнього скла купола денця пляшки для заданого радіуса r
 */
export function getBottleInnerBaseX(r) {
    if (r >= 2.11) return -3.08
    for (let i = 0; i < basePoints.length - 1; i++) {
        const pA = basePoints[i]
        const pB = basePoints[i + 1]
        if ((r <= pA.x && r >= pB.x) || (r >= pA.x && r <= pB.x)) {
            const t = (r - pA.x) / (pB.x - pA.x)
            return pA.y + t * (pB.y - pA.y)
        }
    }
    return -3.32
}

/**
 * Перевіряє, чи точка (x, y, z) знаходиться всередині скляної колби з урахуванням відступу margin
 */
export function isInsideBottle(x, y, z, margin = 0.12) {
    const r = getBottleInnerRadius(x) - margin
    if (r <= 0) return false
    return y * y + z * z <= r * r
}
