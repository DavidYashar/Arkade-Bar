import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { addTableContainment, launchSpeed, ShooterGate, SHOOTER_DIVIDER_Z } from "./shooterLane";

const bedY = .85;
const radius = .0135;
const ballY = bedY + .008 + radius;

function table(x: number, y: number, z: number) {
  const world = new RAPIER.World({ x: 1.5, y: -9.81, z: 0 });
  world.timestep = 1 / 240;
  const gate = new ShooterGate(world, bedY, radius);
  addTableContainment(world, bedY, .54, .27);
  world.createCollider(RAPIER.ColliderDesc.cuboid(.54, .008, .27)
    .setTranslation(0, bedY, 0).setFriction(.08).setRestitution(.18));
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z).setCcdEnabled(true).setLinearDamping(.04).setAngularDamping(.4));
  world.createCollider(RAPIER.ColliderDesc.ball(radius).setDensity(7).setFriction(.1).setRestitution(.45), ball);
  return { world, gate, ball };
}

beforeAll(async () => { await RAPIER.init(); });

describe("pinball shooter lane", () => {
  it.each([0, .05, .25, .5, 1])("launches into the field at charge %s", (charge) => {
    const { world, gate, ball } = table(.425 + .016 * charge, ballY, -.2385);
    try {
      gate.open();
      ball.setLinvel({ x: -launchSpeed(charge), y: 0, z: 0 }, true);
      for (let i = 0; i < 360 && gate.launching; i++) {
        world.step();
        gate.step(ball);
      }
      expect(gate.launching).toBe(false);
      expect(ball.translation().z).toBeGreaterThan(SHOOTER_DIVIDER_Z + radius);
    } finally {
      world.free();
    }
  });

  it("bounces a playfield shot away from the closed shooter mouth", () => {
    const { world, ball } = table(-.329, ballY, -.15);
    try {
      ball.setLinvel({ x: 0, y: .55, z: -4.8 }, true);
      for (let i = 0; i < 42; i++) {
        world.step();
        expect(ball.translation().z).toBeGreaterThan(SHOOTER_DIVIDER_Z);
      }
      expect(ball.linvel().z).toBeGreaterThan(0);
    } finally {
      world.free();
    }
  });

  it("contains a fast rising ball near the outer rail", () => {
    const { world, ball } = table(-.05, ballY + .016, .204);
    try {
      ball.setLinvel({ x: 0, y: 2.3, z: 4.9 }, true);
      for (let i = 0; i < 100; i++) {
        world.step();
        expect(ball.translation().z).toBeLessThan(.264);
        expect(ball.translation().y).toBeLessThan(bedY + .072);
      }
    } finally {
      world.free();
    }
  });
});
