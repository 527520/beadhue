export interface Point {
  x: number;
  y: number;
}
export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export class CanvasGesture {
  center: Point = { x: 0, y: 0 };
  private start: Point | null = null;
  private last: Point | null = null;
  private pair: Point[] | null = null;
  private multi = false;
  private started = 0;
  camera: Camera = { x: 0, y: 0, scale: 1 };
  begin(points: Point[], now = Date.now()) {
    if (!this.start && points[0]) {
      this.start = points[0];
      this.last = points[0];
      this.started = now;
    }
    if (points.length > 1) {
      this.multi = true;
      this.pair = points.slice(0, 2);
    }
  }
  move(points: Point[], pan: boolean) {
    if (points.length > 1) {
      this.multi = true;
      const [a, b] = points;
      const mid = {
        x: (a.x + b.x) / 2 - this.center.x,
        y: (a.y + b.y) / 2 - this.center.y,
      };
      if (this.pair) {
        const [p, q] = this.pair;
        const oldMid = {
          x: (p.x + q.x) / 2 - this.center.x,
          y: (p.y + q.y) / 2 - this.center.y,
        };
        const before = this.camera.scale;
        const ratio =
          Math.hypot(a.x - b.x, a.y - b.y) /
          Math.max(1, Math.hypot(p.x - q.x, p.y - q.y));
        const scale = Math.max(0.5, Math.min(16, before * ratio));
        this.camera = {
          x: mid.x - ((oldMid.x - this.camera.x) * scale) / before,
          y: mid.y - ((oldMid.y - this.camera.y) * scale) / before,
          scale,
        };
      }
      this.pair = points.slice(0, 2);
    } else if (points[0] && this.last && pan && !this.multi) {
      this.camera = {
        ...this.camera,
        x: this.camera.x + points[0].x - this.last.x,
        y: this.camera.y + points[0].y - this.last.y,
      };
    }
    this.last = points[0] ?? this.last;
  }
  end(remaining: number, stitch: boolean, now = Date.now()): Point | null {
    if (remaining) return null;
    const result =
      !this.multi &&
      this.last &&
      this.start &&
      (!stitch ||
        (now - this.started < 350 &&
          Math.hypot(this.last.x - this.start.x, this.last.y - this.start.y) <=
            8))
        ? this.last
        : null;
    this.cancel();
    return result;
  }
  cancel() {
    this.start = null;
    this.last = null;
    this.pair = null;
    this.multi = false;
  }
}
