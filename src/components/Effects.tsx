import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { useRef, useMemo } from "react";
import { useControls } from "leva";
import * as THREE from "three";

export default function Effects() {
    const composer = useRef<any>(null);

    const smaaParams = useControls('Effects.SMAA', {
        enabled: { value: true, label: 'Enable SMAA' }
    }, { collapsed: true });

    const dofParams = useControls('Effects.Depth of Field', {
        enabled: { value: false, label: 'Enable Depth of Field' },
        focusDistance: { value: 2.5, min: 0, max: 10, step: 0.01 },
        focalLength: { value: 0.024, min: 0.001, max: 1, step: 0.001 },
        bokehScale: { value: 5, min: 0, max: 10, step: 0.1 },
        focusRange: { value: 1.5, min: 0.01, max: 10, step: 0.01 },
        blur: { value: 0.5, min: 0, max: 2, step: 0.01 }
    }, { collapsed: true });

    const bloomParams = useControls('Effects.Bloom', {
        enabled: { value: true, label: 'Enable Bloom' },
        intensity: { value: 0.5, min: 0, max: 3, step: 0.01 },
        luminanceThreshold: { value: 0., min: 0, max: 1, step: 0.01 },
        luminanceSmoothing: { value: 0.5, min: 0, max: 0.1, step: 0.001 },
        mipmapBlur: true
    }, { collapsed: true });

    const toneMappingParams = useControls('Effects.Tone Mapping', {
        enabled: { value: true, label: 'Enable Tone Mapping' },
        adaptive: { value: true, label: 'Adaptive' },
        resolution: { value: 128, min: 64, max: 512, step: 16 },
        middleGrey: { value: 0.6, min: 0, max: 1, step: 0.01 },
        maxLuminance: { value: 16.0, min: 1, max: 32, step: 0.1 },
        averageLuminance: { value: 1.0, min: 0.1, max: 10, step: 0.1 },
        adaptationRate: { value: 1.0, min: 0.01, max: 5, step: 0.01 }
    }, { collapsed: true });

    // Leva controls for post-processing effects
    const n8aoParams = useControls('Effects.N8AO', {
        enabled: { value: false, label: 'Enable N8AO' },
        aoRadius: { value: 2, min: 0, max: 10, step: 0.1 },
        aoIntensity: { value: 2, min: 0, max: 10, step: 0.1 },
        aoSamples: { value: 6, min: 1, max: 32, step: 1 },
        denoiseSamples: { value: 4, min: 1, max: 16, step: 1 },
        distanceFalloff: { value: 1, min: 0, max: 10, step: 0.1 },
    }, { collapsed: true })

    const effects = useMemo(() => {

        const effectsList = [];

        if (smaaParams.enabled) {
            effectsList.push(
                <SMAA key="smaa" />
            );
        }

        if (dofParams.enabled) {
            effectsList.push(
                <DepthOfField
                    key="dof"
                    focusDistance={dofParams.focusDistance}
                    focalLength={dofParams.focalLength}
                    bokehScale={dofParams.bokehScale}
                    focusRange={dofParams.focusRange}
                    blur={dofParams.blur}
                />
            );
        }

        if (bloomParams.enabled) {
            effectsList.push(
                <Bloom
                    key="bloom"
                    luminanceThreshold={bloomParams.luminanceThreshold}
                    luminanceSmoothing={bloomParams.luminanceSmoothing}
                    mipmapBlur
                    intensity={bloomParams.intensity}
                />
            );
        }

        

        if (toneMappingParams.enabled) {
            effectsList.push(
                <ToneMapping 
                    key="toneMapping" 
                    adaptive={toneMappingParams.adaptive}
                    resolution={toneMappingParams.resolution}
                    middleGrey={toneMappingParams.middleGrey}
                    maxLuminance={toneMappingParams.maxLuminance}
                    averageLuminance={toneMappingParams.averageLuminance}
                    adaptationRate={toneMappingParams.adaptationRate}
                />
            );
        }

        if (n8aoParams.enabled) {
            effectsList.push(
                <N8AO
                    key="n8ao"
                    aoRadius={n8aoParams.aoRadius}
                    intensity={n8aoParams.aoIntensity}
                    aoSamples={n8aoParams.aoSamples}
                    denoiseSamples={n8aoParams.denoiseSamples}
                />
            );
        }

        return effectsList;
    }, [smaaParams, dofParams, bloomParams, n8aoParams, toneMappingParams]);

    return (
        <EffectComposer
            ref={composer}
            multisampling={0}
            resolutionScale={1}
            frameBufferType={THREE.HalfFloatType}
            enableNormalPass={false}
        >
            {effects}
        </EffectComposer>
    )
}