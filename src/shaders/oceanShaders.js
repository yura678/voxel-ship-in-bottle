/**
 * Модуль GLSL-шейдерів океану (поверхневі хвилі з піною та підводна товща води).
 * Шейдерні розрахунки поверхні та глибини води:
 * спільна функція розрахунку хвиль використовується і у вершинному шейдері поверхні,
 * і у фрагментному шейдері підводного об'єму.
 */

const OCEAN_SHARED_WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveAmplitude;
uniform float uSurfaceBaseY;
uniform vec4 uRipples[6];
uniform int uNumRipples;

struct WaveSample {
    float totalOffset;
    float rippleSum;
};

WaveSample computeOceanWave(vec2 posXZ) {
    float t = uTime * uWaveSpeed * 1.75;
    float amp = 0.062 * uWaveAmplitude;

    float w1 = sin(posXZ.x * 2.2 + t) * amp;
    float w2 = cos(posXZ.y * 2.6 - t * 0.85 + posXZ.x * 0.7) * (amp * 0.6);
    float w3 = sin((posXZ.x * 1.5 - posXZ.y * 1.7) * 2.1 + t * 1.3) * (amp * 0.35);

    float rippleSum = 0.0;
    if (uNumRipples > 0) {
        for (int i = 0; i < 6; i++) {
            if (i >= uNumRipples) break;
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age > 0.0 && age <= 1.4) {
                float dist = distance(posXZ, r.xy);
                if (dist < 1.35) {
                    float waveFront = dist - age * 1.75;
                    if (abs(waveFront) < 0.65) {
                        float decay = exp(-age * 2.2 - dist * 1.2);
                        float rangeLimit = smoothstep(1.35, 0.85, dist);
                        rippleSum += cos(waveFront * 11.5) * r.w * decay * rangeLimit;
                    }
                }
            }
        }
    }

    return WaveSample(w1 + w2 + w3 + rippleSum, rippleSum);
}
`

/**
 * Підключає вершинний шейдер хвиль та морської піни до матеріалу поверхні океану
 */
export function applyOceanSurfaceShader(material, oceanUniforms) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, oceanUniforms)

        shader.vertexShader = /* glsl */ `
            attribute vec2 aOceanParams;
            uniform vec2 uShipPos;
            uniform vec3 uColorMid;
            uniform vec3 uColorShallow;
            uniform vec3 uColorTurquoise;
            uniform vec3 uColorFoam;
            uniform vec3 uColorBioFoam;
            uniform float uIsBioluminescent;
            ${OCEAN_SHARED_WAVE_GLSL}
        ` + shader.vertexShader

        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_vertex>',
            /* glsl */ `
            float waveDeltaY = 0.0;
            #ifdef USE_INSTANCING
            vec2 colXZ = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
            WaveSample ws = computeOceanWave(colXZ);

            waveDeltaY = ws.totalOffset * aOceanParams.x;

            float invMaxAmp = 1.0 / (0.11 * max(0.5, uWaveAmplitude));
            float elevation = ws.totalOffset * invMaxAmp;
            float dx = (colXZ.x - uShipPos.x) * 0.75;
            float dz = colXZ.y - uShipPos.y;
            float distSqToShip = dx * dx + dz * dz;
            bool isShipWake = distSqToShip < 0.55 && distSqToShip > 0.05;
            bool isShoreSurf = aOceanParams.y < 0.82;
            bool isRippleCrest = ws.rippleSum > 0.012;

            vec3 foamTarget = uIsBioluminescent > 0.5 ? uColorBioFoam : uColorFoam;
            vec3 finalColor;
            if (isRippleCrest || elevation > 0.72 || (isShoreSurf && elevation > 0.22) || (isShipWake && elevation > 0.30)) {
                float foamStrength = isRippleCrest ? clamp(ws.rippleSum * 22.0, 0.45, 0.92) : 0.88;
                finalColor = mix(uColorTurquoise, foamTarget, foamStrength);
            } else if (aOceanParams.y < 1.15 || isShipWake) {
                finalColor = mix(uColorShallow, uColorTurquoise, 0.6);
            } else {
                float normElev = clamp((elevation + 1.0) * 0.5, 0.0, 1.0);
                finalColor = mix(uColorMid, uColorShallow, normElev);
            }

            vColor = finalColor;
            #endif
            `
        )

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            /* glsl */ `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
            transformed.y += waveDeltaY;
            #endif
            `
        )
    }
}

/**
 * Підключає шейдер контурного відсікання хвиль (discard) та глибинного градієнта до підводної товщі води
 */
export function applyUnderwaterVolumeShader(material, oceanUniforms) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, oceanUniforms)

        shader.vertexShader = /* glsl */ `
            varying vec3 vUvUnderwaterPos;
        ` + shader.vertexShader

        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            /* glsl */ `
            #include <worldpos_vertex>
            vUvUnderwaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            `
        )

        shader.fragmentShader = /* glsl */ `
            varying vec3 vUvUnderwaterPos;
            uniform vec3 uAbyssColor;
            ${OCEAN_SHARED_WAVE_GLSL}
        ` + shader.fragmentShader

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            /* glsl */ `
            #include <clipping_planes_fragment>

            WaveSample ws = computeOceanWave(vUvUnderwaterPos.xz);
            float bottleR = 2.11;
            if (vUvUnderwaterPos.x < -3.08) {
                float dx = clamp(-3.08 - vUvUnderwaterPos.x, 0.0, 0.30);
                bottleR = 2.11 - 0.45 * pow(dx / 0.30, 2.2);
            } else if (vUvUnderwaterPos.x > 2.28) {
                float u = clamp((vUvUnderwaterPos.x - 2.28) / (3.58 - 2.28), 0.0, 1.0);
                bottleR = 2.11 - 1.44 * pow(u, 1.52);
            }
            float innerR = max(0.45, bottleR - 0.006);
            float maxZAtWaterline = sqrt(max(0.01, innerR * innerR - uSurfaceBaseY * uSurfaceBaseY));
            float radialRatio = clamp(abs(vUvUnderwaterPos.z) / maxZAtWaterline, 0.0, 1.0);
            float edgeDamping = 0.25 + 0.75 * (1.0 - radialRatio * radialRatio);
            float currentWaveY = uSurfaceBaseY + ws.totalOffset * edgeDamping - 0.018;

            if (vUvUnderwaterPos.y > currentWaveY) {
                discard;
            }
            `
        )

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            /* glsl */ `
            #include <dithering_fragment>
            float depthFactor = clamp((vUvUnderwaterPos.y + 1.95) / 1.60, 0.0, 1.0);
            gl_FragColor.rgb = mix(uAbyssColor, gl_FragColor.rgb, smoothstep(0.0, 1.0, depthFactor));
            gl_FragColor.a = mix(0.82, 0.58, depthFactor);
            `
        )
    }
}
