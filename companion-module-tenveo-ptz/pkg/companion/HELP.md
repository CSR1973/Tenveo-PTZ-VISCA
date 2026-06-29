# Tenveo PTZ Companion Module

Control Tenveo PTZ cameras (e.g. **TEVO-VHD20HAN**, VHD10/20/30 series) from Bitfocus Companion 4.x using **VISCA over IP** (UDP port 52381). This module is tailored to Tenveo's command set, which is close to — but not identical to — Sony/PTZOptics VISCA. It includes both **standard button actions** and **Stream Deck + rotary/encoder variants**.

---

## Configuration

| Field | Description |
|-------|-------------|
| **Camera Name** | A friendly name shown in variable labels (e.g. "Stage Left") |
| **IP Address** | IPv4 address of the camera (e.g. `192.168.88.11`) |
| **VISCA Port** | UDP port (default **52381**) |
| **Pan Speed (default)** | 1–24 — used when a Pan action does not override speed |
| **Tilt Speed (default)** | 1–20 — used when a Tilt action does not override speed |
| **Zoom Speed (default)** | 0–7 — used when a Zoom action does not override speed |
| **Polling Interval (ms)** | How often to poll camera state for feedbacks (0 to disable) |
| **Verbose Logging** | Logs every TX/RX VISCA packet (debug only) |

---

## Actions

### Pan / Tilt / Zoom (Button)
- **Pan Left / Right / Stop**
- **Tilt Up / Down / Stop**
- **Pan/Tilt diagonal** (Up-Left, Up-Right, Down-Left, Down-Right) — auto-stops on release
- **Pan & Tilt (with speed override)** — pass custom speeds
- **Zoom In / Out / Stop** with optional speed override
- **Home position**

### Pan / Tilt / Zoom (Rotary / Encoder — Stream Deck +)
- **Pan (Rotary)** — rotate left = pan left, right = pan right. Speed scales with rotation magnitude.
- **Tilt (Rotary)** — rotate up/down
- **Zoom (Rotary)** — rotate to zoom in/out
- **Focus (Rotary)** — rotate to focus near/far (manual focus)

All rotary actions accept an **Amount Multiplier** so you can tune sensitivity per button.

### Presets
- **Recall Preset** (1–255)
- **Save Preset** (1–255)
- **Clear Preset** (1–255)
- **Preset Recall Speed** (0–24) — sets the global recall speed
- **Recall Preset (variable)** — accepts a Companion variable so a single button can recall a chosen preset

### Focus
- **Auto Focus On / Off / Toggle**
- **Focus Near / Far / Stop** (manual)
- **One-Push Auto Focus**
- **Focus Lock / Unlock**
- **Focus (Rotary)** — see above

### Exposure & Image
- **Exposure Mode**: Full Auto / Manual / Shutter Priority / Iris Priority / Bright
- **Iris**: Up / Down / Direct value (0–13)
- **Shutter**: Up / Down / Direct value (0–21)
- **Gain**: Up / Down / Direct value (0–14)  ← *Tenveo-specific, missing from PTZOptics module*
- **Gain (Rotary)** — rotate to step gain up/down
- **Iris (Rotary)** — rotate to step iris up/down
- **Shutter (Rotary)** — rotate to step shutter up/down
- **Bright**: Up / Down / Direct value (0–27)
- **Exposure Compensation**: On / Off / Up / Down / Direct
- **Back Light Compensation**: On / Off

### White Balance
- **WB Mode**: Auto / Indoor / Outdoor / One-Push / Manual / ATW / Sodium / Color Temp
- **One-Push WB Trigger**
- **R-Gain / B-Gain**: Up / Down / Reset / Direct
- **Color Temperature**: Up / Down / Direct (2500–8000 K)

### System / OSD
- **Power On / Off / Toggle / Standby**
- **OSD Menu Open / Close / Toggle**
- **OSD Navigate**: Up / Down / Left / Right / Enter / Back
- **IR Receive On / Off**
- **Camera ID**: set for daisy-chained units
- **Custom VISCA**: send any raw VISCA hex string (e.g. `81 01 04 00 02 FF`)

---

## Feedbacks

- **Preset Recalled** — highlight buttons when a particular preset was the last one recalled
- **Power State** — On / Off
- **Auto Focus State** — On / Off
- **Exposure Mode** — matches selected mode
- **WB Mode** — matches selected mode
- **PTZ Moving** — highlight when camera is panning/tilting/zooming
- **Connection State** — turn red when camera is unreachable

---

## Variables

- `$(tenveo:camera_name)` — friendly name from config
- `$(tenveo:host)` — IP address
- `$(tenveo:connected)` — `true`/`false`
- `$(tenveo:last_preset)` — last preset number recalled
- `$(tenveo:power)` — `on` / `off`
- `$(tenveo:af)` — `on` / `off`
- `$(tenveo:exposure_mode)`, `$(tenveo:wb_mode)`
- `$(tenveo:gain)`, `$(tenveo:iris)`, `$(tenveo:shutter)`
- `$(tenveo:zoom_position)`, `$(tenveo:focus_position)`
- `$(tenveo:pan_position)`, `$(tenveo:tilt_position)`

---

## Stream Deck + Notes (Rotary / Encoder)

When you place a **Rotary** action on a Stream Deck + encoder, Companion calls the action repeatedly with the rotation `direction` and `step` size.

This module exposes dedicated rotary actions (`*_rotary`) that:
- read the rotation direction from the encoder event
- map step → VISCA speed value
- auto-issue a **stop** command when rotation halts (debounced 120 ms)

You can also assign any standard button action to an encoder press; rotation will simply not be processed.

---

## Tips

- Tenveo cameras default to **DHCP**. Pin them to a static IP in the camera OSD (Menu → Network).
- Some Tenveo firmware revisions ignore VISCA replies for inquiries (`0x09 …`). If polling causes warnings in your logs, disable polling.
- The Gain command set differs between Sony and PTZOptics firmware. This module uses Tenveo's mapping (`81 01 04 0C 0p FF` direct, where p = 0…14).
- For daisy-chained cameras over RS-485, set the proper camera address in the *Camera ID* action; the module always uses VISCA-over-IP packet header (always-on for IP).

---

## Troubleshooting

1. **No connection** — Verify UDP 52381 is open and the camera's VISCA-over-IP is enabled in the OSD (Menu → System → VISCA → Network).
2. **Commands work but feedbacks don't update** — Some Tenveo models do not respond to inquiries. Disable polling.
3. **Drifting position** — Lower the pan/tilt default speed; some servos overshoot on quick stops.
4. **Preset recall too fast/slow** — Use the *Preset Recall Speed* action.

See `README.md` in the module repository for development & contribution guidance.
