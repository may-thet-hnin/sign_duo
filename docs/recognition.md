# Recognition iteration 1: webcam validation required

## Scope and findings

This iteration implements model integration and shared stability filtering only.
A, B and L remain the only enabled learning and competition letters. No conversational
gestures are enabled. J/Z, digits and every additional model class are rejected as
playable predictions. HELLO/YES/NO/THANK YOU are rejected inside RaceEngine as both
targets and submissions, in solo and duo modes. Expansion waits for user feedback.

MediaPipe initializes in useHandTracking (VIDEO mode, one hand per camera, GPU with
CPU fallback). Camera owns getUserMedia, video, overlay and stream cleanup. Tracking
extracts image landmarks, not world coordinates, once per new video timestamp. Video
and overlay are mirrored with CSS; inference receives the original coordinates.
Previously App and LearnScreen called the same geometric recognizer but used separate
frame-count and duration gates. Racing could confirm in about six frames regardless
of frame rate. Geometry uses coarse base-to-tip ratios without calibrated thresholds,
cannot reliably distinguish other folded handshapes, and mixes normalized XY and Z
distances. The current L rule already uses an XY opening angle, which tolerates
in-plane rotation in synthetic tests; that does not prove natural hand accuracy.
Depth rotation, perspective, handedness and joint noise remain empirical concerns.
No single cause of the reported natural L failure has been established without recordings.

## Implemented pipeline

Camera → MediaPipe → RecognitionController → wrist-centered 3D scale normalization
→ ONNX worker → softmax over all 36 classes → allowlist/confidence/margin filtering
→ TemporalSmoother → learning completion or one released race attempt.

Normalization subtracts point 0 and divides all XYZ values by the Euclidean distance
between points 0 and 9, then creates a float32[1,63] input. Nonfinite/degenerate input
is rejected. No reflection, handedness canonicalization, rotation or aspect-ratio
correction is added: these are not documented training transforms. Wrist centering
and scaling do not confer rotation invariance.

The shared worker loads one session and serializes inference for both cameras. Each
camera admits at most one pending inference and samples at most every 80 ms. Preview
tracking continues independently. Results arriving after no-hand, clipped input,
tracking interruption or unmount are ignored. Controllers and watchdog timers dispose
on unmount; stream tracks stop and the video detaches. The worker/session stays cached
for subsequent screens. Load/inference errors surface as errors, never synthetic signs
or silent geometry fallback. Legacy rules run alongside successful inference solely
for debug comparison; they do not award credit.

Starting settings in src/recognition/config.js: confidence .85, top-two margin .15,
12-sample window, at least eight samples, .8 agreement, 900 ms matching candidate,
350 ms maximum gap and 400 ms unknown/no-hand release. Candidate changes or uncertain
frames reset hold progress. Duration uses timestamps, not video frame counts. Settings
are experimental; softmax is not calibrated reliability. Stable classification can
still falsely accept an unsupported pose. No extra class-specific geometry veto is
enabled without measured evidence. Clipping feedback uses actual coordinates outside
the image bounds; there is no inferred distance or finger-correction feedback.

The original release gate and scoring are preserved. Default and custom competition
targets now enforce the same dedicated allowlist. Simulation buttons are development
only and explicitly labeled; use the evaluation screen to test actual inference.

## Model assets and licensing

Source: https://huggingface.co/nocontextdoruk/asl-landmark-mlp
Pinned revision: 71375bf1bfd3fa79b74cbff5ab91c9a1f2dba197
ONNX SHA256: af11fadedc7b4320cfc0a285a3cf84a4d8794be3f0841ab1640f5cbb5e625e68

public/models/asl includes the unmodified model, official mlp_classes.json array,
model card, LICENSE and CITATION.cff. The mapping is read from the actual JSON;
predictions are never remapped by target. Model/app author: Doruk Doğular
(nocontextdoruk), 2026. Model license: CC BY-NC 4.0. Attribution appears in the app.
The stated educational hackathon use is consistent with a noncommercial use;
commercial deployment, monetization or enterprise use needs a separate license review
and potentially permission from the author. Noncommercial intent is assumed, not
established by repository metadata. License text is preserved rather than replaced.

Dataset: Pranto et al. (2026), ASL-HG: American Sign Language Hand Gesture Image
Dataset, Data in Brief; DOI 10.17632/j4y5w2c8w9.1.
https://data.mendeley.com/datasets/j4y5w2c8w9/1 lists CC BY 4.0. Citation and link
are retained separately. Dataset images are not redistributed in this iteration.
The model card's validation figures are author-reported dataset results, not this
app's webcam accuracy. A static alphabet model cannot verify J/Z motion or word signs.

ONNX and its matching WASM/MJS runtime are served locally by Vite. Webcam frames and
landmarks are not sent to an inference service. Existing MediaPipe assets, lesson
photos and fonts still load externally; this is not a fully offline application.

## Webcam test protocol

1. Run npm run dev, visit its localhost address in Chrome or Edge, and select
   Recognition evaluation on the home screen. This screen and technical debug panels
   are developer-only. Allow webcam access and wait for loading to finish.
2. Select target A; select actual sign A. Describe conditions (user, right/left hand,
   upright/slight tilt, near/far, lighting). Pose, click Start attempt, and hold for
   five seconds. A fresh camera/controller session resets stability for each attempt;
   recording starts at the first tracking result after model startup. Verify your
   actual pose against the existing ASL University photo in Learning Mode.
3. Repeat at least five independent attempts per sign, releasing and reforming the
   pose between attempts. Repeat for B/L, both hands, several comfortable angles,
   distances and lighting conditions; try another user if possible.
4. Negative tests: target A, actual B/L, then target B/L with another actual letter.
   Also select UNKNOWN and describe no hand, open palm, relaxed fingers, unsupported
   handshape, and transitions. Do not label an unfamiliar pose as a correct letter.
5. Inspect diagnostics: raw class, top three confidence scores, stable class,
   agreement, inference latency, old geometry prediction and active method. The
   legacy prediction comparison is per-frame only, not a complete accuracy benchmark.
6. Export results. Share the JSON and examples of natural poses that fail. Data is
   kept only in screen memory until export; it contains predictions and condition
   descriptions, not video frames. Leaving the screen discards unexported results.
7. Also try A/B/L camera practice and a solo race. In duo mode check two distinct
   webcams, independent target progress, release behavior and responsiveness.

Exports include per-frame results and per-attempt summaries: correct stable acceptance,
false acceptance relative to the actual pose, wrong-target acceptance, raw/legacy
match fraction, stable-frame fraction, first correct stability latency and average
inference latency. No-hand frames have no model logits. Frame rates differ for no-hand
and inference results, so frame fractions are descriptive, not independent accuracy.
Compare independent attempt success/false-acceptance rates by condition. Latency
starts at first tracking result, not measured onset of the user's pose. Worker latency
excludes MediaPipe, rendering and queue wait. Blank latency means no correct stable
acceptance. Keep controlled negatives in the report rather than reporting only successes.

Do not enable extra letters or fuse classifiers on the basis of agreement alone.
Choose thresholds and recognition methods after inspecting independent attempts and
negative acceptance. No measured webcam accuracy or per-letter reliability is claimed.

## Verification and changed files

npm test covers normalization, official mapping, softmax/filtering, time gates,
release/reset/stale frames, inference concurrency and disposal, camera stream cleanup,
competition exclusions, evaluation semantics and existing lesson progression/scoring.
An actual ONNX CPU WASM test executes the downloaded model and verifies [1,36] finite
logits. Its synthetic landmarks test runtime compatibility, not ASL correctness.
An old duo test expected p1 to win a tied score even though existing SPM tie-breaking
selects p2; the assertion was corrected without changing the scoring formula.
npm run lint and npm run build validate source and packaging. Browser worker loading,
real webcam accuracy, two-camera performance, resource indicator shutdown and final
responsive layout still require manual validation.

New files: src/recognition/{config,preprocessing,temporalSmoothing,model.worker,
modelClient,controller,cameraResources,evaluation}.js;
src/components/{RecognitionDebug,RecognitionLab}.jsx;
public/models/asl/*; tests/recognition.test.mjs; this guide.
Modified: package.json/lock, App, Camera, LearnScreen, RaceScreen, HeroLens,
raceEngine, learning, lessonContent, tests/learning.test.mjs and README.
Existing geometry and old stabilizer remain available for regression/comparison.
New curricula, HELLO and other guided gesture activities are deliberately deferred.
