# Tenveo PTZ Companion Module — PRD

## Original Problem Statement
Build a Bitfocus Companion 4.x module for Tenveo PTZ cameras (TEVO-VHD20HAN, TEVO-VHD20H-U) with:
- VISCA-over-IP (UDP 52381) transport
- Full PTZ + focus + exposure controls
- Button and rotary (Stream Deck XL+) variants
- Companion 4.3.4 compatibility
- Support for 4 cameras on 192.168.88.11–14

## Architecture
```
/app/companion-module-tenveo-ptz/
  ├── src/           (main.js, actions.js, commands.js, config.js, feedbacks.js, onvif.js,
  │                   presets.js, variables.js, visca.js)
  ├── test/          (12 automated test suites, 340 assertions)
  ├── companion/     (HELP.md, manifest.json)
  └── tenveo-ptz-1.15.0.tgz  (latest built artifact)
```

## Implementation Status

### v1.15.0 (2026-02) — Rotary preset browsing + smoother zoom rotary
- New SAVE rotary + RECALL rotary. Rotate to scroll `preset_save_index` /
  `preset_recall_index` (variables shown on the button face); push to commit
  save/recall. Configurable `min` / `max` / `step` with wrap-around.
- Zoom rotary default `idleMs` raised from 200/250 → **800 ms** so slow spins
  no longer stutter-stop between rotary ticks.
- Added `test/preset-rotary.test.js` (23 assertions).

### v1.14.2 — ExpComp action labels renamed
- Made the ExpComp toggle (opcode 0x3E, compensation on/off) impossible to
  confuse with the AE Mode toggle (opcode 0x39, Full-Auto ↔ Manual, the one
  the user wanted for visible image changes).

### v1.14.1 — Upgrade-script shape fix
- Return `updatedActions` / `updatedFeedbacks` as ARRAYS (was objects; crashed
  all connections to red on v1.14.0 import).
- Added `test/upgrade-script.test.js` (20 assertions).

### v1.14.0 — Safe callback wrapper
- Wrapped every action callback in try/catch → runtime errors log to Companion
  Log tab instead of surfacing as a Yellow Triangle.
- Added legacy action-id upgrade script (`expcomp_step_up→expcomp_up`, etc.).
- Added `test/callback-safety.test.js` (11 assertions).

### v1.13.0 — AE Mode toggle + focus polling on AF change
### v1.12.0 — ExpComp AE Mode variables + feedback, rotary Focus refactor
### v1.11.0 — Axis-independent Home + Backlight rename
### v1.10.0 — Pan/Tilt step calibration (108.74 units/deg)
### v1.0.0–v1.9.x — Base VISCA-over-IP module, ONVIF presets, rotary variants

## Known Limitations
- NDI firmware silently drops `CAM_FocusPosInq` → falls back to elapsed-time
  focus estimation (documented in HELP.md).
- Companion 3.x+ always shows a module's local version as "dev" in the UI.
- The transient green ▶ *action-running* indicator drawn top-right by
  Companion during callback execution can look yellow on colored Stream Deck
  LCD buttons — **not** an error.

## Backlog
- **P1** — Soft-preset snapshot: save current PTZ+I+F state into a Companion
  custom variable for unlimited restart-safe soft-presets.
- **P1** — "One-Touch Exposure" combo preset (Manual + ExpComp ±3 + Iris f/4
  in a single tap, revert on second tap).
- **P2** — Split `src/actions.js` (~1600 lines) into `actions/ptz.js`,
  `actions/image.js`, `actions/preset.js`, etc.

## Testing
- `npm test` runs 12 suites, **340 assertions**, all passing (2026-02).
- Physical hardware testing on `192.168.88.11–14` requires user's local network.

## Credentials
- ONVIF: `admin` / `admin` (see `/app/memory/test_credentials.md`).
