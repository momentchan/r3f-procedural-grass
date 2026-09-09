# Procedural Grass

A browser demo, built with React Three Fiber, that renders a hillside of GPU-simulated grass:
thousands of individually bent, wind-blown blades growing over a procedural terrain, with a
day-sky or a shader-noise sky behind it and a full Leva panel for tuning every part of it live.

https://github.com/user-attachments/assets/283c42c2-a126-4e54-8be9-57bf9ab736a8

## The technique

The grass is inspired by the GPU-driven approach described in the GDC talk
[Procedural Grass in 'Ghost of Tsushima'](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass)
by Eric Wohllaib (Sucker Punch Productions). Each blade is one instance of a small, curved plane,
drawn with `THREE.InstancedMesh`, and every instance's shape, colour, facing and motion is worked
out on the GPU rather than the CPU:

- A single compute pass (a fullscreen shader rendered into a WebGL2 multiple-render-target,
  `src/components/grass/shaders/grassComputeShader.glsl`) reads each blade's fixed ground position
  and writes three textures: per-blade shape (height, width, bend, blade "type"), Voronoi clump data
  (which tuft a blade belongs to, and its distance from that tuft's centre), and per-blade motion
  seeds (a facing angle already blended toward the wind, and hash values used for wind and LOD).
  Blades are grouped into clumps with a Voronoi noise field so neighbouring blades lean and colour
  together instead of looking uniformly random.
- The vertex shader (`grassVertex.glsl`) reads those textures back per instance, bends each blade
  along a cubic Bezier spine, pushes and sways it with a wind field (a slow gust envelope plus a
  travelling wave, sampled with fractal noise), aligns it to the terrain's slope, and folds vertices
  together at distance for a cheap LOD, fading blades out entirely past a cull distance.
- The fragment shader (`grassFragment.glsl`) shades each blade with a base-to-tip colour gradient,
  a rim-lit fake normal for a rounded look, ambient occlusion toward the root, and a back-light term
  so the sun rims the grass instead of flatly lighting it.
- The terrain (`src/components/Terrain.tsx`, `src/components/terrain/TerrainMath.ts`) is a displaced
  plane, height and normal both computed from the same fractional Brownian motion (FBM) noise
  function the grass reads, so blades sit flush with the ground and tilt to match its slope.

## Getting started

Verified on macOS with Node 24.15.0 and npm 11.12.1. `vite` (the build tool) requires Node
`^20.19.0` or `>=22.12.0`; there is no `.nvmrc` in this repo, so use any Node release in that range.

The project uses npm: there's no `yarn.lock` or `pnpm-lock.yaml`, and `.gitignore` excludes
`package-lock.json` (no lockfile is committed, so `npm install` resolves fresh each time).

### 1. Clone, with the submodule

Shared shader and R3F utility code lives in `packages/r3f-gist`, checked in as a git submodule. A
plain `git clone` leaves that folder empty, so pull it in with:

```bash
git clone --recurse-submodules <repo-url>
# or, if you already cloned without it:
git submodule update --init --recursive
```

### 2. Install dependencies

```bash
npm install --legacy-peer-deps
npm install postprocessing --legacy-peer-deps
```

Both lines are required, and both are worth understanding rather than just pasting:

- **`--legacy-peer-deps`**: `package.json` pins `react@^19.0.0`, which today resolves to `19.3.0`,
  but `@react-three/fiber@^9.4.0` resolves to a version whose peer range is `react ">=19 <19.3"`.
  A plain `npm install` fails with an `ERESOLVE` peer conflict over that gap.
- **`postprocessing`**: `@react-three/postprocessing` (used by `src/components/Effects.tsx`) and
  `n8ao` both import from the `postprocessing` package as a peer dependency, but `package.json`
  never lists it as a direct dependency, so it's never installed. Without it, `npm run build` fails
  immediately (`Rollup failed to resolve import "postprocessing"`), and `npm run dev` starts but
  then crashes the moment the browser loads a page that renders `<Effects />` (`Could not resolve
  "postprocessing"` from esbuild's dependency pre-bundler). Installing it directly, as above, fixes
  both. This is a real gap in `package.json`, not a documentation nuance; it's called out here
  because fixing it is a `package.json` change outside the scope of this docs pass.

### 3. Run it

```bash
npm run dev
```

Starts a Vite dev server over HTTPS (self-signed, via `@vitejs/plugin-basic-ssl`) at
`https://localhost:5173`. HTTPS is on by default because some WebGL/browser features it uses expect
a secure context; accept the browser's self-signed certificate warning to proceed.

### 4. Build and preview

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ at https://localhost:4173
```

Both verified working (after the `postprocessing` install above). The production bundle is a single
~1.7 MB JS chunk; Vite warns about this at build time, but it hasn't been split further.

`npm run lint` is also defined but not currently usable: no ESLint dependency or config file is
checked in, so it fails with `eslint: command not found`.

## Controls

- **Camera**: click and drag to orbit, scroll to dolly, via `@react-three/drei`'s `CameraControls`
  (distance and polar angle are clamped so you can't flip under the ground or fly off into space).
- **`C` key**: cycles the grass tip colour through five presets (green, grey, brown, blue, yellow),
  defined in `src/components/Grass.tsx`.
- **Leva panel** (top right, collapsed by default): every other parameter. It's organised into:
  - **Grass**: grid size and patch size (how many blades and how much ground they cover); blade
    shape (height, width, bend, and per-blade randomness); clump size and radius; yaw/angle
    controls for how blades face their clump centre; appearance (tip/base colour and colour-seed
    ranges, ambient occlusion strength, the fake-rim-normal softness and position, back-light
    strength, and the noise frequency/remap used to break up the shading); wind (direction, speed,
    strength, sway frequency, and the distance range over which wind fades out); and performance
    (the LOD fold-in range and the cull/density compensation range).
  - **Grass.Material**: roughness, metalness, emissive colour and environment map intensity on the
    grass's underlying `MeshStandardMaterial`.
  - **Terrain**: FBM amplitude, frequency, seed, and ground colour.
  - **Background**: switch between a procedural noise sphere, a physical `Sky` (with sun position,
    turbidity, Rayleigh/Mie scattering), or none.
  - **Directional Light**: colour, intensity, orbit speed, and a debug helper toggle.
  - **Effects**: SMAA anti-aliasing, depth of field (focus distance/range, bokeh scale), bloom
    (intensity, threshold, smoothing), and tone mapping, each independently toggleable.

## Source map

```
index.html                          # entry HTML, loads src/index.jsx
src/
  index.jsx                         # React root
  app/App.tsx                       # scene composition: camera, light, background, terrain, grass, effects
  components/
    Grass.tsx                       # the grass instanced mesh: Leva controls, uniforms, compute-pass wiring
    grass/
      constants.ts                  # grid size, patch size, blade segment count
      utils.ts                      # per-blade ground positions + the matching InstancedBufferGeometry
      hooks/useGrassCompute.ts      # the GPGPU compute pass (WebGL2 multiple render targets)
      shaders/
        grassComputeShader.glsl     # per-blade shape/clump/motion data, written to 3 textures
        grassVertex.glsl            # blade bending, wind, terrain alignment, LOD folding, culling
        grassFragment.glsl          # blade shading: gradient colour, rim normal, AO, back-light
    Terrain.tsx                     # the displaced ground plane and its material
    terrain/TerrainMath.ts          # shared FBM height/normal functions (grass and terrain both use this)
    DirectionalLight.tsx            # the orbiting sun light
    Effects.tsx                     # SMAA / depth of field / bloom / tone mapping post-processing chain
    background/
      Background.tsx                # picks between Sky and ProceduralSphere (the one App.tsx actually renders)
      ProceduralSphere.tsx          # animated noise-shaded sky sphere
      Sky.tsx                       # wraps drei's physical Sky
packages/r3f-gist/                  # git submodule: shared noise/math GLSL includes and small R3F utilities
public/                             # static assets (favicon; models/ and textures/ are currently empty)
```

Note: `src/components/Background.tsx` also exists at the top level and looks like a near-duplicate
of `src/components/background/Background.tsx`, but nothing imports it; `App.tsx` imports the one
under `background/`.

## Licence

MIT, see [LICENSE](LICENSE). If you use this project in your own work, the author asks for credit:

**Author:** Ming-Jyun Hung ([mingjyunhung.com](https://mingjyunhung.com/))
