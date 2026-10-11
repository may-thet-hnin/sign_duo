# Recognition, motion progress and grouped lessons

This update preserves the existing React/MediaPipe pipeline, pixel/glass design,
static hold validation, Solo/Duo scoring and immediate Duo winner/timer behavior.
No packages, paid services or models were added. Automated geometry tests do not
establish real webcam accuracy.

## Root causes and corrections

| Reported problem | Cause found in the code | Correction |
| --- | --- | --- |
| C fails or resembles B | Per-joint curl missed poses bending mainly at MCP knuckles; the aperture limit excluded a wider side-on C. Thumb IP straightness and raw B/model fallbacks could also reject or override a valid C. | Use wrist-independent palm/finger-chain geometry, include MCP curl, scale the opening by finger length, retain thumb opposition and prioritize unique added-letter geometry. |
| D fails or resembles another raised-index pose | Curl/contact evidence was too rigid, including a straight-thumb constraint. | Require extended index, three curled fingers, thumb/middle contact and a compact fingertip cluster. A raised index alone is insufficient. |
| W requires excessive spreading | Fixed tip spacing and thumb/index proximity excluded narrower spreads and thumb/little-finger contact. | Compare fingertip separation with corresponding MCP spacing; accept a tucked thumb or thumb/little-finger contact. |
| Y requires awkward thumb positioning | Thumb extension depended on a near-straight IP joint. | Measure thumb abduction and chain reach, retaining three folded middle fingers and extended little finger. |
| Geometry varies with camera shape | Normalized x/z and y use different image dimensions, yet distances treated them as equal units. | Camera passes source video aspect ratio; geometry divides y by width/height. ONNX input remains unchanged to preserve its training preprocessing. |
| Word progress stalls or needs a pause | Starting and ending poses had timed hold requirements; intermediate progress was largely flat. | Bounded temporal recognizer reports actual starting-pose, movement, trajectory and completion milestones. |
| Progress leaks between challenges | Partial static holds could survive a challenge change; an old inference error could reset the new challenge; UI completion did not consistently require a new matching event. | Reset partial histories, guard asynchronous results/errors with controller generation, and share target/challenge/event validation between learning and racing. |
| Learning shows separate alphabet cards with only one complete course | A/B/L used the guided lesson architecture; other signs were individual exploration activities. | Replace individual cards with four lessons that reuse references, camera practice, knowledge checks and results. |
| Lesson totals/save state assume A/B/L | One checkpoint and fixed practice/quiz positions could not represent independent courses. | Derive activities from configuration, save per lesson, validate checkpoints and migrate legacy progress. |
| Modes could drift apart | Vocabulary and lesson lists were maintained separately. | Lesson groups and supported race vocabulary share recognition/config.js; all camera modes use the same controller. |

MediaPipe documents normalized x/y coordinates relative to image width/height and
z on approximately the x scale in its [official Hand Landmarker guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
Reflection-safe distances and angles support either hand; the CSS-mirrored preview
does not change the inference landmarks. Perspective/occlusion remain limitations.
Ambiguous added-letter geometry suppresses model fallbacks rather than rewarding
the expected target. Rule agreement is never presented as calibrated confidence.

## Motion tracking and progress

Each camera owns its temporal buffer and lock. The buffer contains at most 30
samples spanning 2.4 seconds. Missing/malformed/clipped input, tracking gaps,
implausible jumps, excessive scale changes, challenge changes and disposal reset
partial movement. Static letters retain the 900 ms hold, sample/agreement checks
and duplicate-gesture lock.

| Word | Evidence | Progress milestones |
| --- | --- | --- |
| HELLO | Open fingers/thumb with a smooth lateral sweep of at least 0.75 starting palm widths; vertical drift and reversal rejected. | Open hand 25%, motion 50%, trajectory 75%, completed sweep 100%. |
| YES | Fist bends relative to its wrist with a change in knuckle depth/angle, then returns. Whole-arm translation and sideways drift rejected. | Fist 25%, bend begins 50%, sufficient bend/return phase 75%, return 100%. |
| NO | Index and middle fingers start together and open from thumb, then both close toward it; ring/little stay folded. One-finger pinches and reopening during closure rejected. | Starting pose 25%, closing 50%, near thumb 75%, both tips close 100%. |

Completion requires at least five observations, three changing motion frames,
240 ms of trajectory and two endpoint observations for debounce. Time alone
cannot advance a milestone or complete a word; there is no timed endpoint hold.
An incomplete stationary pose stays at most 25%. A completed motion emits one
stable event with a unique ID, using the existing game completion pathway.
Holding its endpoint cannot repeat credit. NO re-arms after briefly reopening;
YES/HELLO require a different pose or hand release before repetition. Challenge
resets retain duplicate locks while discarding partial history.

HELLO is explicitly **simplified HELLO motion practice**. With hand landmarks only,
forehead placement and the complete ASL HELLO sign cannot be verified. YES checks
one down-and-return wrist nod, not conversational meaning or all signing variants.

The shared UI progress function rejects wrong targets and stale challenge IDs.
Only a new, stable, matching completion event reaches 100%. Practice retries use
fresh challenge IDs; race callbacks retain existing player/challenge/race guards.

## Lessons and persistence

| Lesson | Signs | Activities |
| --- | --- | --- |
| Getting started | A, B, L | Three guided references, three camera practices, three knowledge checks. |
| Handshape basics | C, D, I | Three guided references, three camera practices, three knowledge checks. |
| Finger combinations | V, W, Y | Three guided references, three camera practices, three knowledge checks. |
| Everyday words | HELLO, YES, NO | Three movement guides, three camera practices, three movement knowledge checks. |

Alphabet and Basic Words sections show lesson cards only. The sign pills are
labels, not individual alphabet tabs. Activity counts derive from the lesson's
signs and quiz configuration, currently nine each. Each lesson can start, resume,
complete and replay independently; returning to the dashboard preserves progress.
Replay retains prior mastery/completion history while requiring new activities.

LocalStorage key `sign-duo-learning-v2` stores per-lesson checkpoints. On migration,
the original `sign-duo-learning-v1` remains untouched. Valid A/B/L checkpoints and
completion migrate into Getting started. Other old exploration mastery is retained
in its corresponding lesson without skipping required activities. Corrupt completion
flags, missing practice evidence and invalid quiz entries cannot finish a lesson.
Storage failures show feedback while allowing the current learning session to continue.

## Files changed for this correction

| Files | Purpose |
| --- | --- |
| src/utils/handGeometry.js | Aspect correction, finger arcs/reach, thumb abduction/opposition and knuckle measurements. |
| src/recognition/staticGeometry.js | C/D/W/Y fixes and ambiguity handling; preserve I/V. |
| src/recognition/controller.js | Geometry precedence, corrected coordinates, fresh challenge history and stale inference-error guard. |
| src/recognition/dynamicGestures.js | Ordered motion milestones and duplicate locks. |
| src/recognition/config.js | Four shared three-sign lesson groups. |
| src/components/Camera.jsx | Supplies actual video aspect ratio to geometry. |
| src/components/LearnScreen.jsx | Grouped dashboard, per-lesson flows, motion feedback, matching-event credit and fresh retry IDs. |
| src/utils/lessonContent.js | Full guided/quiz content and configuration-derived activity counts. |
| src/utils/learning.js | Per-lesson persistence/migration, configurable progression gates and shared recognition progress. |
| src/components/RaceScreen.jsx, src/utils/raceFeedback.js | Current-challenge progress and movement guidance. |
| src/styles/learning.css | Word-sized quiz choices within the existing design. |
| tests/recognitionFixes.test.mjs, tests/lessonGroups.test.mjs | Recognition correction, motion milestone, stale-event, lesson independence and migration regressions. |
| tests/expandedSigns.test.mjs, tests/fixtures/signs.mjs | Updated geometry/model conflict expectation and realistic D contact fixture. |
| README.md, docs/expanded-signs.md, this report | Current behavior, root causes, validation and webcam checklist. |

Earlier uncommitted competition/evaluation changes remain in place; this correction
does not rewrite the race engine, App timer or results/winner logic.

## Verification and remaining manual checks

Final validation: `npm test` passed all **73 tests** with no failures/skips;
`npm run lint`, `npm run build` and `git diff --check` passed. Build output includes
the existing ONNX worker/WASM assets. No dependency changes were needed.

The suite covers all added static letters, both-hand/reflection and aspect-ratio
fixtures, ambiguous negatives, stationary/incomplete/jumping word motions, actual
motion milestones, duplicate events, history resets, stale inference failures,
independent lesson save/resume/replay and legacy migration. Solo hearts/timeout,
both Duo winners, frozen completion times, same-update event ordering, rematches
and camera stream teardown pass their regressions. Actual ONNX CPU/WASM execution
also passes. Synthetic landmarks do not measure accuracy on real signing, and
engine tests do not prove two-camera browser performance.

The C follow-up adds a knuckle-dominant side-on fixture, confirms that changing
landmark 0 (wrist) cannot change its geometry classification, preserves the static
hold gate despite a wrong B model result, and rejects similar O/claw shapes without
falling through to B. The palm axis comes from thumb CMC and finger MCP landmarks;
C curl/opening measurements do not use the wrist. These are synthetic regression
checks, not recovered landmark data or measured accuracy from the user's screenshot.

React server rendering confirms exactly four Start lesson buttons, the four requested
lesson titles, four derived nine-activity labels and no individual Practice C card.
This checks markup only. No live browser/camera session is available in this environment,
so no visual-layout, console, browser-worker or webcam claims are made.

Manual follow-up:

1. Test all nine letters with both hands, several people, comfortable angles,
   camera distances/aspect ratios and lighting. Compare C against O/fist/palm,
   D against L/raised index, W against V/open hand, and Y against I/L.
2. Test YES down/return versus stationary fist, translation and random shaking;
   NO two-finger closure versus pinching/incomplete closure; HELLO outward sweep
   versus stationary palm, vertical flutter and abrupt jump. Watch milestone
   progress and verify each held endpoint credits once.
3. Lose/recover tracking mid-motion, switch targets, retry practice, leave a webcam
   screen, exit/rematch a race and test consecutive identical targets. Old motion
   must never finish a new challenge.
4. Complete, refresh, resume, navigate and replay each lesson. Check legacy saves,
   completed summaries, quiz images, word instructions and narrow/mobile layouts.
5. Test Solo hearts/wrong signs/timeout. In Duo, use two distinct webcams, finish
   with each player first, verify immediate fixed winner/time, then rematch. Confirm
   camera indicators turn off after leaving and the browser console stays clean.

Reference media require network access. Depth noise, occlusion, tracking a different
hand, viewpoint and sign variations can cause false positives or rejections. These
hand-only checks do not establish ASL fluency, facial expression or body placement.
See [expanded signs](expanded-signs.md) for detailed per-sign controls.
