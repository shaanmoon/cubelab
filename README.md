# CubeLab v2 — Bluetooth + CFOP Trainer

**Prototype upgrade for the existing CubeLab React application** (not the default Vite template). Contains all 21 PLL, 57 OLL, and 41 standard F2L cases in **each of four slots** via the MIT-licensed `@moishy/algsets` package; random case training; first-move timing; move and facelet tracking; self-guided example solves; next-pair advice; analytics; and Cloudflare Pages deployment instructions.

## Status and verification

This code has been inspected and TypeScript-transpiled for syntax, but **npm packages and hardware cannot be installed/tested in the build environment**. It has NOT been successfully built with dependencies or tested with your Rubik's Connected Cube. The GoCube/Rubik's Connected facelet data format, axis mapping and BLE event behavior must be validated in a browser with your exact hardware before relying on its timer or state recognition. All actual solves still require physical scrambling until Prototype 2 adds LED hardware.

| Requested feature | This implementation | Remaining caveat |
|---|---|---|
| Automatically recognize solved cube | Detects solved states in verified 54-facelet snapshots and by tracking from a synchronized baseline | Hardware `FACELETS` may be unavailable or differently formatted; then manual solved baseline remains necessary |
| Any face orientation | 24 selectable / random reference frames, face/slice/wide move remapping | BLE face numbering, cube rotation/gyro calibration and mixed orientation F2L suggestions require hardware verification |
| Random F2L/OLL/PLL/mixed practice | Yes; equal chance of selecting each enabled category | Random F2L samples among 41 basic cases x 4 slots; advanced extraction cases power the solve coach |
| Full library | 21 PLL, 57 OLL, 164 slot-specific F2L from maintained MIT package | Validate algorithms and move orientations with `npm test` |
| AUF/recognition rotation | Random U pre/post turns and 24 reference frames | AUF pre/post doesn't make all cases equally likely in real scrambles |
| Advanced stats | TPS, Ao5/Ao12, mean, best, recognition, reference move efficiency, completion | BLE timestamps not latency corrected; move efficiency is not proof of optimality; accuracy currently completion rate |
| Full example solve | WCA-style random-state scramble, tracked stages, on-demand CFOP reference and revised guidance | CFOP solver seeks ergonomic cost, not proven global time/HTM optimum; may return partial results after 12s |
| Three F2L strategies | FR-only next candidate, any-slot shortest validated next candidate, and hybrid preference | **Not three complete provably optimal F2L paths**; no candidate is shown when the lookup cannot verify a correct insertion |
| Deploy online | Cloudflare Pages instructions included | Cannot deploy to your Cloudflare/GitHub account without account access and a repository |

## Install and run on Windows

1. Extract the ZIP. Open the **CubeLab_v2** folder in VS Code. Confirm this folder contains `package.json`.
2. On Windows, you can double-click **`START_CUBELAB.cmd`** to install dependencies on first run and open the local app automatically. Or open **Terminal > New Terminal** and run:

   ```powershell
   npm install
   npm run test
   npm run dev
   ```

3. Visit the URL printed by Vite, usually <http://localhost:5173/>. If you used the `.cmd` launcher, your browser opens automatically. The local launcher is **not** permanent cloud deployment.
4. To check a production build, run `npm run build`.

If `npm install` fails retrieving `smartcube-web-bluetooth`, ensure Git is installed and `git --version` works. If `npm run test` or `npm run build` fails, please share the **first** error lines so library/API mismatches can be corrected.

## First demo test (no Bluetooth)

1. Click **Demo: assume solved**.
2. Choose **Algorithm trainer > PLL** and load a case.
3. Click **Instant setup · demo**, then execute the displayed reference solution using the virtual turn buttons. Quarter and half-turn buttons are supplied. Advanced M/slice/wide algorithms can be checked via a physical cube after pairing, or use an alternative face-turn-only case.
4. The timer starts on the first solve move and ends when the selected goal is met.
5. Use **Randomizer** to choose modes, AUF and recognition frame; enable auto-next if desired.
6. **Example solve** generates a random-state 3×3 scramble and offers a CFOP solution upon request.

## Bluetooth / automatic calibration

1. Wake/charge the Rubik's Connected Cube and close the manufacturer's app.
2. Use **desktop Chrome or Edge** at `localhost` or an HTTPS deployment.
3. Press **Connect Bluetooth cube**; select the GoCube/Rubik's Connected device.
4. If the cube advertises `FACELETS`, CubeLab requests them on connect. A valid 54-facelet state in **Kociemba URFDLB order** is reconstructed. This supports automatic solved recognition and scrambled-state synchronization.
5. If the firmware does not provide valid facelets, solve the cube in real life and click **Manual solved baseline · fallback**. Check `R R'` and `U U'` against the live net before using timed sessions.
6. Choose top/front *reference center colors* in case settings. The code maps turn notation into that reference frame; it doesn't assume you always physically hold white up / green forward.
7. The first practice solve begins only after CubeLab recognizes the requested setup from the tracked state.

**Important:** If your cube's facelet stream is not 54 stickers in URFDLB order, it will be rejected with a warning. This is a *safe failure*—the app will not pretend the cube is solved. A hardware-specific decoder is required to support any alternative layout. Free physical rotations can change the visual camera orientation but do not always generate a move event. This implementation does not pretend to infer a gyroscope-to-face mapping without sensor calibration.

## Example solve mode

- Generate a scramble; follow it physically until the target state is detected.
- Allow the first solve turn to start the timer.
- Optionally request a **full reference** (the external solver is time-bounded and may return partial plans). The software tracks whether the cross, F2L, OLL and entire cube are solved.
- **Analyze current state & suggest next step** recomputes a method-specific reference from tracked history. For standard U-up / D-cross orientation, three **next F2L insertion** alternatives are shown if verifiable: front-right-only, all-slots shortest validated, and a hybrid that modestly prefers front-right.
- A front-right-only candidate might be absent once that slot is filled; full rotation-conjugated, arbitrary-slot FR-style solutions are **not yet implemented**.

## Analytics

- First-turn timing uses the browser host clock. Recognition time starts when the setup reaches the target and ends at the first solve move.
- TPS is `observed move events / seconds`, not verified competition-grade move timestamps.
- Ao5/Ao12 trim one best and one worst completed result; *DNFs are currently excluded* (not official WCA regulation treatment).
- Completion percentage measures recorded completed attempts / recorded attempts, not algebraic agreement to a reference algorithm. Any valid alternative counts as solved.
- Move efficiency is `reference HTM / observed HTM`; a number greater than 100% can legitimately occur if the user finds a shorter sequence.
- Results are stored in browser localStorage. Click **Export CSV** to back them up.

## Deploy as a permanent HTTPS website (recommended, not Streamlit)

This project is a React/Vite web app with Web Bluetooth. **Cloudflare Pages** is a better fit than Streamlit (Streamlit runs Python server code and won't improve browser-to-cube Bluetooth access).

1. Create a new GitHub repository (e.g. `cubelab`) and upload the project files (excluding `node_modules`, `dist` and `.env`).
2. Go to <https://dash.cloudflare.com/> → **Workers & Pages** → **Create application** → **Pages** → **Import existing Git repository**.
3. Select the repository, build command **`npm run build`**, output folder **`dist`**, framework preset **Vite** (if offered).
4. Deploy. You receive `https://<your-project>.pages.dev` and can bookmark it. It auto-updates after pushing changes.
5. Connect your cube from the deployed Chrome/Edge web app. HTTPS is required for Web Bluetooth. Your solve history stored via `localStorage` will be separate from the one on `localhost`; export/import is not implemented (CSV export is).

Use `npm run build` locally first. Cloudflare builds need Git access to fetch `smartcube-web-bluetooth` from GitHub; if its git dependency is problematic, vendor/pin the library as a later hardening step.

## Developer architecture

- `src/lib/engine.ts`: complete CFOP catalogue from `@moishy/algsets`, move remapping, 54-facelet decoder, state rules, randomizer and F2L advice.
- `src/lib/guide.ts`: `@moishy/cfop` planner, verified next-step F2L advice.
- `src/lib/stats.ts`: attempt persistence, Ao5/Ao12, TPS, efficiency, CSV export.
- `src/App.tsx`: Bluetooth adapter, tabs, setup state machine, timers, analytics UI.
- `src/components/FaceletNet.tsx`: always-current 54-facelet net, including states synchronized without a historical scramble.
- `src/components/CubeView.tsx`: 3D target preview via `cubing.js`.

Attribution: algorithms `@moishy/algsets` (MIT, Moshe Rosenberg); CFOP solver `@moishy/cfop` (MIT); state framework `@moishy/cubing-core` (MIT); BLE adapter `smartcube-web-bluetooth` (MIT); visualizations/scrambles `cubing.js` (MPL-2.0 OR GPL-3.0-or-later). See upstream package licenses.
