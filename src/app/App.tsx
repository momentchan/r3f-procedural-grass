import { AdaptiveDpr, CameraControls, Environment, useHelper } from "@react-three/drei";
import { CanvasCapture } from "@packages/r3f-gist/components/utility";
import { LevaWrapper } from "@packages/r3f-gist/components";
import { Canvas, useFrame } from "@react-three/fiber";
import Grass from "../components/Grass";
import { useRef, useMemo, useEffect, useState } from "react";
import { useControls } from "leva";
import * as THREE from 'three'
import Effects from "../components/Effects";
import { Sky } from "@react-three/drei";
import { Terrain } from "../components/Terrain";

function DirectionalLightHelper() {
    const directionalLightRef = useRef<THREE.DirectionalLight>(null)
    useHelper(directionalLightRef as React.MutableRefObject<THREE.Object3D>, THREE.DirectionalLightHelper, 1, 'red')
    
    const { rotationSpeed, color, intensity } = useControls('Directional Light', {
        rotationSpeed: { value: 0.5, min: 0, max: 2, step: 0.1 },
        color: { value: '#ffffff' },
        intensity: { value: 1.0, min: 0, max: 3, step: 0.1 },
    })
    
    const basePosition = useMemo(() => new THREE.Vector3(0, 5, 5), [])
    const position = useMemo(() => new THREE.Vector3(), [])
    
    // Update light properties
    useEffect(() => {
        if (!directionalLightRef.current) return
        
        const light = directionalLightRef.current
        
        // Update light color and intensity
        light.color.set(color)
        light.intensity = intensity
    }, [color, intensity])
    
    useFrame((state) => {
        if (!directionalLightRef.current) return
        
        const rotationY = state.clock.elapsedTime * rotationSpeed
        position.copy(basePosition)
        const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationY)
        position.applyMatrix4(rotationMatrix)
        directionalLightRef.current.position.copy(position)
    })
    
    return (
        <directionalLight ref={directionalLightRef} castShadow position={basePosition.toArray()} intensity={1.0} />
    )
}

export default function App() {
    const [terrainParams, setTerrainParams] = useState<{ amplitude: number; frequency: number; seed: number } | undefined>(undefined)

    return <>
        <LevaWrapper />

        <Canvas
            shadows
            camera={{
                fov: 45,
                near: 0.1,
                far: 30,
                position: [0, 0, 5]
            }}
            gl={{ preserveDrawingBuffer: true }}
            dpr={[1, 2]}
            performance={{ min: 0.5, max: 1 }}
        >
            <color attach="background" args={['#000000']} />
            <AdaptiveDpr pixelated />

            <CameraControls makeDefault />
            <Environment preset="city" environmentIntensity={0.2} />
            <DirectionalLightHelper />
            {/* <Sky /> */}
            <Terrain onParamsChange={setTerrainParams} />
            <Grass terrainParams={terrainParams} />
            <CanvasCapture />
            <Effects />
        </Canvas>
    </>
}
