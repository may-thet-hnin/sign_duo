# Learning Mode implementation and testing report

## Existing architecture and scope

The original learning screen had its own getUserMedia effect, no classifier, and
self-awarded practice credit. App restricted its six static lesson definitions to
A/B/L. RaceScreen already used Camera, useHandTracking, HandOverlay, and
recognizeLetter. App owns the race state, RaceEngine, and LetterStabilizer.

Learning now uses that same Camera component and recognition pipeline. No second
MediaPipe implementation, recognition model, backend, or runtime dependency was
introduced. RaceEngine, gameplay stabilization, race/result screens, classifier,
geometry, navigation destinations, and scoring rules were not changed.

## Delivered experience

- Dashboard with verified signs, lifetime practice/completion counts, lesson status,
  progress, Start/Continue/Replay actions, and a disabled coming-soon lesson.
- Nine activities: learn A, practice A, learn B, practice B, learn L, practice L,
  then identify B, L, and A from photographs.
- Guided instructions and common mistakes, with attributed photographic references
  from [ASL University / Lifeprint](https://www.lifeprint.com/asl101/fingerspelling/abc.htm).
- Desktop practice has instructions alongside the webcam; narrow screens stack
  the panels. Existing glass, pixel typography, colors, and buttons are reused.
- Live landmarks, target/detected letter readouts, stable-recognition progress,
  encouraging feedback, success highlights, and retry controls.
- Native radio controls with keyboard support, equal option spacing, explicit
  submission, selection/correctness states, and locked submissions. Quiz alt text
  does not name the answer. An unavailable reference disables an unanswered quiz.
- Results show verified signs, quiz score/accuracy, Replay, and Back to Learning.

## Camera validation and stability

Camera requests video only during practice. Its existing useHandTracking hook
loads the MediaPipe Hand Landmarker, detects 21 landmarks, draws HandOverlay, and
passes landmarks to Learning. Learning checks that landmarks remain inside a 2.5%
frame margin, then calls the existing recognizeLetter function. Boundary feedback
is a framing heuristic, not a reliable occlusion or landmark-confidence estimate.

PracticeHold requires the classifier to return the target across consecutive
frames spanning at least 1,500 ms. A wrong sign, unknown sign, or absent hand resets
the hold immediately. Frame gaps over 250 ms and backwards timestamps start a new
hold, so a paused video cannot pass merely because wall-clock time elapsed.
A watchdog clears stale progress when no new frame arrives for over 300 ms.
The watchdog never awards credit. Feedback candidates must persist for 200 ms to
reduce flicker. A successful result latches until retry or navigation.

Only successful classifier holds record practice credit. Duplicate success callbacks
cannot award it twice. Continue is blocked until the current practice is verified.
A verified checkpoint restored from storage can continue without repeating it;
Replay clears attempt checkpoints and requires fresh verification of all signs.

Camera sessions remount on device changes, capture the video element for cleanup,
stop streams on unmount and startup failure, and discard late camera resolutions.
Deferred startup prevents StrictMode's initial effect rehearsal from requesting a
second stream. The existing tracking hook cancels its animation frame and closes
its landmarker on cleanup or cancelled initialization. Retry remounts the shared
camera session. Physical lifecycle behavior remains on the manual checklist.

## Persistence

`sign-duo-learning-v1` stores versioned progress in localStorage: activity position,
current attempt's verified signs and quiz answers, lifetime verified signs,
successful credited practices, completion state, and lifetime lesson completions.
Quiz accuracy is derived from submitted answers. Invalid JSON and inconsistent
checkpoints are recovered conservatively. Storage errors are displayed; learning
can continue in memory. Replaying retains lifetime totals but clears attempt data.
This is local hackathon progress, not tamper-proof assessment or cross-device sync.

## Supported signs and limitations

Only A, B, and L are enabled. Recognition uses experimental static geometry rules,
not the MLP mentioned in the old README; that description has been corrected.
These rules can misclassify unsupported shapes and reject valid ASL variations.
B practice targets the folded-thumb variant recognized by this prototype.
Specific live finger corrections are not inferred from a guessed letter.

The existing L rule already measures a thumb/index opening angle and palm-scaled
distance. Its synthetic XY geometry tolerates rotation, reflection, translation,
and uniform scale. It was preserved to avoid uncalibrated gameplay changes.
Perspective, out-of-plane rotation, normalized-image aspect ratio, finger occlusion,
lighting, camera angle, and person-to-person variation can still affect accuracy.
The synthetic test does not demonstrate real-world L reliability or solve a need
for slanting the hand. Calibration with labeled real hand data remains necessary.

References, WASM, model assets, and fonts need network access. Photo URLs returned
HTTP 200 during verification. References are externally hosted; failed loads show
an error rather than an invented substitute. Offline licensed reference assets
would improve reliability.

## Files

Created:

- `src/utils/lessonContent.js`: A/B/L content, photo attribution, quiz order.
- `src/utils/learning.js`: stability, framing, persistence recovery, and guarded progression.
- `src/styles/learning.css`: responsive dashboard, lessons, camera, quiz, results.
- `tests/learning.test.mjs`: behavioral regression checks without extra dependencies.
- `docs/learning-mode.md`: this report.

Modified:

- `src/components/LearnScreen.jsx`: replaced self-assessed learning with the structured journey.
- `src/components/Camera.jsx`: optional status callback and camera session lifecycle fixes.
- `src/App.jsx`: learning integration and updated descriptions; race logic unchanged.
- `src/components/PlayerPanel.jsx`: commented the existing unused usage snippet that
  referenced undefined globals. No application file imports it.
- `package.json`: added the Node test command.
- `README.md`: accurate recognition description, learning workflow and checks.

## Automated validation

- `npm run build`: passes; 37 modules transformed.
- `npm run lint`: passes with no errors or warnings. Pre-existing learning/camera
  lint errors were resolved; the stray PlayerPanel snippet was documented as an example.
- `npm test`: 7 tests pass, 0 fail. Covers sustained matches, interruptions, timestamp
  gaps, framing, guarded progression, duplicate credit, quiz submission, completion,
  storage recovery/resume, replay, synthetic L invariance, solo hearts, duo penalties,
  race results, and original race stabilization.
- `git diff --check`: passes.

The test suite uses synthetic inputs. No functioning webcam or physical signs were
tested. Browser UI testing was attempted, but the UI tool reported no available
browsers and could not open the in-app browser. Desktop/mobile visual QA, actual
navigation, permissions, model loading, and live camera recognition remain manual.

## Manual testing checklist

1. Open the local app; choose Start learning. Check dashboard at desktop width and
   mobile widths (390 px and 320 px); verify no overflow or hidden controls.
2. Start Lesson 1. Check all reference photos against their linked ASL source and
   ensure instructions stay readable. Try keyboard-only navigation.
3. Enter A practice and allow camera access. Verify live preview, aligned mirrored
   landmarks, tracking state, and framing feedback.
4. Show no hand, an unknown shape, and B while A is the target. None should earn
   credit or enable Continue. Move fingertips off frame and verify framing advice.
5. Show A briefly, then remove/change the hand: progress must reset. Hold a
   recognized A for 1.5 seconds: success should appear and Continue should unlock.
6. Complete B and L similarly. Test both hands, upright/slanted L, several camera
   angles and lighting conditions; report false positives/negatives.
7. Refresh mid-lesson and reopen Learning: Continue should resume the checkpoint.
   Refresh just after a verified practice and verify that credit is retained once.
8. For quizzes, choose/change a radio option with arrow keys, submit with keyboard,
   and verify selected/correct/wrong states. Test both right and wrong answers.
   Repeated submissions must not alter the recorded answer or score.
9. Complete the lesson, check score and signs, replay, and confirm all camera
   practices require fresh verification while lifetime progress remains.
10. Deny camera access and test unavailable camera/model/photo assets. Errors
    should be useful, retry should work after permissions are fixed, and no
    unverified practice should receive credit.
11. Leave practice for the dashboard, menu, or race. Confirm the camera indicator
    turns off and no tracking continues. Return and retry repeatedly.
12. Run a solo race, then duo with two distinct webcams; verify camera switching,
    hearts, penalties, scoring, results, and rematch still behave as before.

## Future work

Validate rules with diverse real signers and labeled landmark data; calibrate
aspect/orientation handling before changing gameplay thresholds. Replace heuristics
with a validated classifier if needed. Add supported letters only after validation,
obtain licensed local reference assets, and have an ASL educator review instruction
and feedback. Complete desktop/mobile UI and physical camera acceptance testing.

The first complete lesson and camera validation implementation are ready for user
testing. Further recognition changes should follow feedback from that test.
