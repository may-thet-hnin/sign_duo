// Evidence comes only from observed frames, never interpolated endpoints.
// A stroke needs intermediate positions and multiple advancing observations.
export class MotionStroke {
  constructor(distance) {
    this.distance = distance; this.lastAdvance = 0; this.peak = 0;
    this.advances = 0; this.intermediate = false;
  }
  observe(value) {
    if (!Number.isFinite(value)) return;
    if (value - this.lastAdvance > .02) { this.advances++; this.lastAdvance = value; }
    if (value > this.distance * .15 && value < this.distance * .9) this.intermediate = true;
    this.peak = Math.max(this.peak, value);
  }
  get progress() { return Math.max(0, Math.min(1, this.peak / this.distance)); }
  get complete() { return this.peak >= this.distance && this.advances >= 2 && this.intermediate; }
}
