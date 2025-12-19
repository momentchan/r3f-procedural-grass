import * as THREE from 'three'
import { useMemo, useEffect, useRef } from 'react'
import { useControls } from 'leva'
import CustomShaderMaterial from 'three-custom-shader-material'
import fractal from '@packages/r3f-gist/shaders/cginc/noise/fractal.glsl'

const terrainVertex = /* glsl */ `
  ${fractal}
  
  uniform float uTerrainAmp;
  uniform float uTerrainFreq;
  uniform float uTerrainSeed;
  
  // 1. Get Height
  float getTerrainHeight(vec2 xz) {
      // Add small offset to avoid issues at exactly (0,0)
      vec2 samplePos = xz + vec2(0.001);
      return fbm2(samplePos * uTerrainFreq + uTerrainSeed, 0.0) * uTerrainAmp;
  }
  
  vec3 getTerrainNormal(vec2 xz) {
      // Use adaptive epsilon based on position to handle near-origin cases
      float baseEpsilon = 0.1;
      float minDist = max(abs(xz.x), abs(xz.y));
      float epsilon = max(baseEpsilon, minDist * 0.01);
      
      float h = getTerrainHeight(xz);
      float hx = getTerrainHeight(xz + vec2(epsilon, 0.0));
      float hy = getTerrainHeight(xz + vec2(0.0, epsilon));
      
      vec3 p1 = vec3(epsilon, 0.0, hx - h);
      vec3 p2 = vec3(0.0, epsilon, hy - h);
      
      vec3 normal = cross(p1, p2);
      float len = length(normal);
      
      // Handle edge case where normal is zero (flat surface)
      if (len < 0.0001) {
          return vec3(0.0, 0.0, 1.0); // Default to up vector
      }
      
      return normalize(normal);
  }
  
  void main() {
    float h = getTerrainHeight(position.xy);
    vec3 pos = position;
    pos.z += h;
    
    vec3 n = getTerrainNormal(position.xy);
    csm_Position = pos;
    csm_Normal = n;
  }
`

const terrainFragment = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    // Simple color mix based on height or slope if desired
    csm_DiffuseColor = vec4(uColor, 1.0);
  }
`

export function Terrain() {
  const materialRef = useRef<any>(null)

  const terrainParams = useControls('Terrain', {
    amplitude: { value: 0.3, min: 0.1, max: 2.0, step: 0.1 },
    frequency: { value: 0.4, min: 0.01, max: 1.0, step: 0.1 },
    seed: { value: 0.0, min: 0.0, max: 100.0, step: 0.1 },
    color: { value: '#1a3310' }
  })

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color('#1a3310') },
    uTerrainAmp: { value: terrainParams.amplitude },
    uTerrainFreq: { value: terrainParams.frequency },
    uTerrainSeed: { value: terrainParams.seed }
  }), [])

  // Update uniforms when terrainParams change
  useEffect(() => {
    uniforms.uTerrainAmp.value = terrainParams.amplitude
    uniforms.uTerrainFreq.value = terrainParams.frequency
    uniforms.uTerrainSeed.value = terrainParams.seed
    
    // Update color
    const colorVec = new THREE.Color(terrainParams.color)
    uniforms.uColor.value.set(colorVec.r, colorVec.g, colorVec.b)
    
    if (materialRef.current) {
      materialRef.current.needsUpdate = true
    }
  }, [terrainParams, uniforms])

  return (
    // High segment count is needed for smooth FBM terrain
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[5, 5, 200, 200]} />
      <CustomShaderMaterial
        ref={materialRef}
        baseMaterial={THREE.MeshStandardMaterial}
        vertexShader={terrainVertex}
        fragmentShader={terrainFragment}
        uniforms={uniforms}
      />
    </mesh>
  )
}

