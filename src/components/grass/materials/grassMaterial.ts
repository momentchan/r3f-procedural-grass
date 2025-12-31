import * as THREE from "three/webgpu";
import {
  Fn,
  vec3,
  vec2,
  instancedArray,
  instanceIndex,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cameraPosition,
  modelWorldMatrix,
  vec4,
  uv,
  float,
  normalize,
  select,
  floor,
  cross,
  pow,
  PI,
  mx_rotate2d,
  uniform,
  sin,
  mix,
  dot,
  mod,
  length,
  sqrt,
  oneMinus,
  step,
  smoothstep,
  varying,
  abs,
  negate,
} from "three/tsl";

/**
 * Creates a grass material with vertex shader that scales blade geometry
 * based on computed blade width and height parameters
 */
export function createGrassMaterial(
  grassData: ReturnType<typeof instancedArray>,
  positions: ReturnType<typeof instancedArray>,
  options?: {
    baseWidth?: number;
    tipThin?: number;
    windTime?: number;
    windDir?: { x: number; y: number };
    swayFreqMin?: number;
    swayFreqMax?: number;
    swayStrength?: number;
    windDistanceStart?: number;
    windDistanceEnd?: number;
    cullStart?: number;
    cullEnd?: number;
    roughness?: number;
    metalness?: number;
    emissive?: string;
    envMapIntensity?: number;
    midSoft?: number;
    rimPos?: number;
    rimSoft?: number;
  }
) {
  const baseWidth = options?.baseWidth ?? 0.35;
  const tipThin = options?.tipThin ?? 0.9;
  
  // Wind uniforms
  const uWindTime = uniform(float(options?.windTime ?? 0.0)).setName('uWindTime');
  const uWindDir = uniform(vec2(options?.windDir?.x ?? 1.0, options?.windDir?.y ?? 0.0)).setName('uWindDir');
  const uWindSwayFreqMin = uniform(float(options?.swayFreqMin ?? 0.4)).setName('uWindSwayFreqMin');
  const uWindSwayFreqMax = uniform(float(options?.swayFreqMax ?? 1.5)).setName('uWindSwayFreqMax');
  const uWindSwayStrength = uniform(float(options?.swayStrength ?? 0.1)).setName('uWindSwayStrength');
  const uWindDistanceStart = uniform(float(options?.windDistanceStart ?? 10.0)).setName('uWindDistanceStart');
  const uWindDistanceEnd = uniform(float(options?.windDistanceEnd ?? 30.0)).setName('uWindDistanceEnd');
  
  // Cull params for ground blending
  const uCullStart = uniform(float(options?.cullStart ?? 15.0)).setName('uCullStart');
  const uCullEnd = uniform(float(options?.cullEnd ?? 30.0)).setName('uCullEnd');
  
  // Width shaping uniforms
  const uMidSoft = uniform(float(options?.midSoft ?? 0.25)).setName('uMidSoft');
  const uRimPos = uniform(float(options?.rimPos ?? 0.42)).setName('uRimPos');
  const uRimSoft = uniform(float(options?.rimSoft ?? 0.03)).setName('uRimSoft');
  
  // Define varyings for passing data from vertex to fragment
  const vGeoNormal = varying(vec3(0.0)).setName('vGeoNormal');
  const vHeight = varying(float(0.0)).setName('vHeight');
  const vToCenter = varying(vec2(0.0)).setName('vToCenter');
  const vWorldPos = varying(vec3(0.0)).setName('vWorldPos');
  const vSide = varying(vec3(0.0)).setName('vSide');
  
  const material = new THREE.MeshStandardNodeMaterial();
  material.side = THREE.DoubleSide;
  
  // Apply material properties
  material.roughness = options?.roughness ?? 0.3;
  material.metalness = options?.metalness ?? 0.5;
  if (options?.emissive) {
    material.emissive = new THREE.Color(options.emissive);
  }
  material.envMapIntensity = options?.envMapIntensity ?? 0.5;

  

  const grassVertex = Fn(() => {
    // Bezier Curve Functions
    const bezier3 = (p0: any, p1: any, p2: any, p3: any, t: any) => {
      const u = float(1.0).sub(t);
      const u3 = u.mul(u).mul(u);
      const u2t = u.mul(u).mul(t);
      const ut2 = u.mul(t).mul(t);
      const t3 = t.mul(t).mul(t);
      
      return p0.mul(u3)
        .add(p1.mul(u2t).mul(3.0))
        .add(p2.mul(ut2).mul(3.0))
        .add(p3.mul(t3));
    };

    const bezier3Tangent = (p0: any, p1: any, p2: any, p3: any, t: any) => {
      const u = float(1.0).sub(t);
      const u2 = u.mul(u);
      const ut = u.mul(t);
      const t2 = t.mul(t);
      
      return p1.sub(p0).mul(u2).mul(3.0)
        .add(p2.sub(p1).mul(ut).mul(6.0))
        .add(p3.sub(p2).mul(t2).mul(3.0));
    };

    const getBezierControlPoints = (discreteType: any, height: any, bend: any) => {
      // Type 0
      const p1_type0 = vec3(0.0, height.mul(0.4), bend.mul(0.5));
      const p2_type0 = vec3(0.0, height.mul(0.75), bend.mul(0.7));
      
      // Type 1
      const p1_type1 = vec3(0.0, height.mul(0.35), bend.mul(0.6));
      const p2_type1 = vec3(0.0, height.mul(0.7), bend.mul(0.8));
      
      // Type 2
      const p1_type2 = vec3(0.0, height.mul(0.3), bend.mul(0.7));
      const p2_type2 = vec3(0.0, height.mul(0.65), bend.mul(1.0));
      
      // Select based on discreteType (0.0, 1.0, or 2.0)
      const isType0 = discreteType.equal(float(0.0));
      const isType1 = discreteType.equal(float(1.0));
      
      const p1 = select(isType0, p1_type0, select(isType1, p1_type1, p1_type2));
      const p2 = select(isType0, p2_type0, select(isType1, p2_type1, p2_type2));
      
      return { p1, p2 };
    };

    // Wind Functions
    const safeNormalize2D = (v: any) => {
      const m2 = dot(v, v);
      const len = sqrt(m2);
      const threshold = float(1e-6);
      return select(len.greaterThan(threshold), v.div(len), vec2(1.0, 0.0));
    };

    const getWindDirection = () => {
      const windDir2D = safeNormalize2D(uWindDir);
      return vec3(windDir2D.x, 0.0, windDir2D.y);
    };

    const applyWindPush = (p1: any, p2: any, p3: any, windStrength: any, height: any) => {
      const windDir = getWindDirection();
      const windScale = windStrength;
      
      const tipPush = windScale.mul(height).mul(0.25);
      const midPush1 = windScale.mul(height).mul(0.08);
      const midPush2 = windScale.mul(height).mul(0.15);
      
      const p1Pushed = p1.add(windDir.mul(midPush1));
      const p2Pushed = p2.add(windDir.mul(midPush2));
      const p3Pushed = p3.add(windDir.mul(tipPush));
      
      return { p1: p1Pushed, p2: p2Pushed, p3: p3Pushed };
    };

    const applyWindSway = (p1: any, p2: any, p3: any, windStrength: any, height: any, perBladeHash01: any, t: any, worldXZ: any) => {
      // Two directions: along wind + cross wind (adds natural "twist")
      const W = getWindDirection();
      const CW = normalize(vec3(W.z.negate(), float(0.0), W.x));
      const windDir2 = vec2(W.x, W.z);
      
      // Gust envelope (slow breathing)
      const seed = mod(perBladeHash01.mul(3.567), float(1.0));
      const gust = float(0.65).add(float(0.35).mul(sin(uWindTime.mul(0.35).add(seed.mul(6.28318)))));
      
      // Traveling wave along wind direction (big-scale flow)
      const wave = dot(worldXZ, windDir2).mul(0.15);
      
      // Per-blade frequency variation: mix between min and max based on hash
      const baseFreq = mix(uWindSwayFreqMin, uWindSwayFreqMax, seed);
      const phase = perBladeHash01.mul(6.28318).add(wave);
      
      // Low freq (main sway) + high freq (small flutter)
      const low = sin(uWindTime.mul(baseFreq).add(phase).add(t.mul(2.2)));
      const high = sin(uWindTime.mul(baseFreq.mul(5.0)).add(phase.mul(1.7)).add(t.mul(5.0)));
      
      // Amplitude: keep it small
      const amp = height.mul(windStrength);
      const swayLow = amp.mul(gust).mul(uWindSwayStrength);
      const swayHigh = amp.mul(0.8).mul(uWindSwayStrength);
      
      // Direction blend: mostly wind, a bit cross wind driven by high component
      const dir = normalize(W.add(CW.mul(high.mul(0.35))));
      
      // Apply on control points (root stable, tip strongest)
      const p1Sway = p1.add(dir.mul(low.mul(swayLow).mul(0.25).add(high.mul(swayHigh).mul(0.25).mul(0.3))));
      const p2Sway = p2.add(dir.mul(low.mul(swayLow).mul(0.55).add(high.mul(swayHigh).mul(0.55).mul(0.6))));
      const p3Sway = p3.add(dir.mul(low.mul(swayLow).mul(1.0).add(high.mul(swayHigh).mul(1.0))));
      
      return { p1: p1Sway, p2: p2Sway, p3: p3Sway };
    };

    // Get data from compute shader
    const data = grassData.element(instanceIndex);
    const instancePos = positions.element(instanceIndex);

    const width = data.get("bladeWidth").toConst("bladeWidth");
    const height = data.get("bladeHeight").toConst("bladeHeight");
    const bend = data.get("bladeBend").toConst("bladeBend");
    const bladeTypeRaw = data.get("bladeType").toConst("bladeType");
    // Convert to discrete type (0, 1, or 2) matching GLSL: floor(bladeParams.w * 3.0)
    const bladeType = floor(bladeTypeRaw.mul(3.0));
    
    // Get facing angle from compute shader (matching GLSL: facingAngle01 * PI * 2.0)
    const facingAngle01 = data.get("facingAngle01").toConst("facingAngle01");
    const facingAngle = facingAngle01.mul(360.0);
    
    // Get wind strength and per-blade hash from compute shader
    const windStrength01Raw = data.get("windStrength01").toConst("windStrength01");
    const perBladeHash01 = data.get("perBladeHash01").toConst("perBladeHash01");

    // Calculate distance for wind falloff (farther = less wind)
    // Transform instance position to world space using modelWorldMatrix
    const instancePosVec4 = vec4(instancePos.x, instancePos.y, instancePos.z, float(1.0));
    const worldBasePos = modelWorldMatrix.mul(instancePosVec4).xyz;
    const dist = length(cameraPosition.sub(worldBasePos));
    
    // Calculate wind distance falloff (1.0 = full wind at near, 0.0 = no wind at far)
    // If uWindDistanceEnd is not set (0), use full wind strength
    const windDistanceFalloff = select(
      uWindDistanceEnd.greaterThan(float(0.0)),
      oneMinus(smoothstep(uWindDistanceStart, uWindDistanceEnd, dist)),
      float(1.0)
    );
    
    // Apply distance-based wind falloff
    const windStrength01 = windStrength01Raw.mul(windDistanceFalloff);

    // Get UV coordinates (t is the position along the blade, 0.0 to 1.0)
    const uvCoords = uv();
    const t = uvCoords.y; // Position along blade (0 = base, 1 = tip)
    const s = uvCoords.x.sub(0.5).mul(2.0); // Side position (-1 to 1)

    // Bezier Control Points
    const p0 = vec3(0.0, 0.0, 0.0); // Base point
    let p3 = vec3(0.0, height, 0.0); // Tip point
    let { p1, p2 } = getBezierControlPoints(bladeType, height, bend);
    
    // Get world XZ position for wind calculations
    const worldXZ = vec2(instancePos.x, instancePos.z);
    
    // Apply Wind Effects
    const windPushed = applyWindPush(p1, p2, p3, windStrength01, height);
    const windSwayed = applyWindSway(windPushed.p1, windPushed.p2, windPushed.p3, windStrength01, height, perBladeHash01, t, worldXZ);
    p1 = windSwayed.p1;
    p2 = windSwayed.p2;
    p3 = windSwayed.p3;

    // Calculate spine (position along Bezier curve) and tangent
    const spine = bezier3(p0, p1, p2, p3, t);
    const tangent = normalize(bezier3Tangent(p0, p1, p2, p3, t));

    // TBN Frame (matching GLSL: vec3 ref = vec3(0.0, 0.0, 1.0);)
    const ref = vec3(0.0, 0.0, 1.0);
    const side = normalize(cross(ref, tangent));
    const normal = normalize(cross(side, tangent));

    // Calculate width factor (matching GLSL: (shapeT + uGeometryBaseWidth) * pow(1.0 - shapeT, uGeometryTipThin))
    const shapeT = t; // For now, shapeT = t (will differ when LOD is added)
    const widthFactor = shapeT.add(float(baseWidth)).mul(pow(float(1.0).sub(shapeT), float(tipThin)));

    // Apply width offset from spine (matching GLSL: spine + side * width * widthFactor * s)
    // For now, skip densityCompensation and finalPresence (will be added later)
    const lpos = spine.add(side.mul(width).mul(widthFactor).mul(s));

    // Apply rotation (matching GLSL: lpos.xz = rotate2D(lpos.xz, facingAngle))
    // Rotate only XZ components, preserving Y
    const lposXZ = mx_rotate2d(vec2(lpos.x, lpos.z), facingAngle);
    const lposRotated = vec3(lposXZ.x, lpos.y, lposXZ.y);

    const normalXZ = mx_rotate2d(vec2(normal.x, normal.z), facingAngle);
    const normalRotated = vec3(normalXZ.x, normal.y, normalXZ.y);

    // Rotate side vector for fragment shader
    const sideXZ = mx_rotate2d(vec2(side.x, side.z), facingAngle);
    const sideRotated = normalize(vec3(sideXZ.x, side.y, sideXZ.y));

    // Get toCenter from compute shader data
    const toCenter = data.get("toCenter").toConst("toCenter");

    // Calculate world position for fragment shader
    const position = lposRotated.add(instancePos);
    const positionWorldVec4 = modelWorldMatrix.mul(vec4(position.x, position.y, position.z, float(1.0)));
    const worldPos = positionWorldVec4.xyz;

    // Write to varyings for fragment shader
    vGeoNormal.assign(normalRotated);
    vHeight.assign(shapeT);
    vToCenter.assign(toCenter);
    vWorldPos.assign(worldPos);
    vSide.assign(sideRotated);
    
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(position);
  });

  material.vertexNode = grassVertex();

  const computeLightingNormal = Fn(([geoNormal, toCenter, height, worldPos]: [any, any, any, any]) => {
    // Clump normal: cone-shaped normal pointing towards clump center
    const clumpNormal = normalize(vec3(toCenter.x, float(0.7), toCenter.y));

    // Height mask: bottom is influenced more by the clump; top by geometry
    const heightMask = pow(float(1.0).sub(height), float(0.7));

    // Distance mask: further from the camera, blend more toward clump normal (reduces grain)
    const dist = length(cameraPosition.sub(worldPos));
    const distMask = smoothstep(float(4.0), float(12.0), dist);

    // Blend geometry normal and clump normal
    const blendFactor = heightMask.mul(distMask);
    const blendedNormal = normalize(mix(geoNormal, clumpNormal, blendFactor));

    // Ground blending: at distance, blend fully to ground up-normal
    const mixToGround = smoothstep(uCullStart, uCullEnd, dist);
    const groundNormal = vec3(0.0, 1.0, 0.0);

    return normalize(mix(blendedNormal, groundNormal, mixToGround));
  });

  // Set normal node for PBR lighting
  material.normalNode = Fn(() => {
    // Width shaping (Rim + Midrib) - matching GLSL fragment shader
    const uvCoords = uv();
    const u = uvCoords.x.sub(0.5);
    const au = abs(u);

    const mid01 = smoothstep(uMidSoft.negate(), uMidSoft, u);
    const rimMask = smoothstep(uRimPos, uRimPos.add(uRimSoft), au);
    const v01 = mix(mid01, oneMinus(mid01), rimMask);
    const ny = v01.mul(2.0).sub(1.0);

    const widthNormalStrength = float(0.35);
    const sideNorm = normalize(vSide);
    const baseNormal = normalize(vGeoNormal);
    
    // Apply width-based normal offset
    const geoNormal = normalize(baseNormal.add(sideNorm.mul(ny).mul(widthNormalStrength)));

    return computeLightingNormal(geoNormal, vToCenter, vHeight, vWorldPos);
  })();

  // Fragment shader for color (placeholder for now)
//   material.fragmentNode = Fn(() => {
//     return vec4(materialNormal, 1.0); // Simple green color for now
//   })();

  return {
    material,
    uniforms: {
      uWindTime,
      uWindDir,
      uWindSwayFreqMin,
      uWindSwayFreqMax,
      uWindSwayStrength,
      uWindDistanceStart,
      uWindDistanceEnd,
      uCullStart,
      uCullEnd,
      uMidSoft,
      uRimPos,
      uRimSoft,
    },
  };
}
