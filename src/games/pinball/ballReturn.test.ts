import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { BallReturn, DRAIN_EDGE, RETURN_BACK } from "./ballReturn";

const radius = .0135;
const plunger = new Vector3(.425, .8715, -.2385);

describe("pinball trough return", () => {
  it.each([
    { z: .029, vx: .13, vz: 0, step: 1 / 60 },
    { z: .24, vx: 4.5, vz: -.9, step: 1 / 30 },
    { z: -.197, vx: .8, vz: .9, step: 1 / 144 },
  ])("rolls from z=$z to the plunger and settles", ({ z, vx, vz, step }) => {
    const start = new Vector3(DRAIN_EDGE + .006, .8715, z);
    const initialRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .7);
    const motion = new BallReturn(start, initialRotation, new Vector3(vx, 0, vz), plunger, radius);
    expect(motion.position.equals(start)).toBe(true);
    expect(motion.rotation.equals(initialRotation)).toBe(true);

    let time = 0;
    let lowest = start.y;
    let loaded = false;
    while (!loaded && time < 3) {
      const previous = motion.position.clone();
      loaded = motion.step(step);
      time += step;
      lowest = Math.min(lowest, motion.position.y);
      expect(motion.position.distanceTo(previous)).toBeLessThan(.05);
      expect(motion.position.x).toBeLessThan(RETURN_BACK);
    }

    expect(loaded).toBe(true);
    expect(lowest).toBeLessThan(plunger.y - .10);
    expect(motion.position.distanceTo(plunger)).toBeLessThan(1e-6);
    expect(motion.rotation.angleTo(initialRotation)).toBeGreaterThan(.1);
    expect(motion.speed).toBe(0);
  });
});
