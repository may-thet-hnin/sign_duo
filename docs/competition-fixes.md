# Competition fixes and B compatibility

## Diagnosis and implementation

TemporalSmoother used a single locked boolean after any stable sign. Later B could
be displayed as detected/stable with isNew=false, so App never submitted it.
This progression bug is reproducible independently of webcam model accuracy.
The filter now remembers the last emitted letter: A/B/L can transition naturally
after the existing confidence/stability gate. Repeated identical letters require
400 ms of observed unknown/no-hand and a new stable hold. Stalls do not count as release.

Events carry unique event and race/player/challenge IDs. IDs are captured before
asynchronous inference; challenge changes discard in-flight results. RaceEngine
rejects tentative, duplicate, stale and previous-race events. App publishes the new
engine snapshot immediately after acceptance. Stable wrong approved letters retain
the existing solo heart/duo penalty behavior without repeated duplicate penalties.

B failing in both modes is a separate report. ONNX had replaced the live B heuristic;
edits to recognizeLetter.js/handGeometry.js only affected diagnostic comparison.
The exact model confusion cannot be established without real landmarks/raw outputs.
A B-only geometry compatibility path now requires all four extended fingers and
a thumb folded close to the index knuckle. Every condition must pass, unlike the
edited legacy scoring classifier. ONNX still runs; A/L retain its original confidence
and margin thresholds. B geometry uses the same stability gate. Diagnostics label
the method and keep model scores attached to the raw ONNX class, never as a geometry
probability. This experimental path may accept similar unsupported poses: retest B
and controlled negatives before claiming webcam accuracy. User geometry-file edits
were preserved. No new letters or conversational gestures are enabled.

The race layout keeps target beside preview on desktop and above preview on mobile.
Timer stays sticky. A bounded 16:9 preview with contain scaling avoids cropping.
Compact feedback, stability, last accepted answer, sequence and progress appear
before secondary diagnostics. Accepted answers briefly highlight; colors, pixel
fonts, glass styling and reduced-motion support are preserved.

Setup offers 30/60/90/120 seconds, default 60, for both modes. The countdown waits for
every participating camera, MediaPipe and ONNX model to become ready; recognition
stays inactive while preparing. Both players share one engine and one timer.
Elapsed performance.now time determines remaining seconds rather than interval
counts. Remaining time clamps to zero, late submissions fail, and results show
selected duration. Interval cleanup and fresh rematch state preserve navigation.
Solo hearts, duo penalties, scoring/winner logic and camera assignments remain.

## Tests and remaining manual verification

Run npm test, npm run lint and npm run build. Competition regressions cover stable B
advancing once, duplicates/stale events, A/B/L transitions, A/A/B release, incorrect
signs, jitter/stalls, independent duo progress, previous-race events, all timer choices
in both modes, feedback, B conditions and in-flight cancellation. An end-to-end
synthetic B fixture runs normalization, the actual downloaded ONNX model, geometry,
time validation and RaceEngine, advancing once. Existing lesson/model/cleanup tests
remain. Synthetic fixtures test mechanics, not webcam accuracy.

Browser tools reported no available browsers. Real webcam recognition, rendered
viewport layouts and physical duo cameras were not tested in this session.
Final checks: all 29 automated tests passed, ESLint passed, the production build
passed, and git diff --check found no whitespace errors.

1. Run npm run dev and reload. Practice B in Learning: four fingers straight/together,
   thumb across palm, full hand visible, hold about one second. Development diagnostics
   identify the B geometry path separately from the model's raw prediction.
2. Solo: choose 30s and start. Timer must wait for readiness. Sign A then B then L
   without removing the hand. Each must advance exactly once; accepted feedback and
   next target must update immediately. Stable incorrect signs must not advance.
3. Hold the old pose: no duplicate credit. Repeated identical targets require a
   brief release and another hold. The production sequence has no adjacent identical
   letters; automated A/A/B tests exercise the repeated-target path.
4. Test no hand, unsupported poses, open palm, folded fingers, transitions and camera
   pauses. No uncertain result should award progress. Export B evaluation attempts
   with both hands, lighting/angle conditions and negatives if detection still fails.
5. Try all durations, expiration/results, exit, rematch and Learning navigation.
   Verify duration retention, camera shutdown and no duplicate timers/stale credit.
6. Duo: select distinct webcams. Both must prepare before one shared countdown starts;
   progress, feedback and scores stay independent. Check winner and early completion.
7. Check 1920×1080, 1366×768, 1280×720 and narrow mobile. Desktop timer/target/preview
   must appear together without scrolling; mobile target precedes camera. Check
   keyboard focus, readable controls and horizontal overflow.

## Files

Modified: App.jsx, App.css, Camera.jsx, RaceScreen.jsx, ResultsScreen.jsx,
RecognitionDebug.jsx, recognition/config.js, controller.js, temporalSmoothing.js,
evaluation.js, utils/raceEngine.js, README.md and docs/recognition.md.
New: recognition/bGeometry.js, utils/raceFeedback.js, tests/competition.test.mjs,
and this report. ONNX assets and model licensing remain intact.
