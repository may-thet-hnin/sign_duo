# Expanded alphabet and word practice

The offered vocabulary is A, B, C, D, I, L, V, W, Y plus HELLO, YES and NO.
All recognition remains experimental. Synthetic automated tests establish the
rules' mechanics, not real-world webcam accuracy or ASL fluency.

The latest [recognition and lesson fixes](recognition-and-lessons-fixes.md) replace
the individual practice cards with four independent lessons and explain the
geometry, motion-progress and saved-progress corrections.

## Integration and changed files

| Files | Change |
| --- | --- |
| `src/recognition/config.js` | Shared vocabulary and Alphabet / Basic Words / Mixed race sequences. |
| `src/utils/handGeometry.js`, `src/recognition/staticGeometry.js`, `src/utils/recognizeLetter.js` | Scale-relative distances, joint angles and six additional static letter rules. |
| `src/recognition/dynamicGestures.js`, `src/recognition/controller.js` | Per-camera temporal word recognition, stabilization, ambiguity handling, unique events and lifecycle resets. |
| `src/components/Camera.jsx` | Supplies the current target to the shared controller; retains webcam, MediaPipe and teardown. |
| `src/utils/lessonContent.js`, `src/components/LearnScreen.jsx`, `src/utils/learning.js`, `src/styles/learning.css` | Four grouped lessons with references, practice, quizzes and independent saved progress; legacy A/B/L checkpoints migrate. HELLO remains clearly labeled simplified motion practice. |
| `src/App.jsx`, `src/components/RaceScreen.jsx`, `src/utils/raceFeedback.js`, `src/App.css` | Vocabulary selection, word-sized targets, movement guidance and accurate progress totals for different sequence lengths. |
| `src/utils/raceEngine.js` | Updates the unsupported-target error to include the expanded vocabulary. Completion, scoring, hearts, penalties and timer logic are retained. |
| `src/components/RecognitionDebug.jsx` | Distinguishes model confidence from geometry rule agreement. |
| `tests/expandedSigns.test.mjs`, `tests/fixtures/signs.mjs`, `tests/recognition.test.mjs` | Expanded positive, negative, transformation, controller and game integration coverage; updates the old allowlist expectations. |

The actual player component is `RacePlayer` inside `RaceScreen.jsx`, and the results
component is `ResultsScreen.jsx`. No new model, backend, API or package is added.

## Recognition rules

New letter rules measure joint angles, finger reach and fingertip separation in
palm-width units, after correcting image aspect ratio for geometry. Y uses thumb
abduction; W uses relative MCP spacing and tucked/contact thumb evidence; D requires
curled fingers and thumb/middle contact; C uses finger arcs and an opposed thumb
with a visible aperture. C also checks MCP knuckle bend using a wrist-independent
palm axis and finger-chain scale, allowing a wider side-on opening. A unique added-letter rule takes priority over model/B
fallbacks. Ambiguous added-letter shapes yield unknown. A/B/L retain their ONNX
path and B compatibility path. Geometry scores are rule agreement, not calibrated
probabilities. Model preprocessing remains unchanged.

Static candidates retain the existing 900 ms hold, minimum sample count, agreement
threshold and held-gesture lock. Changing signs naturally re-arms recognition;
repeated identical letters require release. Letter/word transitions reset the static
hold so a letter can be performed again after a word.

Word targets use temporal geometry instead of static model inference. Progress
follows the movement continuously. Word practice processes every tracked frame,
independently of the alphabet model's inference interval. Completion requires an
observed path through the interior of each stroke, at least three distinct
movement steps per stroke, limited backtracking, at least 240 ms and two endpoint
observations; neither endpoint has a timed hold. YES validates separate bend and
return strokes; NO validates both fingertip paths and their coordination.
History is limited to 256 samples and 2.4 seconds. Hand loss, malformed/clipped frames, excessive scale or position
changes, tracking stalls, target changes and disposal reset partial motions. Abrupt
single-frame jumps are rejected. Each camera owns its buffer, lock and event IDs.
Small per-frame movements accumulate instead of being discarded. Dynamic-only
handshape tolerances allow relaxed thumbs and finger curl; up to 160 ms of
uncertain handshape tracking preserves a partial motion. Explicit hand loss still
resets immediately.

Webcam landmarks jitter by a few pixels every frame, and the stroke checks above
treated that as motion. In simulation with 2-3 px of jitter, YES completed 1 time
in 40 and NO 5 in 40. Motion is therefore measured on One-Euro-filtered landmarks,
and path travel ignores wobble below a small deadband. The handshape is still
read from each raw frame, and the interior-step check and the glitch-jump check
use raw values, so a tracking glitch or a couple of teleporting frames cannot
pose as a motion. With this, simulated words complete 40/40 at that jitter, and
still hands do not trigger. A repeated YES nod counts once. Up to 10% of NO
frames may fall outside the two-finger coordination limit.

- **YES:** curled fist with tucked thumb; knuckles move downward relative to the
  wrist and return. Translating an unchanged fist up and down does not count.
  A wrist bend of about 17 degrees is sufficient; a deep 60-degree bend is not
  required. The thumb can rest across the fingers. The bend is measured from
  MediaPipe world landmarks (metres, true depth) when available. Image z often
  reads a fraction of real depth, which hid normal nods entirely. The wrist may
  move up to 1.2 palm widths during a knock, but an unbent fist never counts.
  The DEV diagnostics panel shows the live bend and peak angle.
- **NO:** index and middle fingers start extended together with a gap to the thumb,
  then both close toward the thumb while the other fingers stay folded. A one-finger
  pinch does not count. Holding the closed pose does not repeat; reopen both fingers
  and pause to re-arm.
- **HELLO:** open hand sweeps outward sideways. This is explicitly
  **simplified HELLO motion practice**. No head/face landmarks are available, so the
  recognizer cannot verify forehead placement or the complete forehead-to-outward sign.
  Slight diagonal drift is allowed. A stationary palm does not count. Release
  or hold a different handshape for 400 ms before repeating HELLO or YES.

Both race modes use the same chosen sequence. Only validated new events with the
correct player/challenge ID advance progress. The first Duo completion still ends
the engine immediately, locks the winner, freezes elapsed time, clears the interval
and displays results. Later events and old-race callbacks are ignored.

## Manual webcam checklist

Run `npm run dev`, choose **Start learning**, then open a grouped lesson under
**Alphabet** or **Basic Words**. Watch the reference, then choose **Try it yourself**. Use one hand,
good lighting and a fully visible wrist/fingertips. Test each hand, several hand
sizes, comfortable angles and camera distances. Hold each static sign for about
one second. Release between repeated attempts.

| Sign | Positive attempt | Negative/control |
| --- | --- | --- |
| A/B/L | Use the original starter lesson and comfortable upright L. | Wrong letter; no hand; held sign should count only once. |
| C | Curve all fingers and thumb, showing a C-shaped opening. | Close aperture into O or fully straighten fingers; neither should count as C. |
| D | Index extended; remaining fingertips curve toward thumb, middle touching it. | Open thumb sideways into L; should not count as D. |
| I | Little finger extended, three fingers folded, thumb tucked. | Open thumb into Y. |
| V | Index/middle straight and spread; ring/little folded. | Hold fingers together or extend the ring finger. |
| W | Index/middle/ring straight and spread; little folded. | Fold ring into V. |
| Y | Thumb and little finger extended; three middle fingers folded. | Tuck thumb into I. |
| YES | Form a closed fist, bend down at the wrist, return. | Stationary fist, whole-arm translation, or bend without return must not complete. |
| NO | Start with two fingers together and open from thumb; close both to thumb. | One-finger pinch, stationary open/closed pose, or incomplete closure must not complete. Reopen briefly before repeating. |
| HELLO | Open hand, sweep sideways about one palm width. | Stationary palm, abrupt jump or vertical flutter must not complete. This checks only the labeled simplified motion. |

In **Play a race**, choose Alphabet, Basic Words or Mixed. Test solo correct/wrong
signs, hearts and timeout. In Duo, choose two distinct webcams, keep the other player
stationary while one progresses, then finish with each player in turn. Results must
appear immediately; winner/time must remain fixed. Rematch must reset both players
and the timer. Also test mixed letter → word → letter transitions and Exit race.

## Validation and limits

Automated tests cover articulated synthetic geometry, reflection, translation,
uniform scale, in-plane rotation, similar-shape negatives, stationary word poses,
ordered motions, held endpoints, gaps/jumps, controller transitions, learning-save
compatibility, solo/duo integration and the existing winner/timer regressions.
Run `npm test`, `npm run lint` and `npm run build`.

Real-webcam calibration remains necessary. C needs a visible curved profile; YES
requires a view where wrist bending changes projected knuckle height. Occlusion,
depth noise, tracking a different hand, camera perspective and unusual wrist angles
can affect results. Rule thresholds may reject legitimate signing variants. Hand-only
word checks do not validate facial expression, body location, meaning or conversational
ASL. Reference images/animation load from Lifeprint and require network access.

Instructional references: [Alphabet](https://www.lifeprint.com/asl101/fingerspelling/abc.htm),
[YES](https://www.lifeprint.com/asl101/pages-signs/y/yes.htm),
[NO](https://www.lifeprint.com/asl101/pages-signs/n/no.htm), and
[HELLO](https://www.lifeprint.com/asl101/pages-signs/h/hello.htm).
