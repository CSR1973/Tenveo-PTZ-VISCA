# companion-module-tenveo-ptz

A **Bitfocus Companion 4.x** module for controlling **Tenveo PTZ cameras**
(TEVO-VHD20HAN, VHD10/20/30 and other Tenveo IP PTZ models) over
**VISCA-over-IP** (UDP port 52381).

This module exists because the Sony VISCA and PTZOptics VISCA modules don't
cover the full Tenveo command set — most importantly the Gain controls and
some Tenveo-specific defaults (preset count, color-temperature mapping,
focus-lock command bytes).

It exposes **button and Stream Deck + rotary/encoder** variants for every
continuous control (Pan, Tilt, Zoom, Focus, Gain, Iris, Shutter).

> **Tested with:** Tenveo TEVO-VHD20HAN on Companion 4.3.4, Node 18 / 20.

---

## What's inside

```
companion-module-tenveo-ptz/
├── companion/
│   ├── manifest.json     # module metadata (id, runtime, etc.)
│   └── HELP.md           # rendered inside Companion's "Help" tab
├── src/
│   ├── main.js           # InstanceBase – entrypoint
│   ├── config.js         # connection settings fields
│   ├── commands.js       # all VISCA byte builders (Tenveo-aware)
│   ├── visca.js          # UDP transport + VISCA-over-IP header
│   ├── actions.js        # all Companion actions (button + rotary)
│   ├── feedbacks.js      # boolean feedbacks
│   ├── presets.js        # default Stream Deck button presets
│   └── variables.js      # dynamic variables
├── test/
│   ├── cli.js            # standalone command-line tester
│   └── mock-camera.js    # mock VISCA-over-IP camera (for unit tests)
└── package.json
```

---

## Installation into Companion 4.3.4

Bitfocus Companion supports loading **developer modules** from a folder on
disk. You don't need to publish anything — just point Companion at this
directory.

### 1. Install Node dependencies

```bash
cd companion-module-tenveo-ptz
yarn install         # or:  npm install
```

### 2. Tell Companion where to find the module

1. Open Companion (4.3.4 or newer).
2. Go to **Settings → Developer modules path** (`Modules → Developer modules`
   in some builds).
3. Pick the **parent directory** that contains
   `companion-module-tenveo-ptz/` (Companion auto-discovers any folder
   inside it that has a `companion/manifest.json`).
4. Restart Companion.

You should now see **Tenveo PTZ** in the connection picker.

### 3. Add a connection

- **Connection type:** Tenveo PTZ
- **Label:** anything (e.g. `cam-stage-left`)
- **IP Address:** `192.168.88.11` (or `.12 / .13 / .14`)
- **VISCA Port:** `52381` (default)
- **Camera ID:** `1` (only relevant when daisy-chaining over serial)

Click **Save**. The status should turn green within ~1 s.

> If it stays orange/red:
> - Confirm VISCA-over-IP is **enabled** in the camera OSD
>   (Menu → System → VISCA → Network = ON).
> - From a machine on the same LAN run:
>   `node test/cli.js 192.168.88.11 home` — if that works, Companion will too.

### 4. Add all four cameras

Repeat the connection step for `.11`, `.12`, `.13`, `.14`. Each connection
gets its own variable namespace, e.g. `$(cam-stage-left:zoom_position)`.

---

## Using on the Stream Deck XL **and** the Stream Deck +

### Stream Deck XL (buttons only)

All button actions follow the **press / release** pattern:

- **Press** → start motion
- **Release** → auto-stop

So for *Pan Left*, configure:
- **Pressed** step → `Pan/Tilt: Left` (speed = 12)
- **Released** step → `Pan/Tilt: Stop`

The included presets do this automatically. Drag the **PTZ Pad** category
straight onto your deck.

### Stream Deck + (rotary encoders)

The bottom row of the Stream Deck + has four rotary knobs ("encoders"),
each with **rotate left**, **rotate right** and **press** slots.

Bind the dedicated rotary actions (which already include an auto-stop):

| Knob | Rotate Left action | Rotate Right action | Press action |
|------|-------------------|---------------------|--------------|
| 1 | `Rotary: Pan Left` | `Rotary: Pan Right` | `Pan/Tilt: Home` |
| 2 | `Rotary: Tilt Down` | `Rotary: Tilt Up` | `Pan/Tilt: Stop` |
| 3 | `Rotary: Zoom Out` | `Rotary: Zoom In` | `Zoom: Stop` |
| 4 | `Rotary: Focus Near` | `Rotary: Focus Far` | `Focus: Auto Toggle` |

Each rotary action has an **Auto-stop hold (ms)** option. When the encoder
keeps rotating, the timer is extended so motion continues smoothly. When
rotation stops, after `holdMs` the corresponding **stop** command is sent.

For discrete-step controls (Gain, Iris, Shutter) use the `Rotary: <X> Up`
and `Rotary: <X> Down` actions which simply step the value per click of
the encoder.

---

## Testing without Companion

### A. Talk directly to a real camera

```bash
# from a machine that can reach 192.168.88.11
node test/cli.js 192.168.88.11 home
node test/cli.js 192.168.88.11 recall 3
node test/cli.js 192.168.88.11 zoom-in 4 800     # zoom in, speed 4, 800ms
node test/cli.js 192.168.88.11 gain 9
node test/cli.js 192.168.88.11 raw "81 01 04 38 02 FF"
```

### B. Talk to the mock camera (no hardware)

In one terminal:

```bash
node test/mock-camera.js              # listens on 0.0.0.0:52381
```

In another terminal:

```bash
node test/cli.js 127.0.0.1 power-on
node test/cli.js 127.0.0.1 recall 5
```

You'll see hex packets flowing both ways and the ACK/Completion replies.

The mock camera also keeps internal state (zoom, focus, gain, etc.), so
you can verify the inquiry parsers by polling it from Companion.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Connection stays orange | VISCA-over-IP disabled on camera | OSD → System → VISCA → Network = **ON** |
| Commands ignored | Wrong UDP port | Tenveo default is 52381 (some firmwares use 1259) |
| Pan/tilt drifts | Speed too high → servo overshoots | Lower default Pan/Tilt speed in connection config |
| Gain not changing | Tenveo "Gain Direct" only works in **Manual** AE mode | First send *Exposure: Mode → Manual* |
| Polling errors in log | Firmware doesn't respond to inquiries | Set *Polling Interval = 0* |

---

## License

MIT — see header in each source file.
