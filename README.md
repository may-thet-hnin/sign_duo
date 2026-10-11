# Sign Duo

Sign Duo teaches users the letters of ASL and checks accuracy using computer vision. After teaching users ASL, they have the option to practice speed and accuracy alone, or with a friend live through two webcams in a "Signs per minute" competition.

## Tech Stack
- JavaScript/React
- Node.js
- [Google Media Pipe](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) for the computer vision
- Local ONNX Runtime Web ASL landmark MLP, plus an experimental B geometry compatibility path. Only A/B/L are enabled.
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

Lesson 1 teaches A, B, and L through guided instruction, photographic references,
live camera practice, and three knowledge checks. Camera practice requires about
900 ms of matching predictions plus sample/agreement validation. Progress is saved
in this browser's localStorage; completed lessons can be replayed.

Run `npm run dev`, then choose **Start learning**. Run `npm test`, `npm run lint`,
and `npm run build` for automated checks.

See [Learning Mode implementation and testing report](docs/learning-mode.md) for
recognition limitations, file changes, validation results, and the manual test checklist.

## Competition

Choose 30/60/90/120 seconds before starting (default 60). The countdown begins after
all cameras and recognition models are ready. Different letters transition naturally;
repeated identical letters require a brief release. See [competition fixes and browser
checklist](docs/competition-fixes.md) for the B compatibility path and validation limits.

