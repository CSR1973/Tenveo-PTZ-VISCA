from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="Tenveo PTZ Companion - VISCA Explorer")
api = APIRouter(prefix="/api")


# ─────────────────────── VISCA byte builders ───────────────────────
# Mirrors src/commands.js inside companion-module-tenveo-ptz.

def u4(v: int) -> int:
    return v & 0x0F


def nibble16(v: int) -> List[int]:
    x = v & 0xFFFF
    return [u4(x >> 12), u4(x >> 8), u4(x >> 4), u4(x)]


# Pan/tilt direction bytes (pan, tilt)
PT_DIR = {
    "up": (0x03, 0x01),
    "down": (0x03, 0x02),
    "left": (0x01, 0x03),
    "right": (0x02, 0x03),
    "up_left": (0x01, 0x01),
    "up_right": (0x02, 0x01),
    "down_left": (0x01, 0x02),
    "down_right": (0x02, 0x02),
    "stop": (0x03, 0x03),
}


def pt_drive(direction: str, pan_speed: int = 12, tilt_speed: int = 10) -> List[int]:
    p, t = PT_DIR[direction]
    vv = max(1, min(24, pan_speed))
    ww = max(1, min(20, tilt_speed))
    return [0x81, 0x01, 0x06, 0x01, vv, ww, p, t, 0xFF]


# Catalog of every command, grouped. Each entry is (id, label, callable, options...).
def build_catalog():
    cmds = []

    def add(group, cmd_id, label, payload, notes=""):
        cmds.append({
            "group": group, "id": cmd_id, "label": label,
            "payload": payload, "notes": notes,
        })

    # PTZ
    for k in ["up", "down", "left", "right", "up_left", "up_right",
              "down_left", "down_right", "stop"]:
        add("Pan/Tilt", f"pt_{k}", f"Pan/Tilt {k.replace('_',' ').title()}",
            pt_drive(k))
    add("Pan/Tilt", "pt_home", "Home", [0x81, 0x01, 0x06, 0x04, 0xFF])
    add("Pan/Tilt", "pt_reset", "Reset position", [0x81, 0x01, 0x06, 0x05, 0xFF])

    # Zoom
    add("Zoom", "zoom_stop", "Zoom Stop", [0x81, 0x01, 0x04, 0x07, 0x00, 0xFF])
    add("Zoom", "zoom_tele_std", "Zoom In (std)", [0x81, 0x01, 0x04, 0x07, 0x02, 0xFF])
    add("Zoom", "zoom_wide_std", "Zoom Out (std)", [0x81, 0x01, 0x04, 0x07, 0x03, 0xFF])
    add("Zoom", "zoom_tele_var_4", "Zoom In speed 4", [0x81, 0x01, 0x04, 0x07, 0x24, 0xFF])
    add("Zoom", "zoom_wide_var_4", "Zoom Out speed 4", [0x81, 0x01, 0x04, 0x07, 0x34, 0xFF])

    # Focus
    add("Focus", "focus_auto", "Auto Focus On", [0x81, 0x01, 0x04, 0x38, 0x02, 0xFF])
    add("Focus", "focus_manual", "Auto Focus Off (Manual)", [0x81, 0x01, 0x04, 0x38, 0x03, 0xFF])
    add("Focus", "focus_toggle", "Auto Focus Toggle", [0x81, 0x01, 0x04, 0x38, 0x10, 0xFF])
    add("Focus", "focus_one_push", "One-Push AF", [0x81, 0x01, 0x04, 0x18, 0x01, 0xFF])
    add("Focus", "focus_near_4", "Focus Near speed 4", [0x81, 0x01, 0x04, 0x08, 0x34, 0xFF])
    add("Focus", "focus_far_4", "Focus Far speed 4", [0x81, 0x01, 0x04, 0x08, 0x24, 0xFF])
    add("Focus", "focus_stop", "Focus Stop", [0x81, 0x01, 0x04, 0x08, 0x00, 0xFF])
    add("Focus", "focus_lock_on", "Focus Lock", [0x81, 0x01, 0x0A, 0x04, 0x68, 0x02, 0xFF])
    add("Focus", "focus_lock_off", "Focus Unlock", [0x81, 0x01, 0x0A, 0x04, 0x68, 0x03, 0xFF])

    # Power & system
    add("Power", "power_on", "Power On", [0x81, 0x01, 0x04, 0x00, 0x02, 0xFF])
    add("Power", "power_off", "Power Off (Standby)", [0x81, 0x01, 0x04, 0x00, 0x03, 0xFF])

    # OSD
    add("OSD", "menu_on", "OSD Open", [0x81, 0x01, 0x06, 0x06, 0x02, 0xFF])
    add("OSD", "menu_off", "OSD Close", [0x81, 0x01, 0x06, 0x06, 0x03, 0xFF])
    add("OSD", "menu_toggle", "OSD Toggle", [0x81, 0x01, 0x04, 0x3F, 0x02, 0x5F, 0xFF])
    add("OSD", "menu_enter", "OSD Enter", [0x81, 0x01, 0x7E, 0x01, 0x02, 0x00, 0x01, 0xFF])

    # Exposure
    add("Exposure", "ae_full_auto", "AE Full Auto", [0x81, 0x01, 0x04, 0x39, 0x00, 0xFF])
    add("Exposure", "ae_manual", "AE Manual", [0x81, 0x01, 0x04, 0x39, 0x03, 0xFF])
    add("Exposure", "ae_shutter_pri", "AE Shutter Priority", [0x81, 0x01, 0x04, 0x39, 0x0A, 0xFF])
    add("Exposure", "ae_iris_pri", "AE Iris Priority", [0x81, 0x01, 0x04, 0x39, 0x0B, 0xFF])
    add("Exposure", "ae_bright", "AE Bright", [0x81, 0x01, 0x04, 0x39, 0x0D, 0xFF])

    # Gain (Tenveo-specific direct)
    add("Gain", "gain_up", "Gain Up", [0x81, 0x01, 0x04, 0x0C, 0x02, 0xFF],
        notes="Requires AE Manual mode.")
    add("Gain", "gain_down", "Gain Down", [0x81, 0x01, 0x04, 0x0C, 0x03, 0xFF])
    add("Gain", "gain_reset", "Gain Reset", [0x81, 0x01, 0x04, 0x0C, 0x00, 0xFF])
    for v in range(0, 15):
        c, d = nibble16(v)[2], nibble16(v)[3]
        add("Gain", f"gain_direct_{v}", f"Gain Direct = {v}",
            [0x81, 0x01, 0x04, 0x4C, 0x00, 0x00, c, d, 0xFF])

    # Iris
    add("Iris", "iris_up", "Iris Up", [0x81, 0x01, 0x04, 0x0B, 0x02, 0xFF])
    add("Iris", "iris_down", "Iris Down", [0x81, 0x01, 0x04, 0x0B, 0x03, 0xFF])
    add("Iris", "iris_reset", "Iris Reset", [0x81, 0x01, 0x04, 0x0B, 0x00, 0xFF])

    # Shutter
    add("Shutter", "shutter_up", "Shutter Up", [0x81, 0x01, 0x04, 0x0A, 0x02, 0xFF])
    add("Shutter", "shutter_down", "Shutter Down", [0x81, 0x01, 0x04, 0x0A, 0x03, 0xFF])
    add("Shutter", "shutter_reset", "Shutter Reset", [0x81, 0x01, 0x04, 0x0A, 0x00, 0xFF])

    # WB
    add("White Balance", "wb_auto", "WB Auto", [0x81, 0x01, 0x04, 0x35, 0x00, 0xFF])
    add("White Balance", "wb_indoor", "WB Indoor (3200K)", [0x81, 0x01, 0x04, 0x35, 0x01, 0xFF])
    add("White Balance", "wb_outdoor", "WB Outdoor (5800K)", [0x81, 0x01, 0x04, 0x35, 0x02, 0xFF])
    add("White Balance", "wb_one_push", "WB One-Push", [0x81, 0x01, 0x04, 0x35, 0x03, 0xFF])
    add("White Balance", "wb_atw", "WB ATW", [0x81, 0x01, 0x04, 0x35, 0x04, 0xFF])
    add("White Balance", "wb_manual", "WB Manual", [0x81, 0x01, 0x04, 0x35, 0x05, 0xFF])
    add("White Balance", "wb_color_temp_mode", "WB Color Temp mode", [0x81, 0x01, 0x04, 0x35, 0x20, 0xFF])
    add("White Balance", "wb_onepush_trigger", "One-Push Trigger", [0x81, 0x01, 0x04, 0x10, 0x05, 0xFF])

    # Presets 1..10
    for n in range(1, 11):
        add("Presets", f"preset_recall_{n}", f"Recall preset {n}",
            [0x81, 0x01, 0x04, 0x3F, 0x02, n, 0xFF])
        add("Presets", f"preset_save_{n}", f"Save preset {n}",
            [0x81, 0x01, 0x04, 0x3F, 0x01, n, 0xFF])

    # Inquiries
    add("Inquiries", "inq_power", "Power state inquiry", [0x81, 0x09, 0x04, 0x00, 0xFF])
    add("Inquiries", "inq_af", "Auto-focus inquiry", [0x81, 0x09, 0x04, 0x38, 0xFF])
    add("Inquiries", "inq_zoom_pos", "Zoom position inquiry", [0x81, 0x09, 0x04, 0x47, 0xFF])
    add("Inquiries", "inq_pt_pos", "Pan/Tilt position inquiry", [0x81, 0x09, 0x06, 0x12, 0xFF])
    add("Inquiries", "inq_gain", "Gain inquiry", [0x81, 0x09, 0x04, 0x4C, 0xFF])

    return cmds


CATALOG = build_catalog()


# ─────────────────────── Models ───────────────────────

class PreviewRequest(BaseModel):
    payload: List[int] = Field(..., description="VISCA bytes, e.g. [0x81,0x01,0x04,0x00,0x02,0xFF]")
    sequence: int = Field(1, ge=1, le=0xFFFFFFFF)
    payload_type: Literal["command", "inquiry", "reply", "control"] = "command"
    camera_id: int = Field(1, ge=1, le=7)


class PreviewResponse(BaseModel):
    visca_hex: str
    visca_bytes: List[int]
    packet_hex: str
    packet_bytes: List[int]
    header_hex: str
    payload_type_hex: str
    payload_length: int
    sequence: int
    explanation: List[str]


PAYLOAD_TYPE_MAP = {
    "command": 0x0100,
    "inquiry": 0x0110,
    "reply": 0x0200,
    "control": 0x0201,
}


def hexs(b: List[int]) -> str:
    return " ".join(f"{x & 0xFF:02X}" for x in b)


def explain(payload: List[int]) -> List[str]:
    """Produce a human-readable breakdown of a VISCA payload."""
    out = []
    if not payload:
        return ["(empty payload)"]
    out.append(f"Byte 0 = 0x{payload[0]:02X} → camera address ({payload[0] & 0x0F})")
    if len(payload) < 2:
        return out
    out.append(f"Byte 1 = 0x{payload[1]:02X} → "
               + ("command" if payload[1] == 0x01 else
                  "inquiry" if payload[1] == 0x09 else
                  f"unknown ({payload[1]:#x})"))
    if len(payload) >= 4:
        cat = payload[2]
        fn = payload[3]
        out.append(f"Bytes 2-3 = 0x{cat:02X} 0x{fn:02X} → category/function")
        family = {
            (0x04, 0x00): "Power",
            (0x04, 0x07): "Zoom drive",
            (0x04, 0x08): "Focus drive",
            (0x04, 0x38): "Focus mode",
            (0x04, 0x18): "One-push AF / WB trigger",
            (0x04, 0x3F): "Preset memory",
            (0x04, 0x39): "AE mode",
            (0x04, 0x35): "WB mode",
            (0x04, 0x4C): "Gain Direct",
            (0x04, 0x0C): "Gain UP/DOWN/Reset",
            (0x04, 0x4B): "Iris Direct",
            (0x04, 0x0B): "Iris UP/DOWN/Reset",
            (0x04, 0x4A): "Shutter Direct",
            (0x04, 0x0A): "Shutter UP/DOWN/Reset",
            (0x04, 0x47): "Zoom Direct",
            (0x04, 0x48): "Focus Direct",
            (0x04, 0x47, 0x09): "Zoom inquiry",
            (0x06, 0x01): "Pan/Tilt drive",
            (0x06, 0x04): "Home",
            (0x06, 0x05): "Reset",
            (0x06, 0x06): "OSD menu",
            (0x06, 0x12): "Pan/Tilt inquiry",
            (0x06, 0x08): "IR Receive",
        }
        out.append(f"  → {family.get((cat, fn), 'Tenveo-specific function')}")
    if payload[-1] == 0xFF:
        out.append("Last byte = 0xFF → end-of-packet terminator")
    return out


# ─────────────────────── Endpoints ───────────────────────

@api.get("/")
async def root():
    return {"app": "Tenveo PTZ Companion", "version": "1.0.0"}


@api.get("/catalog")
async def catalog():
    """All supported VISCA commands grouped by category, with bytes."""
    groups: dict = {}
    for item in CATALOG:
        groups.setdefault(item["group"], []).append({
            "id": item["id"],
            "label": item["label"],
            "bytes": item["payload"],
            "hex": hexs(item["payload"]),
            "notes": item.get("notes", ""),
        })
    return {"groups": groups, "count": len(CATALOG)}


@api.post("/preview", response_model=PreviewResponse)
async def preview(req: PreviewRequest):
    if not req.payload or req.payload[-1] != 0xFF:
        raise HTTPException(400, "VISCA payload must end with 0xFF")
    if any(b < 0 or b > 0xFF for b in req.payload):
        raise HTTPException(400, "All bytes must be in 0..255")

    payload = list(req.payload)
    # rewrite camera address byte if first byte is 0x8x
    if (payload[0] & 0xF0) == 0x80:
        payload[0] = 0x80 | (req.camera_id & 0x07)

    pt = PAYLOAD_TYPE_MAP[req.payload_type]
    header = [
        (pt >> 8) & 0xFF, pt & 0xFF,
        (len(payload) >> 8) & 0xFF, len(payload) & 0xFF,
        (req.sequence >> 24) & 0xFF, (req.sequence >> 16) & 0xFF,
        (req.sequence >> 8) & 0xFF, req.sequence & 0xFF,
    ]
    packet = header + payload
    return PreviewResponse(
        visca_hex=hexs(payload),
        visca_bytes=payload,
        packet_hex=hexs(packet),
        packet_bytes=packet,
        header_hex=hexs(header),
        payload_type_hex=f"0x{pt:04X}",
        payload_length=len(payload),
        sequence=req.sequence,
        explanation=explain(payload),
    )


class CameraSetup(BaseModel):
    name: str
    host: str
    port: int = 52381
    camera_id: int = 1


@api.post("/companion-config")
async def companion_config(cams: List[CameraSetup]):
    """Generate Companion connection JSON snippets for the given cameras."""
    return {
        "instructions": [
            "In Companion 4.3.4 → Connections → Add → search 'Tenveo PTZ'.",
            "Create one connection per camera with the values below.",
            "All connections share the same module, but each gets its own variable namespace.",
        ],
        "connections": [
            {
                "label": c.name,
                "module": "tenveo-ptz",
                "config": {
                    "name": c.name,
                    "host": c.host,
                    "port": c.port,
                    "cameraId": c.camera_id,
                    "panSpeed": 12,
                    "tiltSpeed": 10,
                    "zoomSpeed": 4,
                    "pollInterval": 0,
                    "verbose": False,
                },
            }
            for c in cams
        ],
    }


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
