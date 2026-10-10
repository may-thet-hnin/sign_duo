# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Integration-test build (temporary)

The current `src/App.jsx` is a **temporary solo integration test screen** for Person 1 (camera), Person 2 (A/B/L recognition), and Person 4 (race engine). Person 3's unfinished interface files are unchanged.

1. Run `npm install` in the project folder, then `npm run dev`.
2. Open the local URL, click **Start Solo Test**, and grant camera permission.
3. If MediaPipe loads, hand landmark dots and `Raw webcam prediction` appear. Present supported A/B/L handshapes; recognition is still experimental and may need calibration.
4. Hold each sign for several frames, then remove your hand until `Unknown / no hand` appears before trying the next sign.
5. You can use the explicitly labeled **Simulate A/B/L** buttons to test game logic separately from webcam recognition.
6. Run `node --test tests/integration.test.js` for dependency-free logic tests, and `npm run build` after installing dependencies.

Known limitations: two-player camera selection has not been integrated; ASL handshape recognition is heuristic and not validated. This temporary test UI is intentionally not the final design. Some dependencies require model resources from the internet on first load. Do not merge this test UI over the final UI without coordinating with Person 3.

## New: local Duo Mode (functional integration test)

The temporary `src/App.jsx` test screen supports **Solo** and **Duo**.
For Duo, connect **two distinct physical webcams to one computer** (e.g., built-in + USB).
From the setup page choose **Duo**, click **Find Cameras / Allow Permission**,
select **different cameras** for Player 1 and Player 2, and click **Start Duo Race**.
Each player has a separate camera stream, separate letter stabilizer, and separate
race progress. Both receive the same A/B/L sequence. One webcam **cannot** be
used for independent two-player tracking. Networked two-computer races are not
implemented. If two USB webcams cannot stream simultaneously, check OS/browser
permissions or try a different USB port/resolution; there is no automatic fallback.

Experimental L recognition now checks the thumb-index opening to reduce
sensitivity to **in-plane** hand tilt. It is not guaranteed accurate and needs
calibration with real hands. The simulation buttons are labeled and do not count
as live webcam recognition. This integration test intentionally does not modify
Person 3's unfinished UI files.

Run `node --test tests/integration.test.js` for the pure-JS unit tests;
`npm install` then `npm run dev` to try cameras, and `npm run build` locally.
