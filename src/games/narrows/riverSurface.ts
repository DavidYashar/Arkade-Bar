import {
  BufferAttribute, BufferGeometry, Camera, DynamicDrawUsage, LinearFilter, Mesh, RepeatWrapping,
  Scene, ShaderMaterial, TextureLoader, Vector4, WebGLRenderer,
} from 'three';
import { WAKE_ATLAS_PATH, WAKE_COLUMNS, WAKE_FRAMES, type BoatWake } from './boatWake';
import { islandBanks, islandsBetween } from './river';
import type { RiverRow } from './riverbankView';

type Project = (x: number, depth: number) => [number, number];
const COLUMNS = 25;
const MAX_WAKES = 8;
const vertexShader = /* glsl */ `
  attribute vec4 river;
  uniform vec2 board;
  varying vec4 surface;
  varying float distanceFade;
  void main() {
    surface = river;
    float w = position.z;
    distanceFade = w;
    vec2 ndc = position.xy / board * vec2(2.0, -2.0) + vec2(-1.0, 1.0);
    gl_Position = vec4(ndc * w, 0.0, w);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D slopes;
  uniform vec2 pixelScale;
  uniform sampler2D foamAtlas;
  uniform vec2 board;
  uniform float mapReady;
  uniform float time;
  uniform int wakeCount;
  uniform vec4 wakePose[${MAX_WAKES}];
  uniform vec4 wakeShape[${MAX_WAKES}];
  uniform float wakeLead[${MAX_WAKES}];
  varying vec4 surface;
  varying float distanceFade;

  vec3 wave(vec2 p) { return texture2D(slopes, p).rgb * 2.0 - 1.0; }

  vec4 foamFrame(vec2 uv, float frame) {
    const float columns = ${WAKE_COLUMNS}.0;
    const float rows = ${WAKE_FRAMES / WAKE_COLUMNS}.0;
    vec2 cell = vec2(mod(frame, columns), floor(frame / columns));
    vec2 atlasUV = (cell + (vec2(.5) + uv * 255.0) / 256.0) / vec2(columns, rows);
    return texture2D(foamAtlas, vec2(atlasUV.x, 1.0 - atlasUV.y));
  }

  vec3 boatFoam(vec3 water) {
    vec2 pixel = vec2(gl_FragCoord.x * pixelScale.x, board.y - gl_FragCoord.y * pixelScale.y);
    for (int i = 0; i < ${MAX_WAKES}; ++i) {
      if (i >= wakeCount) break;
      vec4 pose = wakePose[i];
      vec4 shape = wakeShape[i];
      vec2 relative = pixel - pose.xy;
      vec2 aft = pose.zw;
      vec2 uv = vec2(.5 + dot(relative, vec2(aft.y, -aft.x)) / shape.x,
        (dot(relative, aft) + wakeLead[i]) / shape.y);
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
      float first = floor(shape.z);
      vec4 foam = mix(foamFrame(uv, first), foamFrame(uv, mod(first + 1.0, ${WAKE_FRAMES}.0)), fract(shape.z));
      water = mix(water, foam.rgb, foam.a * shape.w);
    }
    return water;
  }

  vec3 patchHash(vec2 cell) {
    vec3 p = fract(vec3(cell.xyx) * vec3(.1031, .1030, .0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yzz) * p.zyx);
  }

  vec3 patchWave(vec2 cell, vec2 uv, vec2 dx, vec2 dy) {
    vec3 seed = patchHash(cell);
    float angle = (seed.z - .5) * 2.8;
    float c = cos(angle);
    float s = sin(angle);
    mat2 turn = mat2(c, s, -s, c);
    float zoom = mix(.72, 1.43, seed.x);
    vec3 sampleWave = textureGrad(slopes, turn * uv * zoom + seed.xy,
      turn * dx * zoom, turn * dy * zoom).rgb * 2.0 - 1.0;
    // Keep the sampled slopes aligned with the river after rotating the texture.
    sampleWave.xy = transpose(turn) * sampleWave.xy;
    return sampleWave * mix(.73, 1.30, seed.y);
  }

  vec3 blendedWave(vec2 grid, vec2 uv, vec2 seedOffset) {
    vec2 cell = floor(grid);
    vec2 f = fract(grid);
    bool lower = f.x + f.y < 1.0;
    vec2 corner = lower ? vec2(0.0) : vec2(1.0);
    vec3 weights = lower ? vec3(1.0 - f.x - f.y, f.x, f.y) : vec3(f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x);
    weights *= weights;
    weights *= inversesqrt(dot(weights, weights));
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    cell += seedOffset;
    // Neighboring triangles share samples and fade the outgoing patch to zero at their edge.
    return patchWave(cell + corner, uv, dx, dy) * weights.x
      + patchWave(cell + vec2(1.0, 0.0), uv, dx, dy) * weights.y
      + patchWave(cell + vec2(0.0, 1.0), uv, dx, dy) * weights.z;
  }

  void main() {
    vec2 p = surface.xy;
    float shore = max(0.0, surface.z);
    float shallows = 1.0 - smoothstep(3.0, 62.0, shore);
    float current = mix(1.0, .48, shallows);
    vec2 flow = vec2(surface.w, current);
    vec2 bend = vec2(sin(p.y * .018 + cos(p.x * .022)), sin(p.x * .030 + sin(p.y * .011)));
    vec2 grid = (p + bend * 28.0) / vec2(125.0, 162.0);
    grid.x += grid.y * .53;
    vec2 q = p + bend * 9.0 + flow * (time * 16.0);
    vec3 broad = blendedWave(grid, q / vec2(132.0, 158.0), vec2(11.0, 23.0));
    vec3 middle = blendedWave(grid * 1.39 + vec2(.37, .61),
      (q + flow * (time * 7.0)) / vec2(62.0, 82.0) + broad.xy * .12, vec2(47.0, 9.0));
    vec3 tiny = wave((q + flow * (time * 11.0)) / vec2(30.0, 42.0) + .24 * middle.xy);
    vec2 slope = mapReady * (.58 * broad.xy + .38 * middle.xy + .23 * tiny.xy);
    slope += .095 * vec2(
      sin(dot(p, vec2(.071, .094)) + time * 1.5) + .49 * sin(dot(p, vec2(.162, -.089)) - time * 2.5),
      cos(dot(p, vec2(-.063, .127)) + time * 2.2)
    );
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

    float horizon = smoothstep(.82, 1.98, distanceFade);
    vec3 view = normalize(vec3(-.06, mix(.87, .54, horizon), -.67));
    vec3 reflected = reflect(-view, normal);
    float skyAngle = max(0.0, reflected.y);
    float facing = max(0.0, dot(normal, view));
    float fresnel = .045 + .955 * pow(1.0 - facing, 4.0);
    vec3 sky = mix(vec3(.66, .79, .87), vec3(.20, .41, .59), smoothstep(.02, .93, skyAngle));
    float brightSky = smoothstep(-.23, .31, reflected.x + reflected.z * .26);
    sky *= mix(.62, 1.26, brightSky);
    vec3 light = normalize(vec3(-.40, .57, .72));
    float reflectedLight = max(0.0, dot(reflected, light));
    float glint = pow(reflectedLight, 18.0) * .31 + pow(reflectedLight, 77.0) * .64;

    float bed = .5 + .5 * (broad.z * .60 + wave(p / 42.0 + slope * .045).z * .40) * mapReady;
    vec3 deep = mix(vec3(.024, .146, .212), vec3(.057, .241, .303), bed);
    vec3 sand = mix(vec3(.11, .31, .29), vec3(.29, .53, .43), bed);
    vec3 water = mix(deep, sand, shallows * .81);
    water *= .84 + .42 * max(0.0, dot(normal, light));
    water = mix(water, sky, .19 + fresnel * .69 + .12 * horizon);
    water += vec3(.76, .88, 1.0) * glint;

    float brokenCrests = broad.z * .49 + middle.z * .36 + tiny.z * .23;
    float foam = smoothstep(.37, .59, brokenCrests + .13 * max(0.0, slope.y));
    foam *= .48 * (1.0 - smoothstep(2.0, 23.0, shore)) + .26 * abs(surface.w);
    water = mix(water, vec3(.73, .87, .91), foam * mapReady);
    water = boatFoam(water);
    gl_FragColor = vec4(clamp(water, 0.0, 1.0), 1.0);
  }
`;

class RiverSurface {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new Camera();
  private readonly scene = new Scene();
  private readonly geometry = new BufferGeometry();
  private foamReady = false;
  private readonly material = new ShaderMaterial({
    vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    uniforms: {
      slopes: { value: null }, mapReady: { value: 0 }, time: { value: 0 }, board: { value: [1, 1] },
      pixelScale: { value: [1, 1] },
      foamAtlas: { value: null }, wakeCount: { value: 0 },
      wakePose: { value: Array.from({ length: MAX_WAKES }, () => new Vector4()) },
      wakeShape: { value: Array.from({ length: MAX_WAKES }, () => new Vector4()) },
      wakeLead: { value: new Float32Array(MAX_WAKES) },
    },
  });

  constructor(canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
    this.renderer = new WebGLRenderer({ canvas, context, alpha: true });
    const surface = new Mesh(this.geometry, this.material);
    surface.frustumCulled = false;
    this.scene.add(surface);
    this.renderer.setClearColor(0, 0);
    new TextureLoader().load('/textures/narrows-water-slopes.png', (texture) => {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      this.material.uniforms.slopes!.value = texture;
      this.material.uniforms.mapReady!.value = 1;
    });
    new TextureLoader().load(WAKE_ATLAS_PATH, (texture) => {
      texture.minFilter = LinearFilter;
      texture.generateMipmaps = false;
      this.material.uniforms.foamAtlas!.value = texture;
      this.foamReady = true;
    });
  }

  draw(ctx: CanvasRenderingContext2D, distance: number, range: number, time: number,
    project: Project, rows: RiverRow[], wakes: readonly BoatWake[],
    boardWidth?: number, boardHeight?: number) {
    if (this.renderer.getContext().isContextLost()) return false;
    const { width, height } = ctx.canvas;
    if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
      this.renderer.setSize(width, height, false);
    }
    const boardW = boardWidth ?? width;
    const boardH = boardHeight ?? height;
    const uniforms = this.material.uniforms;
    uniforms.board!.value = [boardW, boardH];
    uniforms.pixelScale!.value = [boardW / width, boardH / height];
    uniforms.time!.value = time;
    const count = this.foamReady ? Math.min(wakes.length, MAX_WAKES) : 0;
    uniforms.wakeCount!.value = count;
    for (let i = 0; i < count; i++) {
      const wake = wakes[i]!;
      (uniforms.wakePose!.value as Vector4[])[i]!.set(wake.x, wake.y, wake.aftX, wake.aftY);
      (uniforms.wakeShape!.value as Vector4[])[i]!.set(wake.width, wake.length, wake.frame, wake.opacity);
      uniforms.wakeLead!.value[i] = wake.bowLead;
    }
    this.updateSurface(distance, range, project, rows);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, boardW, boardH);
    return true;
  }

  private updateSurface(distance: number, range: number, project: Project, rows: RiverRow[]) {
    const count = rows.length * COLUMNS;
    let positions = this.geometry.getAttribute('position') as BufferAttribute | undefined;
    let river = this.geometry.getAttribute('river') as BufferAttribute | undefined;
    if (positions?.count !== count || !river) {
      positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
      river = new BufferAttribute(new Float32Array(count * 4), 4).setUsage(DynamicDrawUsage);
      this.geometry.setAttribute('position', positions);
      this.geometry.setAttribute('river', river);
      const indices: number[] = [];
      for (let row = 1; row < rows.length; row++) {
        for (let column = 1; column < COLUMNS; column++) {
          const a = (row - 1) * COLUMNS + column - 1;
          const b = a + COLUMNS;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      this.geometry.setIndex(indices);
    }
    const islands = islandsBetween(distance - range * .24, distance + range * 1.11);
    for (let i = 0; i < rows.length; i++) {
      const { river: { center, half }, depth, z } = rows[i]!;
      const island = islands.find(({ start, end }) => z >= start - 52 && z <= end + 31);
      const banks = island && islandBanks(island, z);
      const tipDistance = island ? Math.max(0, island.start - z, z - island.end) : 0;
      for (let j = 0; j < COLUMNS; j++) {
        const across = j / (COLUMNS - 1) * 2 - 1;
        const x = center + half * across;
        const [sx, sy] = project(x, depth);
        let shore = half * (1 - Math.abs(across));
        let wake = 0;
        if (banks && island) {
          const islandEdge = Math.max(0, banks.left - x, x - banks.right);
          shore = Math.min(shore, Math.hypot(islandEdge, tipDistance * 1.7));
          const fade = Math.max(0, 1 - tipDistance / 52) * Math.max(0, 1 - islandEdge / 41);
          const sign = x < (banks.left + banks.right) / 2 ? -1 : 1;
          wake = sign * fade * (z < island.start ? -.72 : .32);
        }
        positions.setXYZ(i * COLUMNS + j, sx, sy, 1 + .95 * depth);
        river.setXYZW(i * COLUMNS + j, x, z, shore, wake);
      }
    }
    positions.needsUpdate = river.needsUpdate = true;
  }
}

let surface: RiverSurface | null | undefined;

export function drawThreeRiver(ctx: CanvasRenderingContext2D, distance: number, range: number,
  time: number, project: Project, rows: RiverRow[], wakes: readonly BoatWake[],
  boardWidth?: number, boardHeight?: number) {
  if (surface === undefined && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      surface = gl ? new RiverSurface(canvas, gl) : null;
    } catch {
      surface = null;
    }
  }
  return surface?.draw(ctx, distance, range, time, project, rows, wakes, boardWidth, boardHeight) ?? false;
}
