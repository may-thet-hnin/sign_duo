<div align="center">

# 🤟 SignDuo

### Fingerspell. Race. Learn.

**A webcam-powered ASL fingerspelling learning game where your hands become the keyboard.**

Inspired by the fast-paced feel of typing races, SignDuo combines guided practice, real-time computer vision, and local head-to-head competition.

<!-- Add a screenshot or GIF of your finished app here -->
<!-- ![SignDuo demo](docs/images/demo.gif) -->



</div>

> **Hackathon project:** Built to make beginner ASL fingerspelling practice more interactive through learning challenges and friendly competition.

## 💡 The Problem

Learning fingerspelling takes repetition, but it can be hard to get immediate feedback while practicing alone. Traditional drills may also lack the motivation and excitement of games.

## 🚀 Our Solution

**SignDuo turns fingerspelling practice into a speed challenge.** Using a webcam, learners practice supported ASL handshapes, receive real-time recognition feedback, and test their skills solo or against a friend in a split-screen race. Instead of typing letters on a keyboard, players form handshapes in front of the camera.

## ✨ Features

### 📚 Guided Learning
- **Six lessons** group supported fingerspelling letters and basic-word motion exercises.
- Guided references, webcam practice, and knowledge checks help users learn before racing.
- Lessons save progress locally. Previously opened lessons offer **Continue** or **Restart lesson**; unopened lessons offer **Start lesson**.
- Static letters require a sustained, validated prediction (approximately 900 ms in lessons); word exercises use motion milestones.

### ⚡ Solo Speed Challenge
- Choose a **30-, 60-, 90-, or 120-second** round.
- Select **Alphabet**, **Basic Words**, or **Mixed** prompts.
- Race through a continuously generated sequence until the timer runs out.
- Earn one point per correct sign. Solo players start with **five hearts**; running out ends the round early.

### 🆚 Duo Competition
- Two players compete locally using **two webcams**, with [Camo](https://camo.com/) as an option for connecting a phone as the second camera.
- Both players receive the **same prompt sequence**, but progress independently.
- The higher score when time expires wins; **fewer mistakes** breaks a score tie. If both remain equal, the race is a tie.
- Each player can **skip up to three prompts per race**, without gaining points or pausing the timer.

### 🎨 Arcade-Inspired Interface
- **Smoked liquid-glass panels** layered over a moving pixel-art dusk landscape.
- Retro typography, pixel sprites, animated controls, segmented progress bars, and camera viewfinders.
- Reduced-motion preferences are respected.

## 🧠 How It Works

```text
Webcam video
    ↓
Google MediaPipe Hand Landmarker
    ↓
Hand landmark coordinates
    ↓
Local ONNX model + motion/geometry checks
    ↓
Validated letter or motion-exercise progress
    ↓
Lesson feedback or race scoring
```

MediaPipe tracks hand landmarks in the browser. A local [ASL landmark MLP model](https://huggingface.co/nocontextdoruk/asl-landmark-mlp), run with ONNX Runtime Web, classifies **16 supported static letters**: **A, B, C, D, E, F, I, L, M, N, O, R, S, V, W, Y**. Temporal hand-geometry rules support **HELLO, YES, and NO** motion-practice activities.

**Scope note:** The HELLO activity is a **simplified, labeled motion exercise**, and the app is **not a complete ASL interpreter**. Fingerspelling and full signed languages involve more than static handshapes. See [model audit](docs/model-audit.md) for coverage and limitations.

## 🛠️ Tech Stack

| Technology | Role |
|---|---|
| **React + JavaScript** | Interactive web application |
| **Node.js** | Development tooling |
| **Google MediaPipe Hand Landmarker** | Webcam-based hand landmark tracking |
| **ONNX Runtime Web** | Local model inference in the browser |
| **ASL landmark MLP** | Supported static-letter classification |
| **Camo** (optional) | Using a phone as a second webcam |

## 🏁 Getting Started

**Prerequisites:** Node.js and npm, a modern browser, and a webcam. Duo Mode requires two available camera feeds.

```bash
# Clone your repository
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open the local address shown in the terminal, then allow webcam access. Choose **Start learning** to practice, or enter **Solo / Duo** competition to race.

To run the project's checks:

```bash
npm test
npm run lint
npm run build
```

## 📡 LAN Multiplayer

Two players on **two devices on the same Wi-Fi**, each with their own camera. It works on the deployed site; nothing to install.

1. **Player 1:** Play a race → **LAN** → Open LAN lobby → **Create lobby**, and share the 6-character code. Keep this page open: the host's browser runs the match.
2. **Player 2:** Play a race → **LAN** → **Join lobby** → enter the code.
3. Both press **Ready**; the host picks the signs and length and presses **Start match**. Once both cameras are ready, a synced 3-2-1 countdown starts the match on both screens.

The devices connect directly with **WebRTC**. Only the initial handshake (finding the host by invite code) goes through the free public [PeerJS](https://peerjs.com/) signaling server; signs are recognized on each device and only game moves travel between them, never video. The host's page runs the match with the same race engine as Duo (same random sequence, scoring, skips, duplicate protection). If the guest disconnects, the match pauses for up to 30 seconds and resumes when they reconnect (automatically, or with **Rejoin my lobby** after a reload); otherwise the host wins. If the host closes the page, the match ends for both. Details: [docs/lan-multiplayer.md](docs/lan-multiplayer.md).

## 🎮 Competition Rules

| Rule | Details |
|---|---|
| Round length | 30, 60, 90, or 120 seconds (default 60) |
| Prompt categories | Alphabet, Basic Words, Mixed |
| Sequence | Randomized for each race; continues until time expires |
| Fairness | Duo and LAN players receive the same sequence |
| Scoring | +1 per correct sign |
| Skips | Up to 3 per player; no points, no time pause |
| Solo | 5 hearts; the run ends when they are depleted |
| Duo / LAN winner | Higher score, then fewer mistakes; otherwise tie (LAN: a player who leaves forfeits) |

**Current race limitation:** **E, M, and N are excluded from competition**, even though they appear in supported lessons. Prompts avoid repeating the same recent targets.

## 🧩 What We Built and Learned

SignDuo combines two real-time tasks: interpreting camera landmarks and running a fair, responsive competitive game. Key engineering concerns include making predictions stable enough for scoring, keeping both players' states independent, and waiting for cameras and models to be ready before starting the countdown.

The interface combines [liquid-glass styling](src/styles/glass.css) with [pixel-art scenery](src/index.css) and screen layouts in [`src/App.css`](src/App.css).

For technical details and known testing limitations, see:
- [Model audit](docs/model-audit.md)
- [Learning Mode implementation and tests](docs/learning-mode.md)
- [Expanded sign checklist](docs/expanded-signs.md)
- [Recognition and lesson fixes](docs/recognition-and-lessons-fixes.md)
- [Competition fixes and browser checklist](docs/competition-fixes.md)

## 🔭 What's Next

Potential extensions include expanding the recognized fingerspelling alphabet, evaluating accuracy with more users and camera environments, improving authentic ASL movement feedback with guidance from fluent signers, and allowing remote players to compete from separate devices.

## 👥 Team

<!-- Replace these placeholders with names and links before submitting. -->

| Team member | Contribution |
|---|---|
| **Ye Yint Thway** | MediaPipe / webcam tracking |
| **May Thet Hnin** | ASL recognition and prediction validation |
| **Lucas Nguyen** | UI/UX and game screens |
| **Max Keegan** | Game logic, integration, and deployment |

---

<div align="center">

**SignDuo — Fingerspell. Race. Learn.** 🤟

*An educational hackathon prototype for practicing a supported subset of ASL fingerspelling.*

</div>
