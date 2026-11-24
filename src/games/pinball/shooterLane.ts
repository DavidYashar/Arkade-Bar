import RAPIER from "@dimforge/rapier3d-compat";
import WALLS from "./table-walls.json";

export const SHOOTER_DIVIDER_Z = -.211;
export const WALL_COLLIDER_HALF_HEIGHT = .045;

export function launchSpeed(charge: number) {
  return 2.05 + charge * 2.25;
}

export function addTableContainment(world: RAPIER.World, bedY: number, halfLength: number, halfWidth: number) {
  // The glass overlaps the taller collision rails without changing their artwork.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfLength + .03, .008, halfWidth + .03)
      .setTranslation(0, bedY + .078, 0)
      .setFriction(.03)
      .setRestitution(.24),
  );

  for (const { x0, x1, z0, z1, halfWidth: wallWidth } of WALLS.segments) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    if (length < 1e-5) continue;
    const halfAngle = Math.atan2(-dz, dx) / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(length / 2, WALL_COLLIDER_HALF_HEIGHT, wallWidth)
        .setTranslation((x0 + x1) / 2, bedY + WALL_COLLIDER_HALF_HEIGHT, (z0 + z1) / 2)
        .setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) })
        .setFriction(.04)
        .setRestitution(.5),
    );
  }
}

/** Closes the mouth of the shooter lane once the whole ball has cleared it. */
export class ShooterGate {
  private readonly mouth: RAPIER.Collider;
  private readonly clearZ: number;
  private phase: "climb" | "crossing" | "field" = "field";

  constructor(world: RAPIER.World, bedY: number, ballRadius: number) {
    this.clearZ = SHOOTER_DIVIDER_Z + ballRadius + .008;
    this.mouth = world.createCollider(
      RAPIER.ColliderDesc.cuboid(.053, WALL_COLLIDER_HALF_HEIGHT, .006)
        .setTranslation(-.338, bedY + WALL_COLLIDER_HALF_HEIGHT, SHOOTER_DIVIDER_Z)
        .setFriction(.04)
        .setRestitution(.5),
    );
  }

  get launching() {
    return this.phase !== "field";
  }

  open() {
    this.phase = "climb";
    this.mouth.setEnabled(false);
  }

  close() {
    this.phase = "field";
    this.mouth.setEnabled(true);
  }

  step(ball: RAPIER.RigidBody) {
    if (!this.launching) return;
    const { x, z } = ball.translation();
    const v = ball.linvel();
    // Steering earlier hits the divider. Wait for the ball to pass its tip.
    if (this.phase === "climb" && x <= -.308 && v.x < 0) {
      const speed = Math.min(3.6, Math.max(1.5, Math.hypot(v.x, v.z)));
      ball.setLinvel({ x: -.24 * speed, y: v.y, z: .97 * speed }, true);
      this.phase = "crossing";
    }
    if (this.phase === "crossing" && z >= this.clearZ) this.close();
  }
}
