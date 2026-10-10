// Turns repeated frame predictions into one event. A no-hand/unknown release
// is required before the next attempt, even for a different letter.
export class LetterStabilizer {
  constructor(requiredFrames = 6, releaseFrames = 5) {
    this.requiredFrames = requiredFrames;
    this.releaseFrames = releaseFrames;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.count = 0;
    this.emptyCount = 0;
    this.locked = false;
  }

  addFrame(rawLetter) {
    if (rawLetter == null) {
      this.candidate = null;
      this.count = 0;
      this.emptyCount++;
      if (this.emptyCount >= this.releaseFrames) this.locked = false;
      return { letter: null, isNew: false, ready: !this.locked };
    }
    this.emptyCount = 0;
    if (this.locked) return { letter: rawLetter, isNew: false, ready: false };
    if (this.candidate === rawLetter) this.count++;
    else { this.candidate = rawLetter; this.count = 1; }
    if (this.count < this.requiredFrames) return { letter: rawLetter, isNew: false, ready: true };
    this.locked = true;
    return { letter: rawLetter, isNew: true, ready: false };
  }
}
