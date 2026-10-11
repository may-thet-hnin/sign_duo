# Recognition model audit (October 2026)

This is the current description of static-letter recognition. It replaces the
geometry rules described in earlier change notes (`recognition.md`,
`expanded-signs.md`, `recognition-and-lessons-fixes.md`, `competition-fixes.md`).

## Why only A, B and L worked

The model was never limited to three letters. `nocontextdoruk/asl-landmark-mlp`
classifies 36 classes (0–9, A–Z) from 21 MediaPipe landmarks. The local
`mlp_asl.onnx` matches the Hugging Face file byte for byte (SHA-256
`af11fade…5e68`), and `mlp_classes.json` matches too.

The limits came from the app:

1. **Hard-coded filter.** `controller.js` discarded every model answer except
   A, B and L. C, D, I, V, W and Y came from hand-written geometry rules, and the
   B rule overrode the model.
2. **Left hands were never reflected.** The model only recognizes hands that
   MediaPipe labels "Right". Mirrored hands were misread (A as M, B as L, Y as I).
3. **Digit classes competed with letters.** The model assigns real F photos to
   the digit 9 (the same ASL handshape). That made F impossible, and 0 or 5
   could take probability away from O or B.
4. **Widescreen distortion.** Raw MediaPipe coordinates use width units for x
   and height units for y, so a 16:9 webcam squashes the hand. The geometry rules
   already corrected for this, but the model input did not.

## Current pipeline

`MediaPipe landmarks + handedness` → equal-axis coordinates (`metricLandmarks`)
→ reflect "Left" hands (`canonicalHand`) → wrist-relative, scale-normalized 63
values (the same as the model's reference code) → ONNX → softmax → digits, J and Z
removed, 9 merged into F, renormalized → 85% confidence and 15% margin gate →
900 ms temporal hold (`TemporalSmoother`).

Words (HELLO, YES, NO) are real motion gestures from `dynamicGestures.js`. They
are not fingerspelled, and the model is not used for them.

## Evidence

`tests/fixtures/referenceLandmarks.json` holds 346 real MediaPipe landmark sets.
They come from two ASL University fingerspelling photo series, plus mirrored and
±12° rotated copies, extracted in the browser with the app's MediaPipe version.
`tests/modelAccuracy.test.mjs` runs the actual ONNX model on them through the
app's preprocessing on every `npm test`.

| Result (top-1, with left-hand reflection) | Letters |
| --- | --- |
| Reliable (≥ 90%) | A, B, D, E, F, I, L, M, N, O, R, V, W, Y |
| Offered, but weaker | C (front-view photo 100%, side-view photo 0%), S (73%, confused with M) |
| Not offered: rarely confident | T (top-1 63%, but almost never above the 85% gate) |
| Not offered: confidently confused | U (read as R) |
| Not offered: misread | G, H, K, P, Q, X (≈ 0%) |
| Not offered: motion letters | J, Z |

Other measurements on the same samples:

- **Offered letters overall:** 94% correct.
- **Without left-hand reflection:** mirrored samples score below 50%.
- **Raw 16:9 coordinates:** offered-letter accuracy falls from 94% to 81%.

All of these photos show one signer. They check the integration, but they are
**not** a measurement of live webcam accuracy.

An end-to-end run in the dev app streamed these photos through a fake 1280×720
camera. A solo race recognized all 16 letters in order. In a duo race, player 1
used mirrored photos and still finished all 16, while player 2's wrong sign
counted only against player 2. The "Closed hands" lesson completed with all
practices and the quiz.

## Manual webcam checklist

Use the DEV "Recognition diagnostics" panel. It shows handedness, the raw model
class and the top letters.

1. Sign every offered letter with each hand, in good and dim light, at arm's
   length. C and S are the weakest; check them first.
2. Hold a relaxed open hand. The model has no "not a letter" class, so an open
   "5" can read as B.
3. Race duo with two people and confirm that a wrong letter costs only that
   player.
