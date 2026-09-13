/** Limit rendering to 60 Hz without tying game speed to the display refresh rate. */
export class FrameGate {
  private next = 0;
  private last: number | null = null;
  constructor(private readonly interval = 1000 / 60) {}
  take(now: number): number | null {
    if (this.last === null) { this.last = now; this.next = now + this.interval; return 0; }
    if (now + .25 < this.next) return null;
    const elapsed = Math.max(0, now - this.last); this.last = now;
    this.next += this.interval;
    if (this.next < now) this.next = now + this.interval;
    return elapsed;
  }
  reset(): void { this.last = null; this.next = 0; }
}
