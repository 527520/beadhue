import { describe, it, expect } from "vitest";
import { CanvasGesture } from "./gesture";
describe("touch commit boundary", () => {
  it("commits the final aim position, only on release", () => {
    const g = new CanvasGesture();
    g.begin([{ x: 10, y: 10 }], 0);
    g.move([{ x: 30, y: 40 }], false);
    expect(g.end(0, false, 500)).toEqual({ x: 30, y: 40 });
  });
  it("never commits after any two-finger gesture, including one finger lifting first", () => {
    const g = new CanvasGesture();
    g.begin([{ x: 10, y: 10 }], 0);
    g.begin(
      [
        { x: 10, y: 10 },
        { x: 40, y: 40 },
      ],
      10,
    );
    g.move(
      [
        { x: 20, y: 20 },
        { x: 60, y: 60 },
      ],
      false,
    );
    expect(g.end(1, false, 100)).toBeNull();
    g.move([{ x: 30, y: 30 }], false);
    expect(g.end(0, false, 150)).toBeNull();
    expect(g.camera.scale).toBeGreaterThan(1);
  });
  it("accepts only a short stationary stitch tap", () => {
    const g = new CanvasGesture();
    g.begin([{ x: 10, y: 10 }], 0);
    g.move([{ x: 20, y: 20 }], true);
    expect(g.end(0, true, 100)).toBeNull();
    g.begin([{ x: 10, y: 10 }], 200);
    expect(g.end(0, true, 300)).toEqual({ x: 10, y: 10 });
    g.begin([{ x: 10, y: 10 }], 400);
    expect(g.end(0, true, 1000)).toBeNull();
  });
  it("cancellation discards a pending edit", () => {
    const g = new CanvasGesture();
    g.begin([{ x: 1, y: 1 }]);
    g.cancel();
    expect(g.end(0, false)).toBeNull();
  });
});
