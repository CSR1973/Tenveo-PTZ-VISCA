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
