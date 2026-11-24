import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { MeshBasicMaterial } from 'three';
import { BRICK_BLITZ_AT, JUKEBOX_AT, PINBALL_AT } from './colliders';

const ON_SECONDS = 2;
const OFF_SECONDS = 0.5;
const LETTERS: Record<string, string> = {
  P: 'M1 58V1H27C47 1 47 31 27 31H1',
  I: 'M21 1V58',
  N: 'M1 58V1L42 58V1',
  B: 'M1 1V58H27C50 58 50 29 27 29H1M1 1H26C46 1 46 29 26 29',
  A: 'M1 58L22 1L43 58M9 38H35',
  L: 'M1 1V58H42',
};

function pinballTubes() {
  const lettering = new Path2D();
  [...'PINBALL'].forEach((letter, index) => {
    lettering.addPath(new Path2D(LETTERS[letter]), new DOMMatrix().translate(96 + index * 61, 137));
  });
  return [
    {
      color: '#24d5ff', core: '#d4faff', unlit: '#274453',
      path: new Path2D('M101 108V94Q101 68 127 68H473Q499 68 499 94V108 M101 225V260Q101 289 129 300L277 356Q300 366 323 356L471 300Q499 289 499 260V225'),
    },
    { color: '#ff46b9', core: '#ffd9f5', unlit: '#50354b', path: lettering },
    {
      color: '#9e8bff', core: '#f2edff', unlit: '#3d3955',
      path: new Path2D('M243 294L158 267Q141 261 147 246Q154 231 170 239L251 281Q262 287 255 296Q251 301 243 294Z M357 294L442 267Q459 261 453 246Q446 231 430 239L349 281Q338 287 345 296Q349 301 357 294Z'),
    },
    {
      color: '#ffb82b', core: '#fff0ad', unlit: '#584629',
      path: new Path2D('M327 244A27 27 0 1 1 273 244A27 27 0 1 1 327 244Z M287 244A13 13 0 0 1 300 231'),
    },
  ];
}

function rescueBoatTubes(): Tube[] {
  const hull = new Path2D('M300 36C356 74 386 150 390 240C394 330 388 420 380 468C374 500 350 516 320 516L280 516C250 516 226 500 220 468C212 420 206 330 210 240C214 150 244 74 300 36');
  hull.addPath(new Path2D('M248 214H352L370 268H230Z'));
  hull.addPath(new Path2D('M214 300H386'));
  hull.addPath(new Path2D('M272 434H328Q336 434 336 442V476Q336 484 328 484H272Q264 484 264 476V442Q264 434 272 434Z'));
  hull.addPath(new Path2D('M288 484H312V504H288Z'));
  // the lamp on the cabin roof
  hull.addPath(new Path2D('M286 196Q286 176 300 176Q314 176 314 196Z'));
  hull.addPath(new Path2D('M300 168V158M282 176L274 168M318 176L326 168'));
  // life ring
  const ring = new Path2D();
  ring.arc(300, 356, 44, 0, Math.PI * 2);
  ring.addPath(new Path2D('M300 312V400M256 356H344'));

  const glass = new Path2D('M256 226H344L358 258H242Z');
  glass.addPath(new Path2D('M150 296C118 378 100 468 122 542'));
  glass.addPath(new Path2D('M180 330C162 400 150 470 166 532'));
  glass.addPath(new Path2D('M450 296C482 378 500 468 478 542'));
  glass.addPath(new Path2D('M420 330C438 400 450 470 434 532'));
  glass.addPath(new Path2D('M268 512C258 540 252 560 250 580'));
  glass.addPath(new Path2D('M332 512C342 540 348 560 350 580'));

  const trim = new Path2D('M330 116L352 150');
  trim.addPath(new Path2D('M280 448H320M280 462H320'));

  return [
    { color: '#ff9a1e', core: '#fff2c8', unlit: '#5a3a1c', path: hull },
    { color: '#38e2e8', core: '#dcfeff', unlit: '#2b4a50', path: glass },
    { color: '#f4f6ff', core: '#ffffff', unlit: '#4a4a52', path: trim },
    { color: '#ff9a1e', core: '#fff2c8', unlit: '#5a3a1c', path: ring },
  ];
}

function brickBlitzTubes() {
  function bricks(positions: [number, number, number][]) {
    const path = new Path2D();
    for (const [x, y, width] of positions) path.roundRect(x, y, width, 32, 7);
    return path;
  }

  const blue = bricks([[117, 229, 78], [204, 229, 78], [405, 229, 78]]);
  blue.addPath(new Path2D('M331 302A26 26 0 1 1 279 302A26 26 0 1 1 331 302Z M290 331L209 390 M278 322L226 365 M306 338L234 391'));
  blue.roundRect(174, 401, 252, 39, 19.5);

  const amber = bricks([[116, 186, 63], [188, 186, 68], [265, 186, 71],
    [345, 186, 69], [423, 186, 60], [331, 262, 72]]);
  amber.addPath(new Path2D('M326 257L312 240 M338 253L332 231 M351 253L373 219 M365 254L386 241 M355 305L366 329 M375 301L396 316'));

  return [
    {
      color: '#ac26ff', core: '#f8ceff', unlit: '#463359',
      path: new Path2D('M134 444Q98 424 98 388V162Q98 101 159 101H441Q502 101 502 162V388Q502 424 466 444 M153 455L226 495Q238 501 254 501H346Q362 501 374 495L447 455'),
    },
    { color: '#ff38c7', core: '#ffe0f6', unlit: '#50354b',
      path: bricks([[142, 142, 71], [222, 142, 71], [302, 142, 71], [382, 142, 71]]) },
    { color: '#ff970c', core: '#fff1b3', unlit: '#584629', path: amber },
    { color: '#12beff', core: '#d9faff', unlit: '#274453', path: blue },
    { color: '#a96bff', core: '#f3e2ff', unlit: '#3d3955',
      path: bricks([[117, 273, 78], [426, 273, 57]]) },
  ];
}

type Tube = ReturnType<typeof pinballTubes>[number];

function blackjackTubes(): Tube[] {
  return [
    {
      color: '#b9d0ff', core: '#fff8eb', unlit: '#4a4350',
      path: new Path2D(
        'M190 79L113 127Q104 133 110 144L179 254Q184 263 195 257L237 231 ' +
        'M336 61L209 43Q198 41 196 52L174 206Q173 217 184 219L238 227 ' +
        'M351 57L486 83Q498 85 495 98L464 252Q462 264 450 262L314 236Q302 233 304 221L335 67Q337 55 351 57Z ' +
        'M218 107L236 71L245 111M223 97L242 100 ' +
        'M354 111L360 81M378 85L357 98L373 115 ' +
        'M446 209L440 239M422 235L443 222L427 205',
      ),
    },
    {
      color: '#fd427b', core: '#ffe2ed', unlit: '#573039',
      path: new Path2D('M393 196C378 177 357 164 364 146C370 129 392 128 403 147C421 133 442 145 440 162C437 183 410 188 393 196Z'),
    },
    {
      color: '#51dbff', core: '#d8faff', unlit: '#274453',
      path: new Path2D('M250 139L266 119L279 143L260 164Z M82 180H62 M89 199L73 208 M525 121H546 M520 102L537 93'),
    },
  ];
}

export function BlackjackNeon({ width, offset }: { width: number; offset: number }) {
  const designHeight = 300;
  const textures = useNeonTextures(blackjackTubes, designHeight);
  const front = useRef<MeshBasicMaterial>(null);
  const back = useRef<MeshBasicMaterial>(null);

  useNeonCycle((lit) => {
    const texture = lit ? textures.on : textures.off;
    if (front.current) front.current.map = texture;
    if (back.current) back.current.map = texture;
  });

  return [1, -1].map((side) => (
    <mesh key={side} position={[0, 0, side * offset]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
      <planeGeometry args={[width, width * designHeight / 600]} />
      <meshBasicMaterial ref={side === 1 ? front : back} map={textures.on} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  ));
}

function dartsTubes(): Tube[] {
  const tilt = new DOMMatrix().translate(300, 160).rotate(-27).translate(-300, -160);
  function tilted(outline: string) {
    const path = new Path2D();
    path.addPath(new Path2D(outline), tilt);
    return path;
  }

  return [
    {
      color: '#70f34f', core: '#e5ffcf', unlit: '#354d2b',
      path: tilted('M235 160C205 139 194 111 154 104Q125 99 112 113C100 126 109 148 122 160C105 173 103 195 115 209Q127 223 157 215C195 205 211 182 235 160H320 M122 160Q170 140 235 160Q167 180 122 160'),
    },
    {
      color: '#ffad31', core: '#fff0bf', unlit: '#594529',
      path: tilted('M328 146H405Q419 146 419 160Q419 174 405 174H328Q315 174 315 160Q315 146 328 146Z M344 152V168 M361 152V168 M378 152V168 M395 152V168'),
    },
    {
      color: '#42dcff', core: '#ddfaff', unlit: '#2b4651',
      path: tilted('M419 157L492 160L419 163 M73 141H93 M60 160H96 M76 178H93'),
    },
  ];
}

function renderSignTexture(tubes: Tube[], height: number, lit: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = Math.round(height * 2.56);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2.56, 2.56);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const tube of tubes) {
    if (lit) {
      ctx.shadowColor = tube.color;
      ctx.shadowBlur = 52;
      ctx.strokeStyle = tube.color;
      ctx.lineWidth = 7;
      ctx.stroke(tube.path);
      ctx.shadowBlur = 19;
      ctx.stroke(tube.path);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = lit ? tube.core : tube.unlit;
    ctx.lineWidth = lit ? 3 : 5;
    ctx.stroke(tube.path);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function jukeboxTubes(): Tube[] {
  return [{
    color: '#ff2929', core: '#ffe6df', unlit: '#503331',
    path: new Path2D(
      'M124 253C138 159 198 99 258 79Q274 74 278 99Q282 122 300 122Q318 122 322 99Q326 74 342 79C402 99 462 159 476 253 ' +
      'M151 257C164 174 211 126 263 107 M337 107C389 126 436 174 449 257 ' +
      'M111 274Q113 286 126 286H169 M111 295Q113 307 126 307H169 M431 286H474Q487 286 489 274 M431 307H474Q487 307 489 295 ' +
      'M129 325V517 M155 325V521 M445 325V521 M471 325V517 ' +
      'M124 602Q131 617 158 614H442Q469 617 476 602 M129 617V636Q130 652 149 652H164Q177 652 186 633H414Q423 652 436 652H451Q470 652 471 636V617',
    ),
  }, {
    color: '#35f078', core: '#d9ffe4', unlit: '#2b4b36',
    path: new Path2D(
      'M219 376V484C219 542 252 574 300 574C348 574 381 542 381 484V376 ' +
      'M376 278A76 76 0 1 0 224 278A76 76 0 1 0 376 278Z',
    ),
  }];
}

type WallNeonProps = {
  name: string;
  position: [number, number, number];
  rotation: number;
  width: number;
  designHeight: number;
  draw: () => Tube[];
};

function useNeonTextures(draw: () => Tube[], designHeight: number) {
  const textures = useMemo(() => {
    const tubes = draw();
    return {
      on: renderSignTexture(tubes, designHeight, true),
      off: renderSignTexture(tubes, designHeight, false),
    };
  }, [draw, designHeight]);
  useEffect(() => () => {
    textures.on.dispose();
    textures.off.dispose();
  }, [textures]);
  return textures;
}

function useNeonCycle(update: (lit: boolean) => void) {
  const startedAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime;
    const lit = (clock.elapsedTime - startedAt.current) % (ON_SECONDS + OFF_SECONDS) < ON_SECONDS;
    update(lit);
  });
}

function WallNeon({ name, position, rotation, width, designHeight, draw }: WallNeonProps) {
  const textures = useNeonTextures(draw, designHeight);
  const material = useRef<MeshBasicMaterial>(null);

  useNeonCycle((lit) => {
    if (material.current) material.current.map = lit ? textures.on : textures.off;
  });

  return (
    <group name={name} position={position} rotation={[0, rotation, 0]}>
      <mesh>
        <planeGeometry args={[width, width * designHeight / 600]} />
        <meshBasicMaterial ref={material} map={textures.on} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function PinballNeon() {
  return <WallNeon name="Pinball wall neon" position={[-6.795, 2.79, PINBALL_AT[1]]}
    rotation={Math.PI / 2} width={2.36} designHeight={400} draw={pinballTubes} />;
}

export function RescueBoatNeon() {
  return <WallNeon name="Rescue Boat wall neon" position={[-6.795, 2.60, -1.28]}
    rotation={Math.PI / 2} width={1.98} designHeight={620} draw={rescueBoatTubes} />;
}

export function BrickBlitzNeon() {
  return <WallNeon name="Brick Blitz wall neon" position={[6.795, 2.49, BRICK_BLITZ_AT[1]]}
    rotation={-Math.PI / 2} width={2.28} designHeight={600} draw={brickBlitzTubes} />;
}

export function JukeboxNeon() {
  // Center the neon above the hologram, just in front of the ceiling trim.
  return <WallNeon name="Jukebox wall neon" position={[6.73, 3.40, JUKEBOX_AT[1]]}
    rotation={-Math.PI / 2} width={.74} designHeight={720} draw={jukeboxTubes} />;
}

export function DartsNeon({ wallX, boardZ }: { wallX: number; boardZ: number }) {
  return <WallNeon name="Darts wall neon" position={[wallX - .065, 3.12, boardZ - .33]}
    rotation={-Math.PI / 2} width={1.5} designHeight={320} draw={dartsTubes} />;
}
