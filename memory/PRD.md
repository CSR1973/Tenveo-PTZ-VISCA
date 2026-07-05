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
  ├── test/          (10 automated test suites, 297 assertions)
  ├── companion/     (HELP.md, manifest.json)
  └── tenveo-ptz-1.14.0.tgz  (latest built artifact)
```

## Implementation Status

### v1.14.0 (2026-02) — Yellow Triangle fix
- Wrapped every action callback in `wrapCallbacksSafely()` so a runtime throw
  is logged via `self.log('error', ...)` INSTEAD of bubbling up to Companion
  as a Yellow Triangle. Verified with 5-assertion `callback-safety.test.js`.
- Added `runEntrypoint`-level upgrade script that migrates any legacy ExpComp /
  Gain-NDI action IDs to their current names (`expcomp_step_up→expcomp_up`, etc.).
- HELP.md changelog + troubleshooting entry added.

### v1.13.0 — AE Mode toggle + focus polling on AF change
### v1.12.0 — ExpComp AE Mode variables + feedback, rotary Focus refactor
### v1.11.0 — Axis-independent Home + Backlight rename
### v1.10.0 — Pan/Tilt step calibration (108.74 units/deg)
### v1.0.0–v1.9.x — Base VISCA-over-IP module, ONVIF presets, rotary variants

## Known Limitations
- NDI firmware silently drops `CAM_FocusPosInq` → falls back to elapsed-time focus
  estimation (documented in HELP.md).
- Companion 3.x+ always shows a module's local version as "dev" in the UI.

## Backlog (P1 / P2)
- **P1** — "Save current PTZ+I+F snapshot as a soft-preset" (Companion custom variable).
- **P2** — Split `src/actions.js` (~1400 lines) into `src/actions/ptz.js`, `image.js`, etc.

## Testing
- `npm test` runs 10 suites, 297 assertions, all passing (2026-02).
- Physical hardware testing on `192.168.88.11–14` requires user's local network.

## Credentials
- ONVIF: `admin` / `admin` (see `/app/memory/test_credentials.md`).
