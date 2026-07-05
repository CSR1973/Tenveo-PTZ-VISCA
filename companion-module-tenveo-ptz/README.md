# companion-module-tenveo-ptz

A **Bitfocus Companion 4.3.4+** module for **Tenveo PTZ cameras** —
TEVO-VHD20HAN, TEVO-VHD20N/30N/12N (NDI), and other Tenveo IP PTZ models.

Talks **VISCA over TCP/UDP** (default port 52381) for pan, tilt, zoom, focus,
exposure (including **Gain**), white-balance, OSD and power — and **ONVIF**
on port 2000 for **preset save/recall/clear**, because Tenveo NDI firmware
silently drops VISCA preset commands while accepting them over ONVIF.

It exposes **button**, **rotary HOLD** (Stream Deck + with auto-stop), and
**rotary STEP** (precise 1°/click) variants, plus signed pan/tilt position
**in degrees** with Home calibrated to 0°.

> **Tested with:** Tenveo TEVO-VHD20HAN (UDP/VISCA) and Tenveo NDI cameras
> (TCP/VISCA + ONVIF presets) on Companion 4.3.4, Node 20+.

---

## Why this module

The Sony VISCA and PTZOptics VISCA modules in the Companion store mostly work
with Tenveo cameras but skip several things:

| Capability | Sony VISCA | PTZOptics VISCA | **Tenveo PTZ (this)** |
|---|---|---|---|
| Pan / Tilt / Zoom / Focus | ✅ | ✅ | ✅ |
| Gain Direct (Tenveo mapping `0x04 0x4C`) | ❌ | ❌ | ✅ |
| Color Temperature direct + rotary | ❌ | ❌ | ✅ |
| Rotary STEP actions (precise 1°/click) | ❌ | ❌ | ✅ |
| Signed pan/tilt position in **degrees** | ❌ | ❌ | ✅ |
| Auto-stop on Stream Deck + rotary HOLD | ❌ | ❌ | ✅ |
| Preset save/recall on Tenveo NDI cameras | ❌ | ❌ | ✅ (via ONVIF) |
| TCP + UDP transport with one-click toggle | ⚠️ | ✅ | ✅ |

---

## Install (for Companion 4.3.4)

1. Clone or download this repo.
2. `cd companion-module-tenveo-ptz && npm install --legacy-peer-deps`
3. `npx companion-module-build` → produces a `.tgz` file inside `pkg/`.
4. In Companion → **Modules** → **Import module package** → pick that `.tgz`.
5. Companion → **Connections** → **+ Add connection** → search **"Tenveo PTZ"**.

---

## Connection settings

| Field | Default | Notes |
|---|---|---|
| **IP Address** | `192.168.88.11` | Camera IP |
| **VISCA Protocol** | TCP | TCP is recommended; UDP works for older models |
| **VISCA Port** | 52381 | Tenveo uses 52381 for **both** TCP and UDP |
| **Camera ID** | 1 | For daisy-chained units |
| **ONVIF Port** | 2000 | Tenveo default. Used for preset save/recall/clear |
| **ONVIF Username** | admin | Default Tenveo credentials |
| **ONVIF Password** | admin | Change if you've locked down the camera |
| **Pan / Tilt / Zoom Speed** | 12 / 10 / 4 | Defaults used when an action doesn't override |
| **VISCA units per degree** | 14 | Calibration for STEP actions and degree variables |
| **Polling Interval** | 0 (off) | Set to 500–2000 ms to live-update zoom/AE/WB variables |
| **Verbose Logging** | off | Logs every TX/RX VISCA packet & ONVIF SOAP body |

---

## Action families

### Pan / Tilt
- `Pan/Tilt: Up/Down/Left/Right/diagonal (hold)` — press and hold; release stops
- `Pan/Tilt: Home (true center 0,0)` — uses Absolute (0,0), not the VISCA Home command
- `Pan/Tilt: Stop`, `Reset`, `Absolute Position (raw)`

### Pan/Tilt rotary HOLD (for the Stream Deck +)
- Continuous travel while rotating, auto-stop when rotation halts
- Configurable hold-ms per action (default 180 ms)

### Pan/Tilt rotary STEP — **best for precise framing**
- `Rotary STEP: Pan Left / Right (° per click)` (default 1°)
- `Rotary STEP: Tilt Up / Down (° per click)`
- Maintains a local degree counter — `pan_degrees` / `tilt_degrees` variables
  always reflect the position relative to Home (= 0°)

### Zoom / Focus
- Standard, variable, direct, rotary HOLD (auto-stop) flavours

### Presets (via ONVIF)
- `Preset: Recall / Save / Clear / Recall from variable`
- Preset numbers 1-255

### Exposure
- AE mode, Gain Direct/Up/Down, Iris, Shutter, Bright, ExpComp, BLC
- Rotary STEP variants for Gain, Iris, Shutter

### White Balance
- All modes (Auto / Indoor / Outdoor / One-Push / ATW / Manual / Sodium / Color Temp)
- R-Gain / B-Gain Direct/Up/Down
- `Color Temperature (K) — set absolute` and `Rotary STEP: Color Temp Up/Down`

### Power / OSD / IR / Raw VISCA
- All present.

---

## Variables exposed

```
$(label:camera_name)      $(label:host)             $(label:connected)
$(label:onvif_ready)      $(label:last_preset)
$(label:power)            $(label:af)
$(label:exposure_mode)    $(label:wb_mode)
$(label:gain)             $(label:iris)             $(label:shutter)
$(label:zoom_position)    $(label:focus_position)
$(label:pan_position)     $(label:tilt_position)
$(label:pan_degrees)      $(label:tilt_degrees)     ← signed, Home = 0°
$(label:color_temp)
```

The four-cam-degree display is just:
```
P:$(cam-11:pan_degrees)°
T:$(cam-11:tilt_degrees)°
```

---

## Stream Deck + recommended encoder bindings

| Knob | Rotate Left | Rotate Right | Press |
|---|---|---|---|
| 1 (Pan) | `Rotary STEP: Pan Left (1°)` | `Rotary STEP: Pan Right (1°)` | `Pan/Tilt: Home (true center 0,0)` |
| 2 (Tilt) | `Rotary STEP: Tilt Down (1°)` | `Rotary STEP: Tilt Up (1°)` | `Pan/Tilt: Stop` |
| 3 (Zoom) | `Rotary HOLD: Zoom Out` | `Rotary HOLD: Zoom In` | `Zoom: Stop` |
| 4 (Focus / WB) | `Rotary HOLD: Focus Near` | `Rotary HOLD: Focus Far` | `Focus: Auto Toggle` |

For WB on a 5th encoder: `Color Temp Down` ↔ `Color Temp Up` (press = `WB: Mode → Color Temperature`).

---

## Calibration — "1 click = 1°"

The default of 14 VISCA units per degree is a good starting point for most
Tenveo cameras (matches PTZOptics-style firmware). To calibrate exactly for
your model:

1. Press the **Home (true center)** button — `pan_degrees` should read `0.0°`.
2. Click **Rotary STEP: Pan Right** ten times. Variable should read `10.0°`.
3. Eyeball or measure the camera's physical rotation:
   - **~10° to the right** → calibration is correct.
   - **~20° (overshoots)** → bump **VISCA units per degree** from `14` to `28`.
   - **~5° (undershoots)** → drop it to `7`.

The setting lives in the connection's config — no rebuild needed when you tweak.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Connection orange | VISCA-over-IP disabled on camera OSD, or firewall blocking port 52381 |
| Presets do nothing | ONVIF init failed. Check `onvif_ready` variable. Verify ONVIF port (2000) and credentials |
| Rotary stops working when polling is on | Already fixed in 1.1.0 — polling is now chained, not overlapping |
| `pan_degrees` doesn't update | Make sure you're using the STEP actions, not the HOLD ones. STEP actions update the counter; HOLD actions don't |
| Counter goes out of sync | Press **Home (true center 0,0)** to resync. Movements made via IR remote / OSD / preset recall don't update the local counter |
| Verbose log shows ONVIF 401 | Wrong ONVIF username/password — check the camera's web UI |

---

## License

MIT © 2025-2026 César Montegrifo — see [LICENSE](./LICENSE).

## Contributing / Issues

Bug reports and PRs welcome at
**https://github.com/CSR1973/companion-module-tenveo-ptz/issues**.
