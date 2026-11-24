import { CatmullRomCurve3, Quaternion, Vector3 } from "three";

export const DRAIN_EDGE = 0.46;
export const RETURN_BACK = 0.54;
export const RETURN_CHANNEL_X = 0.508;
export const LIFT_OFFSET = .018;
const ROLLING_GRAVITY = 9.81 * 5 / 7; // A solid sphere rolling without slipping.
const smoothStep = (n: number) => n * n * (3 - 2 * n);

export class BallReturn {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  speed: number;
  private readonly track: CatmullRomCurve3;
  private readonly length: number;
  private readonly liftStart: Vector3;
  private readonly plunger: Vector3;
  private readonly radius: number;
  private distance = 0;
  private liftTime = 0;
  private readonly next = new Vector3();
  private readonly travel = new Vector3();
  private readonly axis = new Vector3();
  private readonly turn = new Quaternion();

  constructor(start: Vector3, rotation: Quaternion, velocity: Vector3, plunger: Vector3, radius: number) {
    this.position = start.clone();
    this.rotation = rotation.clone();
    this.plunger = plunger.clone();
    this.radius = radius;
    this.speed = Math.min(1.05, Math.max(.24, Math.hypot(velocity.x, velocity.z) * .36));
    const z = Math.max(plunger.z + .07, Math.min(.246, start.z + velocity.z * .01));
    this.liftStart = new Vector3(plunger.x - LIFT_OFFSET, plunger.y - .104, plunger.z);
    this.track = new CatmullRomCurve3([
      start.clone(),
      new Vector3(.484, plunger.y - .026, z),
      new Vector3(RETURN_CHANNEL_X, plunger.y - .044, Math.max(plunger.z + .048, z - .061)),
      new Vector3(RETURN_CHANNEL_X, plunger.y - .061, plunger.z + .045),
      this.liftStart,
    ]);
    this.length = this.track.getLength();
  }

  get liftHeight() {
    const lift = smoothStep(Math.min(1, this.liftTime / .40));
    return this.liftStart.y + (this.plunger.y - this.liftStart.y) * lift;
  }

  step(delta: number): boolean {
    const dt = Math.min(delta, .05);
    if (this.distance < this.length) {
      const remaining = this.length - this.distance;
      const sample = Math.min(.02, remaining);
      this.track.getPointAt((this.distance + sample) / this.length, this.next);
      const grade = (this.position.y - this.next.y) / sample;
      const brakingSpeed = Math.sqrt(2 * 3.4 * remaining);
      this.speed = Math.max(.12, Math.min(.96, brakingSpeed, this.speed + (ROLLING_GRAVITY * grade - .30) * dt));
      this.distance = Math.min(this.length, this.distance + this.speed * dt);
      this.track.getPointAt(this.distance / this.length, this.next);
      this.rollTo(this.next);
      return false;
    }

    // The return elevator rises below the shooter, then feeds the ball into the spring.
    this.speed = 0;
    this.liftTime += dt;
    const settle = Math.min(1, Math.max(0, (this.liftTime - .33) / .26));
    this.next.copy(this.liftStart);
    this.next.y = this.liftHeight;
    this.next.x += (this.plunger.x - this.liftStart.x) * smoothStep(settle);
    this.rollTo(this.next);
    return settle === 1;
  }

  private rollTo(next: Vector3) {
    this.travel.subVectors(next, this.position);
    this.travel.y = 0;
    const distance = this.travel.length();
    if (distance > 0) {
      this.axis.set(this.travel.z, 0, -this.travel.x).normalize();
      this.rotation.premultiply(this.turn.setFromAxisAngle(this.axis, distance / this.radius)).normalize();
    }
    this.position.copy(next);
  }
}
