# Sign Duo

Sign Duo teaches users the letters of ASL and checks accuracy using computer vision. After teaching users ASL, they have the option to practice speed and accuracy alone, or with a friend live through two webcams in a "Signs per minute" competition.

## Tech Stack
- JavaScript/React
- Node.js
- [Google Media Pipe](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) for the computer vision
- Local ONNX Runtime Web ASL landmark MLP ([nocontextdoruk/asl-landmark-mlp](https://huggingface.co/nocontextdoruk/asl-landmark-mlp)) for 16 static letters (A B C D E F I L M N O R S V W Y), plus temporal hand-geometry motion practice for HELLO/YES/NO. HELLO is a labeled simplified motion exercise. See [the model audit](docs/model-audit.md) for why other letters are not offered.
- [Camo App](https://camo.com/) for the second webcam (1v1 "signs per minute" contest)


## Design system: smoked liquid glass over a 16-bit dusk

The UI is a deliberate blend of two ideas:

- **Liquid glass**: translucent, blurred, specular panels (`.glass` in `src/styles/glass.css`) floating over a
  moving backdrop (`Scenery.jsx`: drifting pixel clouds, stars, colour blobs, stepped hills) so the blur has
  something to refract.
- **Retro video game**: Press Start 2P + Pixelify Sans, hand-drawn pixel sprites (`src/utils/sprites.js`, rendered by
  `Pixel.jsx`), arcade-key buttons with a pressable depth edge, segmented health/progress bars, CRT-style camera
  viewfinders, `steps()` animation, and dialog-box feedback.

Files: `src/index.css` (tokens + scenery), `src/styles/glass.css` (primitives), `src/App.css` (screens).
Fonts load from Google Fonts in `index.html`; self-host them if you need offline use. `prefers-reduced-motion` is respected.
Race scoring and the pixel/glass design are preserved.

## Learning Mode

Six lessons teach small groups of signs: A/B/L, C/D/I, V/W/Y, E/S/M/N, O/F/R, and HELLO/YES/NO.
Each includes guided references, camera practice, and knowledge checks. Static
letters require about 900 ms of matching predictions plus sample/agreement
validation; words use motion milestones instead of a stationary hold. Each lesson
saves its own progress in localStorage and can be resumed or replayed. Existing
A/B/L checkpoints migrate into Lesson 1.

Run `npm run dev`, then choose **Start learning**. Run `npm test`, `npm run lint`,
and `npm run build` for automated checks.

See [Learning Mode implementation and testing report](docs/learning-mode.md) for
recognition limitations, file changes, validation results, and the manual test checklist.

The Alphabet and Basic Words sections contain lesson groups, with no individual
alphabet practice tabs/cards. Choose Alphabet, Basic Words or Mixed in race setup
for either mode. See [recognition and lesson fixes](docs/recognition-and-lessons-fixes.md)
for root causes, changed files, validation and remaining webcam checks, and
[expanded signs](docs/expanded-signs.md) for the sign practice checklist.

## Competition

Choose 30/60/90/120 seconds before starting (default 60). The countdown begins after
all cameras and recognition models are ready. Different letters transition naturally;
repeated identical letters require a brief release. See [competition fixes and browser
checklist](docs/competition-fixes.md) for the B compatibility path and validation limits.

