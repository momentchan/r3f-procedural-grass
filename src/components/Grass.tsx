import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three'
import { useControls } from 'leva'
import CustomShaderMaterial from 'three-custom-shader-material'
import utility from '@packages/r3f-gist/shaders/cginc/math/utility.glsl'

// ============================================================================
// Constants
// ============================================================================
const GRID_SIZE = 256;
const GRASS_BLADES = GRID_SIZE * GRID_SIZE;
const PATCH_SIZE = 8;
const BLADE_HEIGHT = 0.6;
const BLADE_WIDTH = 0.02;
const BLADE_SEGMENTS = 14;

// ============================================================================
// Vertex Shader
// ============================================================================
const grassVertex = /* glsl */ `
  ${utility}

  // ============================================================================
  // Attributes & Uniforms
  // ============================================================================
  attribute vec3 instanceOffset;
  uniform float bladeHeight;
  uniform float bladeWidth;
  uniform float bendAmount;
  uniform float clumpSize;
  uniform float clumpRadius;
  uniform float thicknessStrength;

  // ============================================================================
  // Varyings
  // ============================================================================
  varying float vHeight;
  varying vec2 vUv;
  varying float vType;
  varying float vPresence;
  varying float vClumpRandom;
  varying vec3 vTest;
  varying vec3 vN;
  varying vec3 vTangent;
  varying vec3 vSide;
  varying vec2 vToCenter;
  varying vec3 vWorldPos;
  varying vec2 vSeed;
  
  // ============================================================================
  // Hash Functions
  // ============================================================================
  float hash11(float x) {
    return fract(sin(x * 37.0) * 43758.5453123);
  }

  vec2 hash21(vec2 p) {
    float h1 = hash11(dot(p, vec2(127.1, 311.7)));
    float h2 = hash11(dot(p, vec2(269.5, 183.3)));
    return vec2(h1, h2);
  }

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  // ============================================================================
  // Voronoi Clump Functions
  // ============================================================================
  vec3 getClumpInfo(vec2 worldXZ) {
    vec2 cell = worldXZ / clumpSize;
    vec2 baseCell = floor(cell);
    vec2 cellFrac = fract(cell);

    float minDist = 1e9;
    vec2 bestSeedCoord;
    vec2 bestCellId;

    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 neighborCell = baseCell + vec2(float(i), float(j));
        vec2 seed = neighborCell + hash2(neighborCell);
        vec2 diff = cell - seed;
        float d2 = dot(diff, diff);

        if (d2 < minDist) {
          minDist = d2;
          bestSeedCoord = seed;
          bestCellId = neighborCell;
        }
      }
    }

    float distToCenter = sqrt(minDist) * clumpSize;
    return vec3(distToCenter, bestCellId);
  }

  vec2 getClumpCenterWorld(vec2 cellId) {
    vec2 seedCoord = cellId + hash2(cellId);
    return seedCoord * clumpSize;
  }

  // ============================================================================
  // Grass Parameters
  // ============================================================================
  struct GrassParams {
    float height;
    float width;
    float bend;
    float tipThin;
    float type;
    float baseWidth;
  };

  vec4 getClumpParams(vec2 cellId) {
    vec2 clumpSeed = cellId;
    vec2 c1 = hash21(clumpSeed * 11.0);
    vec2 c2 = hash21(clumpSeed * 23.0);

    float clumpBaseHeight = bladeHeight * mix(0.8, 1.2, c1.x);
    float clumpBaseWidth = bladeWidth * mix(0.6, 1.4, c1.y);
    float clumpBaseBend = bendAmount * mix(0.7, 1.2, c2.x);
    float clumpType = floor(c2.y * 3.0);

    return vec4(clumpBaseHeight, clumpBaseWidth, clumpBaseBend, clumpType);
  }

  GrassParams getGrassParams(vec2 seed, vec4 clumpParams) {
    vec2 h1 = hash21(seed * 13.0);
    vec2 h2 = hash21(seed * 29.0);

    GrassParams gp;
    gp.height = clumpParams.x * mix(0.6, 1.2, h1.x);
    gp.width = clumpParams.y * mix(0.6, 1.2, h1.y);
    gp.bend = clumpParams.z * mix(0.8, 1.2, h2.x);
    gp.tipThin = mix(0.6, 1.2, h2.y);
    gp.type = clumpParams.w;
    gp.baseWidth = mix(0.2, 0.5, h1.x);

    return gp;
  }

  // ============================================================================
  // Bezier Curve Functions
  // ============================================================================
  vec3 bezier2(vec3 p0, vec3 p1, vec3 p2, float t) {
    float u = 1.0 - t;
    return u*u*p0 + 2.0*u*t*p1 + t*t*p2;
  }

  vec3 bezier2Tangent(vec3 p0, vec3 p1, vec3 p2, float t) {
    return 2.0*(1.0 - t)*(p1 - p0) + 2.0*t*(p2 - p1);
  }

  // ============================================================================
  // Main Vertex Shader
  // ============================================================================
  void main() {
    // 1. UV and Basic Setup
    float t = uv.y;
    float s = (uv.x - 0.5) * 2.0;
    vec2 worldXZ = instanceOffset.xz;

    // 2. Voronoi Clump Calculation
    vec3 clumpInfo = getClumpInfo(worldXZ);
    float distToCenter = clumpInfo.x;
    vec2 cellId = clumpInfo.yz;
    
    vec2 clumpCenterWorld = getClumpCenterWorld(cellId);
    vec2 dir = clumpCenterWorld - worldXZ;
    float len = length(dir);
    vec2 toCenter = len > 1e-5 ? dir / len : vec2(1.0, 0.0);
    
    float r = clamp(distToCenter / clumpRadius, 0.0, 1.0);
    float heightFactor = mix(1.1, 0.9, r);
    float presence = 1.0 - smoothstep(0.7, 1.0, r);

    // 3. Grass Parameters
    vec4 clumpParams = getClumpParams(cellId);
    float clumpRandom = hash11(dot(cellId, vec2(47.0, 61.0)));
    
    vec2 seed = worldXZ;
    GrassParams gp = getGrassParams(seed, clumpParams);
    // gp.height *= heightFactor;
    
    float height = gp.height;
    float width = gp.width;
    float bend = gp.bend;

    // 4. Bezier Curve Shape Generation
    vec3 p0 = vec3(0.0, 0.0, 0.0);
    vec3 p2 = vec3(0.0, height, 0.0);
    
    vec3 p1;
    if (gp.type < 0.5) {
      p1 = vec3(0.0, height * 0.9, bend * 0.7);
    } else if (gp.type < 1.5) {
      p1 = vec3(0.0, height * 0.85, bend * 0.8);
    } else {
      p1 = vec3(0.0, height * 0.8, bend * 1.0);
    }
    
    vec3 spine = bezier2(p0, p1, p2, t);
    vec3 tangent = normalize(bezier2Tangent(p0, p1, p2, t));

    // 5. TBN Frame Construction (UE-style Derive Normals)
    vec3 ref = vec3(0.0, 0.0, 1.0);
    vec3 side = normalize(cross(ref, tangent));
    vec3 normal = normalize(cross(side, tangent));

    // 6. Blade Geometry
    float widthFactor = (t + gp.baseWidth) * pow(1.0 - t, gp.tipThin);
    vec3 lpos = spine + side * width * widthFactor * s * presence;
    
    // 7. Clump-Based Rotation
    vec2 clumpDir = toCenter;
    float clumpAngle = atan(clumpDir.y, clumpDir.x);
    float perBladeHash = hash11(dot(seed, vec2(37.0, 17.0)));
    float randomOffset = (perBladeHash - 0.5) * 1.2;
    float angle = clumpAngle + randomOffset;
    
    lpos.xz = rotate2D(lpos.xz, angle);
    tangent.xz = rotate2D(tangent.xz, angle);
    side.xz = rotate2D(side.xz, angle);
    normal.xz = rotate2D(normal.xz, angle);
    
    tangent = normalize(tangent);
    side = normalize(side);
    normal = normalize(normal);
    
    // 8. Transform to World Space
    vec3 posObj = lpos + instanceOffset;
    vec3 posW = (modelMatrix * vec4(posObj, 1.0)).xyz;
    
    // 9. View-dependent Tilt (Ghost/UE-style)
    vec3 camDirW = normalize(cameraPosition - posW);
    
    vec3 tangentW = normalize((modelMatrix * vec4(tangent, 0.0)).xyz);
    vec3 sideW = normalize((modelMatrix * vec4(side, 0.0)).xyz);
    vec3 normalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    
    mat3 toLocal = mat3(tangentW, sideW, normalW);
    vec3 camDirLocal = normalize(transpose(toLocal) * camDirW);
    
    // Edge mask (UE graph logic)
    float edgeMask = (uv.x - 0.5) * camDirLocal.y;
    float weight = pow(abs(camDirLocal.y), 1.2);
    edgeMask *= weight;
    edgeMask = clamp(edgeMask, 0.0, 1.0);
    
    // Height mask
    float centerMask = pow(1.0 - t, 0.5) * pow(t + 0.05, 0.33);
    centerMask = clamp(centerMask, 0.0, 1.0);
    
    // Combine and apply tilt
    float tilt = thicknessStrength * edgeMask * centerMask;
    vec3 nXZ = normalize(normal * vec3(1.0, 0.0, 1.0));
    vec3 posObjTilted = posObj + nXZ * tilt;

    // 10. CSM Output
    csm_Position = posObjTilted;

    // 11. Varyings
    vN = -normal;
    vTangent = tangent;
    vSide = side;
    vToCenter = toCenter;
    vWorldPos = posW;
    vTest = vec3(edgeMask, 0.0, 0.0);
    vUv = uv;
    vHeight = t;
    vType = gp.type;
    vPresence = presence;
    vClumpRandom = clumpRandom;
    vSeed = seed;
  }
`;

// ============================================================================
// Fragment Shader
// ============================================================================
const grassFragment = /* glsl */ `
  uniform vec3 baseColor;
  uniform vec3 tipColor;
  
  varying float vHeight;
  varying vec2 vUv;
  varying float vPresence;
  varying float vClumpRandom;
  varying vec3 vTest;
  varying vec3 vN;
  varying vec3 vTangent;
  varying vec3 vSide;
  varying vec2 vToCenter;
  varying vec3 vWorldPos;
  varying vec2 vSeed;

  // ============================================================================
  // Lighting Normal Computation (Ghost-style)
  // ============================================================================
  vec3 computeLightingNormal(
    vec3 geoNormal,
    vec2 toCenter,
    float t,
    vec3 worldPos
  ) {
    vec3 clumpNormal = normalize(vec3(toCenter.x, 0.7, toCenter.y));
    float heightMask = pow(1.0 - t, 0.7);
    float dist = length(cameraPosition - worldPos);
    float distMask = smoothstep(4.0, 12.0, dist);
    
    return normalize(
      mix(
        geoNormal,
        clumpNormal,
        heightMask * distMask
      )
    );
  }

  // ============================================================================
  // Main Fragment Shader
  // ============================================================================
  void main() {
    // 1. TBN Frame Construction
    vec3 T = normalize(vTangent);
    vec3 S = normalize(vSide);
    vec3 baseNormal = normalize(vN);
    
    // 2. Rim + Midrib Effect
    float u = vUv.x - 0.5;
    float au = abs(u);
    
    float midSoft = 0.2;
    float mid01 = smoothstep(-midSoft, midSoft, u);
    
    float rimPos = 0.42;
    float rimSoft = 0.2;
    float rimMask = smoothstep(rimPos, rimPos + rimSoft, au);
    
    float v01 = mix(mid01, 1.0 - mid01, rimMask);
    float ny = v01 * 2.0 - 1.0;
    
    // 3. Apply Rim + Midrib to Normal
    float widthNormalStrength = 0.35;
    vec3 geoNormal = normalize(baseNormal + S * ny * widthNormalStrength);
    
    // 4. Compute Lighting Normal
    vec3 lightingNormal = computeLightingNormal(geoNormal, vToCenter, vHeight, vWorldPos);
    
    // 5. Set CSM Fragment Normal
    csm_FragNormal = lightingNormal;
    
    // 6. Color Output
    vec3 color = mix(baseColor, tipColor, vHeight);

    float ao = mix(0.4, 1.0, vHeight);
    // color *= ao;

    float tint = mix(0.5, 1.5, mod((vSeed.x * 0.8) * 23.56, 1.0));
    // color *= tint;

    // color *= vPresence;

    csm_DiffuseColor = vec4(color, 1.0);
    // csm_FragColor = vec4(color, 1.0);
    // csm_FragColor = vec4(vHeight, 0.0, 0.0, 1.0);
  }
`;

// ============================================================================
// Geometry Creation
// ============================================================================
function createGrassGeometry(): THREE.InstancedBufferGeometry {
    const bladeGeometry = new THREE.PlaneGeometry(
        BLADE_WIDTH,
        BLADE_HEIGHT,
        1,
        BLADE_SEGMENTS
    )

    bladeGeometry.translate(0, BLADE_HEIGHT / 2, 0)

    const instancedGeometry = new THREE.InstancedBufferGeometry()

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

// ============================================================================
// Component
// ============================================================================
export default function Grass() {
    const geometry = useMemo(() => createGrassGeometry(), [])
    const materialRef = useRef<any>(null)

    const { bladeHeight, bladeWidth, bendAmount, clumpSize, clumpRadius, thicknessStrength, baseColor, tipColor } = useControls('Grass', {
        bladeHeight: { value: BLADE_HEIGHT, min: 0.1, max: 2.0, step: 0.1 },
        bladeWidth: { value: BLADE_WIDTH, min: 0.01, max: 0.1, step: 0.01 },
        bendAmount: { value: 0.4, min: 0.0, max: 10.0, step: 0.1 },
        clumpSize: { value: 0.8, min: 0.1, max: 5.0, step: 0.1 },
        clumpRadius: { value: 1.5, min: 0.3, max: 2.0, step: 0.1 },
        thicknessStrength: { value: 0.02, min: 0.0, max: 0.1, step: 0.001 },
        tipColor: { value: '#3e8d2f', label: 'Tip Color' },
        baseColor: { value: '#213110', label: 'Base Color' },
    })

    const materialControls = useControls('Material', {
        roughness: { value: 0.3, min: 0.0, max: 1.0, step: 0.01 },
        metalness: { value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
        emissive: { value: '#000000', label: 'Emissive Color' },
        emissiveIntensity: { value: 0.0, min: 0.0, max: 2.0, step: 0.1 },
        envMapIntensity: { value: 1.0, min: 0.0, max: 3.0, step: 0.1 },
    })

    const emissiveColor = useMemo(() => new THREE.Color(materialControls.emissive as any), [materialControls.emissive])

    const uniforms = useRef({
        bladeHeight: { value: BLADE_HEIGHT },
        bladeWidth: { value: BLADE_WIDTH },
        bendAmount: { value: 0.4 },
        clumpSize: { value: 0.8 },
        clumpRadius: { value: 1.5 },
        thicknessStrength: { value: 0.02 },
        baseColor: { value: new THREE.Vector3(0.18, 0.35, 0.12) },
        tipColor: { value: new THREE.Vector3(0.35, 0.65, 0.28) },
    }).current

    useEffect(() => {
        uniforms.bladeHeight.value = bladeHeight
        uniforms.bladeWidth.value = bladeWidth
        uniforms.bendAmount.value = bendAmount
        uniforms.clumpSize.value = clumpSize
        uniforms.clumpRadius.value = clumpRadius
        uniforms.thicknessStrength.value = thicknessStrength
        
        // Convert Leva color (string or object) to Vector3
        const baseColorVec = new THREE.Color(baseColor as any)
        uniforms.baseColor.value.set(baseColorVec.r, baseColorVec.g, baseColorVec.b)
        
        const tipColorVec = new THREE.Color(tipColor as any)
        uniforms.tipColor.value.set(tipColorVec.r, tipColorVec.g, tipColorVec.b)
    }, [bladeHeight, bladeWidth, bendAmount, clumpSize, clumpRadius, thicknessStrength, baseColor, tipColor])


    return (
        <instancedMesh
            args={[geometry, undefined as any, GRASS_BLADES]}
            geometry={geometry}
        >
            <CustomShaderMaterial
                ref={materialRef}
                baseMaterial={THREE.MeshStandardMaterial}
                vertexShader={grassVertex}
                fragmentShader={grassFragment}
                uniforms={uniforms}
                side={THREE.DoubleSide}
                roughness={materialControls.roughness}
                metalness={materialControls.metalness}
                emissive={emissiveColor}
                emissiveIntensity={materialControls.emissiveIntensity}
                envMapIntensity={materialControls.envMapIntensity}
            />
        </instancedMesh>
    )
}
