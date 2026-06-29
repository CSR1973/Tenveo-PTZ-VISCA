import { useEffect, useState, useMemo } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT_CAMS = [
  { name: "Cam 11", host: "192.168.88.11", camera_id: 1 },
  { name: "Cam 12", host: "192.168.88.12", camera_id: 1 },
  { name: "Cam 13", host: "192.168.88.13", camera_id: 1 },
  { name: "Cam 14", host: "192.168.88.14", camera_id: 1 },
];

function HexPills({ bytes }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bytes.map((b, i) => (
        <span
          key={i}
          className="mono text-[11px] px-1.5 py-0.5 rounded border"
          style={{ borderColor: "var(--line-hi)", color: "var(--accent-2)" }}
          data-testid={`hex-byte-${i}`}
        >
          {b.toString(16).padStart(2, "0").toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center gap-3 text-[11px] mono" style={{ color: "var(--fg-1)" }}>
      <span className="flex items-center gap-1.5">
        <span className="rec-dot inline-block w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
        VISCA/IP UDP 52381
      </span>
      <span style={{ color: "var(--fg-2)" }}>·</span>
      <span>Tenveo TEVO-VHD20HAN</span>
      <span style={{ color: "var(--fg-2)" }}>·</span>
      <span>Companion 4.3.4</span>
    </div>
  );
}

function CommandCard({ cmd, onPreview }) {
  return (
    <div
      className="card p-3 hover:border-[var(--accent)] transition-colors cursor-pointer flex flex-col gap-2"
      onClick={() => onPreview(cmd)}
      data-testid={`cmd-${cmd.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{cmd.label}</span>
        <span className="tag">{cmd.id}</span>
      </div>
      <HexPills bytes={cmd.bytes} />
      {cmd.notes && (
        <p className="text-[11px]" style={{ color: "var(--warn)" }}>
          ⚠ {cmd.notes}
        </p>
      )}
    </div>
  );
}

function PacketInspector({ preview }) {
  if (!preview) {
    return (
      <div className="card p-6 text-sm" style={{ color: "var(--fg-2)" }} data-testid="packet-inspector-empty">
        Pick any command on the left or paste raw VISCA hex below to inspect
        the exact bytes that will be sent over UDP&nbsp;52381.
      </div>
    );
  }
  return (
    <div className="card p-5 space-y-4" data-testid="packet-inspector">
      <div>
        <div className="text-[10px] mono tracking-widest uppercase" style={{ color: "var(--fg-2)" }}>
          VISCA-over-IP packet
        </div>
        <div className="hex mt-2" data-testid="packet-hex">{preview.packet_hex}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-2)" }}>Header (8 B)</div>
          <div className="hex">{preview.header_hex}</div>
        </div>
        <div>
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-2)" }}>Payload ({preview.payload_length} B)</div>
          <div className="hex">{preview.visca_hex}</div>
        </div>
        <div>
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-2)" }}>Payload type</div>
          <div className="mono text-sm">{preview.payload_type_hex}</div>
        </div>
        <div>
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-2)" }}>Sequence</div>
          <div className="mono text-sm">{preview.sequence}</div>
        </div>
      </div>

      <div>
        <div className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--fg-2)" }}>Decoded</div>
        <ul className="text-xs mono space-y-1" style={{ color: "var(--fg-1)" }}>
          {preview.explanation.map((line, i) => (
            <li key={i}>· {line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CompanionConfigPanel({ cams }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/companion-config`, cams);
      setConfig(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5 space-y-3" data-testid="companion-config-panel">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm uppercase tracking-widest" style={{ color: "var(--fg-1)" }}>
          Companion connection wizard
        </h3>
        <span className="tag">4 cameras</span>
      </div>
      <p className="text-xs" style={{ color: "var(--fg-2)" }}>
        Generates the Companion 4.3.4 connection JSON for {cams.length} Tenveo cameras
        at <code className="mono" style={{ color: "var(--accent-2)" }}>192.168.88.11–14</code>.
      </p>
      <button className="btn btn--primary" onClick={generate} disabled={loading} data-testid="generate-config-btn">
        {loading ? "Generating…" : "Generate connection JSON"}
      </button>
      {config && (
        <pre
          className="mono text-[11px] p-3 overflow-x-auto scroll-thin"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--fg-0)" }}
          data-testid="generated-config"
        >
          {JSON.stringify(config, null, 2)}
        </pre>
      )}
    </div>
  );
}

function RawHexTester({ onPreview }) {
  const [hex, setHex] = useState("81 01 04 00 02 FF");
  const [seq, setSeq] = useState(1);
  const [camId, setCamId] = useState(1);
  const submit = async () => {
    const bytes = hex
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((b) => parseInt(b, 16));
    if (bytes.some((b) => Number.isNaN(b))) return;
    try {
      const r = await axios.post(`${API}/preview`, {
        payload: bytes,
        sequence: seq,
        payload_type: "command",
        camera_id: camId,
      });
      onPreview(r.data);
    } catch (e) {
      alert(e?.response?.data?.detail || e.message);
    }
  };
  return (
    <div className="card p-5 space-y-3" data-testid="raw-hex-tester">
      <h3 className="text-sm uppercase tracking-widest" style={{ color: "var(--fg-1)" }}>
        Raw VISCA inspector
      </h3>
      <textarea
        rows={2}
        value={hex}
        onChange={(e) => setHex(e.target.value)}
        className="mono w-full p-2 text-xs"
        style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-0)", borderRadius: 4 }}
        data-testid="raw-hex-input"
      />
      <div className="flex gap-3 items-center text-xs">
        <label className="mono" style={{ color: "var(--fg-1)" }}>
          Camera ID
          <input
            type="number"
            min={1}
            max={7}
            value={camId}
            onChange={(e) => setCamId(parseInt(e.target.value || "1", 10))}
            className="mono ml-2 w-12 p-1 text-center"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-0)" }}
            data-testid="camera-id-input"
          />
        </label>
        <label className="mono" style={{ color: "var(--fg-1)" }}>
          Seq
          <input
            type="number"
            min={1}
            value={seq}
            onChange={(e) => setSeq(parseInt(e.target.value || "1", 10))}
            className="mono ml-2 w-20 p-1 text-center"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-0)" }}
            data-testid="sequence-input"
          />
        </label>
        <button className="btn btn--primary ml-auto" onClick={submit} data-testid="inspect-btn">
          Inspect
        </button>
      </div>
    </div>
  );
}

function InstallSteps() {
  const steps = [
    { n: "01", title: "Clone or copy the module", body: "Place companion-module-tenveo-ptz/ anywhere on the machine that runs Companion." },
    { n: "02", title: "yarn install", body: "From inside that folder. Pulls @companion-module/base." },
    { n: "03", title: "Settings → Developer modules path", body: "Point Companion at the PARENT folder. Restart Companion." },
    { n: "04", title: "Add four connections", body: "Type = Tenveo PTZ. IPs = 192.168.88.11, .12, .13, .14. Port = 52381." },
    { n: "05", title: "Drag the presets", body: "Open Buttons → Presets → Tenveo PTZ. The PTZ Pad, Zoom, Focus and Preset categories drop straight onto the deck." },
    { n: "06", title: "Stream Deck + encoders", body: "Bind the four 'Rotary:' actions (Pan, Tilt, Zoom, Focus). They auto-stop after rotation halts." },
  ];
  return (
    <div className="space-y-3" data-testid="install-steps">
      {steps.map((s) => (
        <div key={s.n} className="flex gap-4 card p-4">
          <div className="mono text-3xl leading-none" style={{ color: "var(--accent)" }}>{s.n}</div>
          <div>
            <div className="font-medium mb-1">{s.title}</div>
            <div className="text-xs" style={{ color: "var(--fg-1)" }}>{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [preview, setPreview] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("explorer");

  useEffect(() => {
    axios
      .get(`${API}/catalog`)
      .then((r) => {
        setCatalog(r.data);
        setActiveGroup(Object.keys(r.data.groups)[0]);
      })
      .catch((e) => console.error(e));
  }, []);

  const previewCmd = async (cmd) => {
    try {
      const r = await axios.post(`${API}/preview`, {
        payload: cmd.bytes,
        sequence: 1,
        payload_type: cmd.id.startsWith("inq_") ? "inquiry" : "command",
        camera_id: 1,
      });
      setPreview(r.data);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredCommands = useMemo(() => {
    if (!catalog || !activeGroup) return [];
    const list = catalog.groups[activeGroup] || [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q) || c.id.includes(q)
    );
  }, [catalog, activeGroup, query]);

  return (
    <div className="min-h-screen pb-16">
      <header className="relative overflow-hidden border-b" style={{ borderColor: "var(--line)" }}>
        <div className="max-w-7xl mx-auto px-6 pt-8 pb-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--accent)" }}>
                Bitfocus Companion module
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mt-2 leading-none" data-testid="page-title">
                Tenveo PTZ <span style={{ color: "var(--accent)" }}>/</span>{" "}
                <span style={{ color: "var(--fg-1)" }}>VISCA-over-IP</span>
              </h1>
              <p className="mt-4 text-sm max-w-xl" style={{ color: "var(--fg-1)" }}>
                Drop-in Companion 4.3.4 module for TEVO-VHD20HAN and other Tenveo PTZ cameras.
                Full button + Stream Deck&nbsp;+ rotary action set, including the Gain controls
                missing from the Sony VISCA and PTZOptics modules.
              </p>
              <div className="mt-4">
                <StatusBar />
              </div>
            </div>

            <div className="card p-4 text-xs mono space-y-1" style={{ minWidth: 220 }}>
              <div style={{ color: "var(--fg-2)" }}>Cameras</div>
              {DEFAULT_CAMS.map((c) => (
                <div key={c.host} className="flex justify-between" data-testid={`camera-row-${c.host}`}>
                  <span>{c.name}</span>
                  <span style={{ color: "var(--accent-2)" }}>{c.host}</span>
                </div>
              ))}
            </div>
          </div>

          <nav className="mt-8 flex gap-2 flex-wrap" data-testid="tabnav">
            {[
              ["explorer", "Command Explorer"],
              ["install", "Install & Setup"],
              ["streamdeck", "Stream Deck +"],
              ["files", "Module Files"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="btn"
                data-testid={`tab-${id}`}
                style={
                  tab === id
                    ? { borderColor: "var(--accent)", color: "var(--accent)" }
                    : {}
                }
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {tab === "explorer" && (
          <div className="grid grid-cols-12 gap-6">
            <aside className="col-span-12 md:col-span-3 space-y-3" data-testid="group-sidebar">
              <input
                type="text"
                placeholder="Search commands…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mono w-full p-2 text-xs"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-0)", borderRadius: 4 }}
                data-testid="cmd-search-input"
              />
              {catalog &&
                Object.keys(catalog.groups).map((g) => (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    className="w-full text-left px-3 py-2 text-xs uppercase tracking-widest mono flex justify-between items-center"
                    style={{
                      background: g === activeGroup ? "var(--bg-2)" : "transparent",
                      borderLeft: `2px solid ${g === activeGroup ? "var(--accent)" : "transparent"}`,
                      color: g === activeGroup ? "var(--fg-0)" : "var(--fg-1)",
                    }}
                    data-testid={`group-btn-${g.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`}
                  >
                    {g}
                    <span className="tag">{catalog.groups[g].length}</span>
                  </button>
                ))}
            </aside>

            <section className="col-span-12 md:col-span-5">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg">{activeGroup}</h2>
                <span className="tag">{filteredCommands.length} commands</span>
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[640px] overflow-y-auto pr-2 scroll-thin" data-testid="cmd-list">
                {filteredCommands.map((cmd) => (
                  <CommandCard key={cmd.id} cmd={cmd} onPreview={previewCmd} />
                ))}
              </div>
            </section>

            <section className="col-span-12 md:col-span-4 space-y-4 sticky top-4 self-start">
              <PacketInspector preview={preview} />
              <RawHexTester onPreview={setPreview} />
            </section>
          </div>
        )}

        {tab === "install" && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 md:col-span-7 space-y-6">
              <h2 className="text-2xl">Install the module</h2>
              <InstallSteps />
            </div>
            <div className="col-span-12 md:col-span-5 space-y-6">
              <CompanionConfigPanel cams={DEFAULT_CAMS} />
              <div className="card p-5 space-y-2" data-testid="cli-test-card">
                <h3 className="text-sm uppercase tracking-widest" style={{ color: "var(--fg-1)" }}>
                  Test from CLI without Companion
                </h3>
                <p className="text-xs" style={{ color: "var(--fg-2)" }}>
                  From any machine on the 192.168.88.0/24 network:
                </p>
                <pre className="mono text-[11px] p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 4 }}>
{`cd companion-module-tenveo-ptz
node test/cli.js 192.168.88.11 home
node test/cli.js 192.168.88.12 recall 3
node test/cli.js 192.168.88.13 zoom-in 4 800
node test/cli.js 192.168.88.14 gain 9`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {tab === "streamdeck" && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 md:col-span-7">
              <h2 className="text-2xl">Stream Deck&nbsp;+ rotary mapping</h2>
              <p className="mt-2 text-sm max-w-prose" style={{ color: "var(--fg-1)" }}>
                Each of the four encoders has <code className="mono" style={{ color: "var(--accent-2)" }}>rotate&nbsp;left</code>,{" "}
                <code className="mono" style={{ color: "var(--accent-2)" }}>rotate&nbsp;right</code> and{" "}
                <code className="mono" style={{ color: "var(--accent-2)" }}>press</code> slots. The module ships dedicated rotary
                actions that auto-stop the camera once you stop rotating.
              </p>

              <table className="w-full mt-6 text-sm" data-testid="streamdeck-table">
                <thead>
                  <tr style={{ color: "var(--fg-2)" }} className="text-left text-[10px] uppercase tracking-widest mono">
                    <th className="py-2 pr-2">Knob</th>
                    <th className="py-2 pr-2">Rotate Left</th>
                    <th className="py-2 pr-2">Rotate Right</th>
                    <th className="py-2 pr-2">Press</th>
                  </tr>
                </thead>
                <tbody className="mono text-xs">
                  {[
                    ["1", "Rotary: Pan Left", "Rotary: Pan Right", "Pan/Tilt: Home"],
                    ["2", "Rotary: Tilt Down", "Rotary: Tilt Up", "Pan/Tilt: Stop"],
                    ["3", "Rotary: Zoom Out", "Rotary: Zoom In", "Zoom: Stop"],
                    ["4", "Rotary: Focus Near", "Rotary: Focus Far", "Focus: Auto Toggle"],
                  ].map((row) => (
                    <tr key={row[0]} className="border-t" style={{ borderColor: "var(--line)" }}>
                      {row.map((c, i) => (
                        <td key={i} className="py-2 pr-2">{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-xs mt-6" style={{ color: "var(--fg-2)" }}>
                Tip: in each rotary action, the <strong>Hold&nbsp;(ms)</strong> option determines how long
                a single rotation pulse lasts before auto-stop. 160–200&nbsp;ms feels best on the Stream Deck&nbsp;+
                for continuous travel; lower values feel &quot;click-y&quot;.
              </p>
            </div>

            <div className="col-span-12 md:col-span-5">
              <div className="card p-6 relative overflow-hidden scan-line" data-testid="encoder-mock" style={{ minHeight: 280 }}>
                <div className="mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-2)" }}>
                  Stream Deck +
                </div>
                <div className="mt-3 grid grid-cols-4 gap-3">
                  {["PAN", "TILT", "ZOOM", "FOCUS"].map((l) => (
                    <div key={l} className="flex flex-col items-center">
                      <div
                        className="w-14 h-14 rounded-full border-2 flex items-center justify-center mono text-[11px]"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        {l}
                      </div>
                      <div className="mono text-[9px] mt-2" style={{ color: "var(--fg-2)" }}>↺ / ↻ / press</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 mono text-[10px]" style={{ color: "var(--fg-1)" }}>
                  All four encoders auto-stop after rotation halts (configurable hold,
                  default 160 ms for zoom/focus, 180 ms for pan/tilt).
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "files" && (
          <div className="card p-6 space-y-4" data-testid="files-tab">
            <h2 className="text-xl">Module on disk</h2>
            <pre className="mono text-xs" style={{ color: "var(--fg-1)" }}>
{`/app/companion-module-tenveo-ptz/
├── companion/
│   ├── manifest.json
│   └── HELP.md
├── src/
│   ├── main.js          // InstanceBase entrypoint
│   ├── config.js        // host / port / speeds / camera-id fields
│   ├── visca.js         // UDP + 8-byte VISCA-over-IP header
│   ├── commands.js      // every command builder (Tenveo-aware)
│   ├── actions.js       // ~80 button & rotary actions
│   ├── feedbacks.js     // preset / power / AF / WB / connection
│   ├── variables.js     // dynamic vars (zoom_position, gain, …)
│   └── presets.js       // pre-built Stream Deck buttons
├── test/
│   ├── cli.js           // node test/cli.js <host> <cmd>
│   └── mock-camera.js   // run a fake VISCA-over-IP camera on :52381
├── README.md            // installation, troubleshooting, mapping tables
└── package.json`}
            </pre>
            <p className="text-xs" style={{ color: "var(--fg-2)" }}>
              The module is self-contained Node 18+. Copy this folder to the machine that runs
              Companion, run <code className="mono" style={{ color: "var(--accent-2)" }}>yarn install</code>,
              then point Companion&apos;s <strong>Developer modules path</strong> at the parent folder.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
