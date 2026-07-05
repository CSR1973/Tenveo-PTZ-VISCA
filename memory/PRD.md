# Tenveo PTZ Companion Module — PRD

## Original problem statement
> Can you build a Companion Module for Tenveo PTZ Cameras?

## User constraints (gathered via ask_human)
- Hardware: 4× **Tenveo TEVO-VHD20HAN** at `192.168.88.11–14`
- Existing modules tried: Sony VISCA + PTZOptics VISCA — neither cover full Tenveo set (Gain missing)
- Protocol: **VISCA over IP, UDP 52381**
- Controls: full (PTZ, presets, focus, exposure inc. **Gain**, WB, power, OSD)
- Variants: **button + Stream Deck + rotary/encoder**
- Target: **Bitfocus Companion 4.3.4**
- Deliverable: full Node module + usage/test instructions

## Architecture

### Primary — Companion module (Node 18+, ESM)
```
/app/companion-module-tenveo-ptz/
├── companion/manifest.json   (id: tenveo-ptz, api 1.13.0)
├── companion/HELP.md         (renders in Companion's Help tab)
├── src/main.js               (InstanceBase entrypoint)
├── src/config.js             (host/port/speeds/cameraId/poll/verbose)
├── src/visca.js              (UDP transport + 8-byte VISCA-over-IP header)
├── src/commands.js           (Tenveo-aware VISCA byte builders)
├── src/actions.js            (~80 button + rotary actions)
├── src/feedbacks.js          (preset / power / AF / AE / WB / connection)
├── src/variables.js          (zoom_position, gain, iris, …)
├── src/presets.js            (drag-and-drop Stream Deck buttons)
├── test/cli.js               (standalone protocol tester)
├── test/mock-camera.js       (fake VISCA-over-IP camera on UDP 52381)
└── README.md
```

### Secondary — Web companion (FastAPI + React)
- **Backend (`/app/backend/server.py`)**: VISCA byte builders mirroring the JS module + 3 endpoints:
  - `GET /api/catalog` — all 93 commands across 12 groups
  - `POST /api/preview` — wraps payload in VISCA-over-IP header, returns hex + decoded explanation
  - `POST /api/companion-config` — generates Companion connection JSON for the user's 4 cameras
- **Frontend (`/app/frontend/src/App.js`)**: dark technical UI with 4 tabs
  - Command Explorer (sidebar groups → cards → live packet inspector)
  - Install & Setup (6-step install + connection-wizard JSON + CLI snippets)
  - Stream Deck + (encoder mapping table + visual mock)
  - Module Files (file-tree reference)

## Verification done
- ✅ Mock camera ↔ CLI roundtrip — all commands produce byte-perfect VISCA:
  - Power on: `81 01 04 00 02 FF`
  - Preset recall 5: `81 01 04 3F 02 05 FF`
  - Gain direct 9: `81 01 04 4C 00 00 00 09 FF`
  - Zoom in speed 4: `81 01 04 07 24 FF`
  - Auto-stop chain (zoom/focus/pt) confirmed
  - Color temp 5600K → index 31: `81 01 04 20 01 0F FF`
- ✅ Backend `/api/preview` correctly substitutes camera-ID byte (0x81 → 0x83 for ID=3)
- ✅ Backend bad-payload guard (missing 0xFF) → 400
- ✅ Frontend renders all 4 tabs, catalog populates, inspector decodes commands
- ✅ JS + Python lint clean
- ✅ Node module yarn install OK (`@companion-module/base` 1.11.3)

## What's implemented (2026-01-29)
- Full VISCA command set per Tenveo TEVO-VHD20HAN spec (93 commands)
- Stream Deck + rotary actions for Pan/Tilt/Zoom/Focus/Gain/Iris/Shutter with auto-stop debouncing
- Feedbacks for preset recall, power, AF, AE mode, WB mode, connection state
- Variables for camera state polling (zoom/focus/pan/tilt position, gain, iris, shutter)
- Pre-built presets (PTZ Pad, Zoom, Focus, Preset 1-12 recall+save, Power, OSD)
- Mock camera + CLI tester for offline validation
- Web companion: catalog browser, packet inspector, connection-wizard, CLI snippets

## What's implemented (2026-02-XX — v1.12.0)
- **Fixed focus/zoom rotary variables that stayed at 0.** Root cause: `focus_rotary_near/far`
  and `zoom_rotary_in/out` used the old `pulse()` helper that fires drive + auto-stop but never
  touched `state.focusPos`/`state.zoomPos` or published variables. Rerouted all four actions
  through `focusDriveStep`/`zoomDriveStep` so they now publish `focus_position`/`focus_percent`/
  `zoom_position`/`zoom_percent` on every click, same as the STEP actions.
- **New ExpComp Auto/Manual toggle** — `expcomp_toggle` action flips between Manual (On =
  compensation applied) and Auto (Off = no compensation). Companion command `expcomp_on` and
  `expcomp_off` now also track state, publish the new `exposure_compensation_mode` variable
  ('on'/'off'/'unknown'), and trigger the new `expcomp_mode_state` boolean feedback.
- New `inqExpCompMode` (`81 09 04 3E FF`) added to the poll cycle so the mode syncs from camera.
- **"Dev" label** in Companion UI clarified: it's Bitfocus's own convention for any module
  loaded via the *Developer modules path* — not something the module can override.
- Tests: 8 suites via `npm test`, 253 assertions total, all pass.

## What's implemented (2026-02-XX — v1.11.1)
- **Fixed "new variables never appear + module shows 'dev'"** — `companion/manifest.json.version`
  had been stuck at `1.3.2` across every previous package.json bump. Companion keys its module
  cache on `manifest.version`; when the version doesn't change between installs, Companion skips
  re-registering variables/actions/feedbacks, so newly added ones (`exposure_compensation`,
  `iris_fstop`, `focus_percent`, `zoom_percent`, `backlight`) silently never appeared in the UI.
- **Fix:** bumped manifest.json to 1.11.1, added `npm run sync-manifest` script that copies
  package.version → manifest.version, wired `npm run build` to run sync-manifest automatically
  before packaging. Fixed `npm run dev` script to pass the `--dev` flag correctly. Added an
  `npm test` aggregator that runs all 7 suites.
- **New regression guard:** `test/manifest-sync.test.js` — 21 assertions that fail-fast if
  package.json and manifest.json ever diverge again, and verifies the built tarball contains
  the expected manifest + variable string literals.
- Tests: 224 total across 7 suites, all pass.

## What's implemented (2026-02-XX — v1.11.0)
- **New `exposure_compensation` variable** (integer -7..+7, 0 = neutral). Poll reads via new
  `inqExpComp` (`81 09 04 4E FF`) and maps raw 0..14 → display raw−7. All `expcomp_*` and
  variant-routed `gain_*` actions maintain a local tracker so the variable updates instantly
  regardless of camera poll reply. New `expcomp_direct` action takes -7..+7 (sends raw+7 on wire).
- **New `iris_fstop` variable** (string). Lookup table `C.IRIS_FSTOP` (14 entries) matches the
  Tenveo VHD20 web UI: `0=Off, 1=f32.0, 2=f16.0, 3=f10.0, 4=f8.0, 5=f6.0, 6=f4.0, 7=f3.4, 8=f3.0,
  9=f2.63, 10=f2.2, 11=f2.0, 12=f1.85, 13=f1.6`. Iris actions publish both raw `iris` and
  `iris_fstop` label atomically.
- **HELP.md updated** with troubleshooting note explaining focus/expcomp/iris variable behaviour
  on NDI (firmware silently drops those inquiries — variables driven by local tracker only).
- Tests: 43 new + 160 regression = 203 assertions across 8 suites, all pass.

## What's implemented (2026-02-XX — v1.10.0)
- **Fixed focus + zoom rotary STEP variables that stayed at 0.** Root cause was two-fold:
  (a) both `zoomDriveStep` and `focusDriveStep` only published variables when the auto-stop
  timer fired, so in real Companion runtime the update didn't propagate reliably; (b) the
  poll's `_setZoomPos` / `_setFocusPos` would overwrite the tracker to 0 whenever the camera
  didn't return a good reply.
- **Fix:** publish variables on EVERY click using `baseline + elapsed × unitsPerSec × direction`
  (real-time estimation). Auto-stop still runs to refine the final value + send zoomStop/focusStop.
  Poll handlers now guard: if a drive is in progress or its auto-stop is pending, the polled value
  is IGNORED — the module-side estimate stays authoritative.
- Tests: 201+/201+ across 7 suites.

## What's implemented (2026-02-XX — v1.9.0)
- **Fixed empty focus variables** — same root cause as the v1.7.0 zoom bug: Tenveo NDI firmware
  silently drops `inqFocusPos` and `state.focusPos` was initialised to `null`. Fix mirrors the zoom
  drive+auto-stop pattern:
  - `state.focusPos` now initialises to `0` (was `null`).
  - New helpers `updateFocusVars(self)` and `focusDriveStep(self, dir, speed, idleMs)`.
  - `focus_near`, `focus_far`, `focus_stop`, and new `focus_step_near`/`focus_step_far` all
    record drive start/speed/direction and flush distance on stop → `focus_position` and
    `focus_percent` publish unconditionally, no longer depending on camera reply.
  - New `focus_reset_tracker` action to seed/zero the tracker without moving the camera.
  - New config field `focusUnitsPerSec` (default 3200 units/s @ speed 7).
- Tests: 179+/179+ across 6 suites.

## What's implemented (2026-02-XX — v1.8.0)
- **Fixed "Home: Tilt only also homes pan" bug** — new `refreshPanTiltFromCamera(self)` issues `inqPtPos`
  before pan_home_only / tilt_home_only, reverses the calibration back to fresh degrees, and uses the
  live pan/tilt so the untouched axis is byte-exact even when the tracker was stale (e.g., after a
  preset recall or manual joystick move). Graceful fallback to tracker when the camera is unreachable.
- **BLC actions renamed to "Backlight"** in display names. New `blc_toggle` action + `backlight_state`
  boolean feedback. State is now tracked in `state.blc` and polled via new `inqBLC` (`81 09 04 33 FF`).
- **New `focus_percent` variable** (0=near, 100=far) — populated on `focus_direct` and by the poll
  loop's `_setFocusPos`. Companion syntax: `$(Tenveo_PTZ_11:focus_percent)`.
- **Zoom STEP default `idleMs` bumped 120 → 250 ms** to reduce start/stop cycles during slow rotary
  spins (this is the software mitigation the user requested).
- Poll cycle now also reads pan/tilt position (via `inqPtPos`) so the tracker auto-syncs from the
  physical camera every poll interval — pan_degrees / tilt_degrees stay accurate.
- Tests: 150/150 across 5 suites.

## What's implemented (2026-02-XX — v1.7.0)
- **Zoom stepping reverted to variable-speed drive + auto-stop** (the v1.0.0 pattern that felt smooth).
  A rotary spin now emits a single `zoomTeleVar`/`zoomWideVar` at the chosen speed and a single
  `zoomStop` after `idleMs` of no more clicks — eliminating the jitter caused by rapid `zoomDirect`
  targets on Tenveo NDI firmware.
- **`state.zoomPos` is estimated from elapsed drive time × `zoomUnitsPerSec`** (new configurable
  field, default 3200 u/s @ speed 7) so `zoom_position` and `zoom_percent` variables track
  continuous drives correctly. Direction reversal flushes distance before switching.
- **Fixed empty `zoom_position` variable** — `state.zoomPos` now initialises to `0` (was `null`);
  `_publishStaticVars` seeds both `zoom_position` and `zoom_percent` at 0.
- Tests: 99 assertions across 4 suites (32 primary + 26 regression + 10 + 41 independent).

## What's implemented (2026-02-XX — v1.6.0)
- **Three axis-independent Home actions**: `pan_home_only` (moves pan to 0° while preserving tilt & zoom),
  `tilt_home_only` (moves tilt to 0° while preserving pan & zoom), `zoom_home_only` (widest, preserves
  pan/tilt). Pan/Tilt homing composes `ptAbsolute(centerU, currentAxisU, ...)` using the tracked
  degrees so the untouched axis stays byte-exact on the wire.
- **Zoom stepping rewritten** to use smooth direct-position stepping with 40 ms coalescing:
  `state.zoomPos += delta` per click, one `zoomDirect(pos)` packet per coalesce window. Replaces the
  old fire→wait→stop pulse pattern that felt "steppy" and dropped clicks under the busy-lock.
- **New variable `zoom_percent`** (0 = widest, 100 = tele). Updated on step actions, direct-position
  action, home actions, and via polling loop.
- Tests: 30/30 new + 26/26 regression + 28/28 independent (testing agent). Package v1.6.0
  at `/app/companion-module-tenveo-ptz/tenveo-ptz-1.6.0.tgz`.

## What's implemented (2026-02-XX — v1.5.0)
- **Rotary STEP Pan/Tilt now uses user-calibrated absolute-position math.** Defaults match the
  physically measured VHD20HAN: pan center 19050 units, 108.74 units/°; tilt center 8000 units,
  86.66 units/°; pan limits ±175°; tilt limits ±90°. Formula: `panU = panCenter + panDeg × panUnitsPerDeg`,
  masked into signed 16-bit for VISCA wire encoding.
- New configurable calibration fields: `panCenter`, `panUnitsPerDeg`, `panMinDeg`, `panMaxDeg`,
  `tiltCenter`, `tiltUnitsPerDeg`, `tiltMinDeg`, `tiltMaxDeg`. Direction inversion via sign flip on
  the units-per-degree field.
- Coalescing throttle (30 ms window) is retained: 37 rapid clicks → single ptAbsolute packet
  carrying summed target (~+37° = panU 23073). Confirmed via 26/26 assertion Node harness
  (`/app/companion-module-tenveo-ptz/test/step-calibration.test.js`) + independent re-verification
  by testing agent.
- Package version bumped to **1.5.0**, tarball at `/app/companion-module-tenveo-ptz/tenveo-ptz-1.5.0.tgz`.

## What's implemented (2026-02-XX — v1.4.0)
- **Rotary STEP Pan/Tilt rewritten** to use **absolute-degree mapping** on both variants (Standard + NDI).
  Every click adjusts an internal degree counter and schedules a single **throttled ptAbsolute
  command (30 ms coalesce window)**. Fast dial spins now end at exactly the summed target position
  (e.g. 37 quick clicks right = +37° from previous position). Fixes NDI-variant erratic 1°/10° behaviour.
- **Pan/Tilt HOLD (`pt_up/down/left/right/diagonals`) now updates `pan_degrees` / `tilt_degrees`**
  on release, using elapsed time × configured °/s calibration. `pt_stop` finalises the tracking.
- New action: **`pt_step_reset`** — zeroes the internal degree counter without moving the camera
  (useful when the physical camera has been re-homed manually).
- New config fields: `panDegPerSec` (default 100 @ speed 24), `tiltDegPerSec` (default 60 @ speed 20)
  for HOLD calibration. Removed the now-unused `msPerDegree` field.
- Package version bumped to **1.4.0**, tarball at `/app/companion-module-tenveo-ptz/pkg/tenveo-ptz-1.4.0.tgz`.

## Not implemented / Future backlog
- P1 — Real-camera calibration of `unitsPerDegree` (default 14) and `panDegPerSec` / `tiltDegPerSec`
  on the user's VHD20HAN via observed physical movement
- P2 — Custom IP-Visca header for Sony-style daisy-chain replies
- P2 — Optional TCP transport (some firmwares expose VISCA over TCP on port 1259)
- P3 — Companion v2/v3 backport
- P3 — Web UI: live UDP probe to verify camera reachability from the user's machine

## How the user verifies it
1. Copy `/app/companion-module-tenveo-ptz/` to a machine on the 192.168.88.0/24 LAN
2. `cd companion-module-tenveo-ptz && yarn install`
3. (Optional smoke test) `node test/cli.js 192.168.88.11 home`
4. In Companion 4.3.4 → Settings → Developer modules path → pick the parent folder → restart
5. Add 4 connections, type "Tenveo PTZ", IPs 11/12/13/14, port 52381
6. Drag the "Tenveo PTZ" presets onto the deck; for the Stream Deck +, bind the four "Rotary:" actions to the encoders
