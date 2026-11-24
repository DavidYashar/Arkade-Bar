import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type VehicleSprite = { canvas: HTMLCanvasElement; muzzleX: number; muzzleY: number };
type CannonPart = VehicleSprite & { pivotX: number; pivotY: number };
export type CannonSprites = { carriage: CannonPart; barrel: CannonPart };
export type EnemySprites = {
  patrol: VehicleSprite | null;
  helicopter: [VehicleSprite[], VehicleSprite[]] | null;
  cannon: CannonSprites | null;
  helicopterShadow: [VehicleSprite, VehicleSprite] | null;
  cannonShadow: VehicleSprite | null;
  bridge: { canvas: HTMLCanvasElement; aspect: number } | null;
};

/**
 * The boat, rendered off screen in its own tiny webgl view and then painted into
 * the game as one flat image. Keeps the canyon a 2d canvas while the boat is a
 * real model.
 */
export class BoatView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private boat: THREE.Object3D | null = null;
  private muzzle: THREE.Object3D | undefined;
  private muzzlePosition = new THREE.Vector3();
  private disposed = false;
  readonly enemies: EnemySprites = {
    patrol: null, helicopter: null, cannon: null, helicopterShadow: null, cannonShadow: null, bridge: null,
  };

  constructor({ antialias = true }: { antialias?: boolean } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 320;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(320, 320, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.camera = new THREE.PerspectiveCamera(41, 1, 0.1, 40);
    this.camera.position.set(0, 3.05, 3.45);
    this.camera.lookAt(0, .28, -.06);

    const key = new THREE.DirectionalLight('#dcefff', 3.2);
    key.position.set(-1.4, 2.6, 1.2);
    this.scene.add(key);

    const warm = new THREE.DirectionalLight('#ffb27a', 1.1);
    warm.position.set(1.8, 0.9, -1.4);
    this.scene.add(warm);

    this.scene.add(new THREE.HemisphereLight('#9fd0e0', '#0a1420', 1.4));

    const loader = new GLTFLoader();
    loader.load('/models/bar/rescue-boat.glb', (gltf) => {
      if (this.disposed) return;
      this.boat = gltf.scene;
      this.muzzle = this.boat.getObjectByName('Muzzle');
      this.scene.add(this.boat);
    });
    loader.load('/models/bar/narrows-patrol-boat.glb', ({ scene: patrol }) => {
      if (this.disposed) return;
      patrol.rotation.y = Math.PI;
      // Match the player silhouette at the same river depth.
      patrol.scale.set(1.30, .94, .94);
      this.enemies.patrol = this.capture(patrol);
    });
    loader.load('/models/bar/narrows-helicopter.glb', ({ scene: helicopter }) => {
      if (this.disposed) return;
      const rotor = helicopter.getObjectByName('Main_Rotor');
      helicopter.scale.setScalar(.70);
      const frames = (angle: number) => {
        helicopter.rotation.y = angle;
        return Array.from({ length: 4 }, (_, i) => {
          if (rotor) rotor.rotation.y = i * Math.PI / 8;
          return this.capture(helicopter);
        });
      };
      this.enemies.helicopter = [frames(Math.PI * .41), frames(-Math.PI * .41)];
      const cast = (angle: number) => {
        helicopter.rotation.y = angle;
        if (rotor) rotor.rotation.y = 0;
        return this.captureShadow(helicopter, 4.8);
      };
      this.enemies.helicopterShadow = [cast(Math.PI * .41), cast(-Math.PI * .41)];
    });
    loader.load('/models/bar/narrows-bridge.glb', ({ scene }) => {
      if (this.disposed) return;
      const camera = new THREE.OrthographicCamera(-4.6, 4.6, 2.9, -2.9, .1, 40);
      camera.position.set(0, 7.6, 5.0);
      camera.lookAt(0, .25, 0);
      this.enemies.bridge = this.captureSize(scene, camera, 1400, 760);
    });

    loader.load('/models/bar/narrows-cannon.glb', ({ scene }) => {
      if (this.disposed) return;
      const carriage = scene.getObjectByName('Carriage');
      const barrel = scene.getObjectByName('Barrel');
      if (!carriage || !barrel) return;
      // keep an untouched copy, before the parts are moved for their sprite shots
      const assembled = scene.clone(true);

      const carriageCamera = new THREE.OrthographicCamera(-1.85, 1.85, 1.85, -1.85, .1, 20);
      carriageCamera.position.set(.65, 3.1, 4.7);
      carriageCamera.lookAt(0, .4, 0);
      // A side-on orthographic view keeps the pivot and muzzle on the same
      // line when the barrel image is rotated and fitted to the gameplay aim.
      const barrelCamera = new THREE.OrthographicCamera(-1.625, 1.625, 1.625, -1.625, .1, 20);
      barrel.position.set(0, 0, 0);
      barrel.rotation.set(0, 0, 0);
      barrelCamera.position.set(.54, 0, 5);
      barrelCamera.lookAt(.54, 0, 0);
      this.enemies.cannon = {
        carriage: this.capture(carriage, carriageCamera, 'Carriage_Pivot'),
        barrel: this.capture(barrel, barrelCamera, 'Barrel_Pivot'),
      };

      // the shadow is cast by the assembled gun, from straight above
      this.enemies.cannonShadow = this.captureShadow(assembled, 2.6);
    });
  }

  /** Silhouette from straight above, softened, so the game can lay it on the water. */
  private captureShadow(model: THREE.Object3D, size: number): VehicleSprite {
    const swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      swapped.push([mesh, mesh.material]);
      mesh.material = black;
    });

    const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, .1, 80);
    camera.position.set(0, 40, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const flat = this.capture(model, camera);

    for (const [mesh, material] of swapped) mesh.material = material;
    black.dispose();

    // soften the edge once here, rather than blurring every frame in the game
    const soft = document.createElement('canvas');
    soft.width = flat.canvas.width;
    soft.height = flat.canvas.height;
    const ctx = soft.getContext('2d');
    if (ctx) {
      ctx.filter = 'blur(2.5px)';
      ctx.drawImage(flat.canvas, 0, 0);
    }
    return { ...flat, canvas: soft };
  }

  /** A one off render at a larger size, for the bridge which needs the detail. */
  private captureSize(model: THREE.Object3D, camera: THREE.Camera, width: number, height: number) {
    const boat = this.boat;
    if (boat) boat.visible = false;
    this.scene.add(model);
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(this.renderer.domElement, 0, 0);
    this.scene.remove(model);
    this.renderer.setSize(320, 320, false);
    if (boat) boat.visible = true;
    return { canvas, aspect: width / height };
  }

  private capture(model: THREE.Object3D, camera: THREE.Camera = this.camera, pivotName?: string): CannonPart {
    const visible = this.boat?.visible;
    if (this.boat) this.boat.visible = false;
    this.scene.add(model);
    this.renderer.render(this.scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    canvas.getContext('2d')?.drawImage(this.canvas, 0, 0);
    const muzzle = model.getObjectByName('Muzzle')?.getWorldPosition(new THREE.Vector3()).project(camera);
    const pivot = pivotName && model.getObjectByName(pivotName)?.getWorldPosition(new THREE.Vector3()).project(camera);
    const sprite = {
      canvas,
      muzzleX: muzzle ? (muzzle.x + 1) / 2 : .5,
      muzzleY: muzzle ? (1 - muzzle.y) / 2 : .75,
      pivotX: pivot ? (pivot.x + 1) / 2 : .5,
      pivotY: pivot ? (1 - pivot.y) / 2 : .5,
    };
    this.scene.remove(model);
    if (this.boat) this.boat.visible = visible ?? true;
    return sprite;
  }

  get ready() {
    return this.boat !== null;
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** Turn the bow with steering, then return the muzzle position in sprite coordinates. */
  render(time: number, bank: number, throttle: number) {
    if (!this.boat) {
      this.renderer.render(this.scene, this.camera);
      return null;
    }
    const bob = Math.sin(time * 3.4) * 0.022 + Math.sin(time * 7.1) * 0.008;
    this.boat.position.y = bob;
    const heading = Math.abs(bank) < .005 ? 0 : -bank * .28;
    this.boat.rotation.set(-.03 - (throttle - 1) * .03, heading, 0, 'YXZ');

    this.renderer.render(this.scene, this.camera);
    if (!this.muzzle) return null;
    this.muzzle.getWorldPosition(this.muzzlePosition).project(this.camera);
    return { x: (this.muzzlePosition.x + 1) / 2, y: (1 - this.muzzlePosition.y) / 2 };
  }
}
