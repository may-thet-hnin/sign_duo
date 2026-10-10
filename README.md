# Sign Duo

Sign Duo teaches users the letters of ASL and checks accuracy using computer vision. After teaching users ASL, they have the option to practice speed and accuracy alone, or with a friend live through two webcams in a "Signs per minute" competition.

## Tech Stack
- Typescript/React
- Node.js
- [Google Media Pipe](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) for the computer vision
- [ASL-landmark-mlp](https://huggingface.co/nocontextdoruk/asl-landmark-mlp) to classify ASL signs
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
Game logic, recognition and the race engine are unchanged.
