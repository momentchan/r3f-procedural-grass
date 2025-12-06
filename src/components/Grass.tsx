import { useMemo } from 'react';
import * as THREE from 'three'
import utility from '@packages/r3f-gist/shaders/cginc/math/utility.glsl'


const GRID_SIZE = 32;
const GRASS_BLADES = GRID_SIZE * GRID_SIZE;
const PATCH_SIZE = 4;
const BLADE_HEIGHT = 0.6;
const BLADE_WIDTH = 0.04;
const BLADE_SEGMENTS = 14;



const grassVertex = /* glsl */ `
  ${utility}
  attribute vec3 instanceOffset;

  uniform float time;
  uniform vec2 windDir;
  uniform float bladeHeight;

  //   varying float vHeight;
  varying vec2 vUv;

  // 簡單 hash 當成亂數
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    // position 來自 base blade geometry（在 local space）
    // // 將 local y 轉成 0~1 的高度係數
    // float h = clamp(pos.y / bladeHeight, 0.0, 1.0);
    // vHeight = h;
    
    // // analytic 風：每個 instance 一個相位
    // vec2 wDir = normalize(windDir);
    // float phase = hash(instanceOffset.xz * 10.0);
    // float sway = sin(time * 1.5 + phase * 6.2831) * 0.25;
    
    // // 高度越高、晃動越大
    // float f = smoothstep(0.1, 1.0, h);
    // vec3 bend = vec3(wDir.x, 0.0, wDir.y) * sway * f;
    
    // pos += bend;
    
    // 將草葉移到 instance 的位置（XZ 平面鋪開）

    vUv = uv;
    
    vec2 seed = instanceOffset.xz;
    float perBladeHash = hash(seed * 37.0);
    float randomAngle = perBladeHash * 6.2831;
    vec3 pos = position;
    pos.xz = rotate2D(pos.xz, randomAngle);
    vec3 worldPos = pos + instanceOffset;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`;


const grassFragment = /* glsl */ `
  varying float vHeight;
//   uniform vec3 diffuse;
  varying vec2 vUv;
  void main() {
    // vec3 col = mix(diffuse * 0.4, diffuse, vHeight);
    gl_FragColor = vec4(vUv, 0.0, 1.0);
  }
`;


function createGrassGeometry(): THREE.InstancedBufferGeometry {
    const bladeGeometry = new THREE.PlaneGeometry(
        BLADE_WIDTH,
        BLADE_HEIGHT,
        1,
        BLADE_SEGMENTS
    )

    bladeGeometry.translate(0, BLADE_HEIGHT / 2, 0)

    const instancedGeometry = new THREE.InstancedBufferGeometry()

    // Copy attributes from PlaneGeometry to InstancedBufferGeometry
    instancedGeometry.setAttribute('position', bladeGeometry.attributes.position)
    instancedGeometry.setAttribute('normal', bladeGeometry.attributes.normal)
    instancedGeometry.setAttribute('uv', bladeGeometry.attributes.uv)
    instancedGeometry.setIndex(bladeGeometry.index)

    const offsets = new Float32Array(GRASS_BLADES * 3)
    let i = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const id = x * GRID_SIZE + z;
            if (id >= GRASS_BLADES) break;
            const fx = x / GRID_SIZE - 0.5;
            const fz = z / GRID_SIZE - 0.5;

            const jitterX = (Math.random() - 0.5) * 0.2;
            const jitterZ = (Math.random() - 0.5) * 0.2;

            const px = fx * PATCH_SIZE + jitterX;
            const pz = fz * PATCH_SIZE + jitterZ;

            offsets[i++] = px;
            offsets[i++] = 0;
            offsets[i++] = pz;
        }
    }

    instancedGeometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 3))
    return instancedGeometry
}



export default function Grass() {
    const geometry = useMemo(() => createGrassGeometry(), [])

    const uniforms = useMemo(() => ({
        time: { value: 0 },
        windDir: { value: new THREE.Vector2(1, 0) },
        bladeHeight: { value: BLADE_HEIGHT },
        diffuse: { value: new THREE.Color("#6bbf4e") },
    }), [])

    return (
        <instancedMesh
            args={[geometry, undefined as any, GRASS_BLADES]}
            geometry={geometry}
        >
            <shaderMaterial
                key={Math.random()}
                fragmentShader={grassFragment}
                vertexShader={grassVertex}
                side={THREE.DoubleSide}
            />

        </instancedMesh>
    )
}