class LetterStabilizer {
	constructor(requiredFrames = 5) {
		if (!Number.isInteger(requiredFrames) || requiredFrames < 1) {
			throw new RangeError('requiredFrames must be a positive integer');
		}

		this.requiredFrames = requiredFrames;
		this.history = [];
		this.letter = null;
	}

	addFrame(rawLetter) {
		if (rawLetter == null) {
			this.clear();
			return { letter: null, isNew: false };
		}

		this.history.push(rawLetter);
		if (this.history.length > this.requiredFrames) this.history.shift();

		const consistent = this.history.length === this.requiredFrames &&
			this.history.every((prediction) => prediction === rawLetter);

		if (!consistent) return { letter: this.letter, isNew: false };

		const isNew = rawLetter !== this.letter;
		this.letter = rawLetter;
		return { letter: this.letter, isNew };
	}

	clear() {
		this.history = [];
		this.letter = null;
	}
}

module.exports = { LetterStabilizer };
