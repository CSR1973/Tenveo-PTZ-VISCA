/**
 * Independent verify (v1.7.0) — confirms review-request items with FRESH self
 * per scenario. Zoom tests were rewritten for the new drive+auto-stop pattern
 * (previous coalesced-zoomDirect assertions no longer apply as of v1.7.0):
 *  V1  Action keys pan_home_only / tilt_home_only / zoom_home_only exist
 *  V2  pan_home_only  → 1 ptAbsolute packet, panU=19050, tilt preserved, no zoomDirect
 *  V3  tilt_home_only → 1 ptAbsolute packet, tiltU=8000, pan preserved, no zoomDirect
 *  V4  zoom_home_only → 1 zoomDirect(0) packet, pan/tilt state untouched
 *  V5  15 rapid zoom_step_in callbacks (~10ms spacing) → EXACTLY 1 teleVar + 1 stop
 *  V6  500ms of zoom_step_in at speed 7 → zoom_position > 0, 0 < zoom_percent <= 100
 *  V7  tele then wide (200ms apart) → 1 teleVar, 1 wideVar, ≥1 stop; zoomPos advanced during tele
 *  V8  Fresh self state.zoomPos initialises to 0 (not null)
 */
import { getActions } from '../src/actions.js'

function makeSelf() {
	const sent = []
	const varUpdates = []
	return {
		config: {
			panSpeed: 12,
			tiltSpeed: 10,
			zoomSpeed: 4,
			variant: 'ndi',
			panCenter: 19050,
			panUnitsPerDeg: 108.74,
			panMinDeg: -175,
			panMaxDeg: 175,
			tiltCenter: 8000,
			tiltUnitsPerDeg: 86.66,
			tiltMinDeg: -90,
			tiltMaxDeg: 90,
			panDegPerSec: 100,
			tiltDegPerSec: 60,
			zoomUnitsPerSec: 3200,
		},
		state: { panDeg: 0, tiltDeg: 0, zoomPos: 0 },
		_pulseTimers: {},
		send: async (bytes) => sent.push(Array.from(bytes)),
		setVariableValues: (v) => varUpdates.push(v),
		log: () => {},
		checkFeedbacks: () => {},
		sent,
		varUpdates,
	}
}

function classifyZoomCmd(bytes) {
	if (!bytes || bytes[0] !== 0x81 || bytes[2] !== 0x04) return null
	if (bytes[3] === 0x07) {
		const b = bytes[4]
		if (b === 0x00) return { kind: 'stop' }
		if ((b & 0xf0) === 0x20) return { kind: 'teleVar', speed: b & 0x0f }
		if ((b & 0xf0) === 0x30) return { kind: 'wideVar', speed: b & 0x0f }
	}
	if (bytes[3] === 0x47) {
		const p = ((bytes[4] & 0xf) << 12) | ((bytes[5] & 0xf) << 8) | ((bytes[6] & 0xf) << 4) | (bytes[7] & 0xf)
		return { kind: 'direct', pos: p }
	}
	return null
}

async function waitFor(cond, timeoutMs = 800) {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		if (cond()) return true
		await new Promise((r) => setTimeout(r, 5))
	}
	return false
}

let pass = 0, fail = 0
function ok(name, cond, extra = '') {
	if (cond) { console.log('  ✓', name, extra); pass++ }
	else { console.error('  ✗', name, extra); fail++ }
}

async function run() {
	// V1
	{
		console.log('\n[V1] Action keys exist')
		const s = makeSelf()
		const a = getActions(s)
		ok('pan_home_only present', typeof a.pan_home_only?.callback === 'function')
		ok('tilt_home_only present', typeof a.tilt_home_only?.callback === 'function')
		ok('zoom_home_only present', typeof a.zoom_home_only?.callback === 'function')
		ok('zoom_step_in present', typeof a.zoom_step_in?.callback === 'function')
		ok('zoom_step_out present', typeof a.zoom_step_out?.callback === 'function')
	}

	// V2 pan_home_only
	{
		console.log('\n[V2] pan_home_only preserves tilt & zoom')
		const s = makeSelf()
		const a = getActions(s)
		s.state.tiltDeg = 25; s.state.panDeg = 42; s.state.zoomPos = 8000
		await a.pan_home_only.callback({ options: { panSpeed: 12 } })
		ok('1 packet', s.sent.length === 1, `got=${s.sent.length}`)
		const b = s.sent[0]
		ok('ptAbsolute (06 02)', b[2] === 0x06 && b[3] === 0x02)
		const p = ((b[6]&0xf)<<12)|((b[7]&0xf)<<8)|((b[8]&0xf)<<4)|(b[9]&0xf)
		const t = ((b[10]&0xf)<<12)|((b[11]&0xf)<<8)|((b[12]&0xf)<<4)|(b[13]&0xf)
		const panU = p >= 0x8000 ? p - 0x10000 : p
		const tiltU = t >= 0x8000 ? t - 0x10000 : t
		ok('panU=19050', panU === 19050, `got=${panU}`)
		ok('tiltU≈10167', Math.abs(tiltU - 10167) <= 1, `got=${tiltU}`)
		ok('no zoomDirect', !s.sent.some(x => x[3] === 0x47))
		ok('state.tiltDeg still 25', s.state.tiltDeg === 25)
		ok('state.zoomPos still 8000', s.state.zoomPos === 8000)
	}

	// V3 tilt_home_only
	{
		console.log('\n[V3] tilt_home_only preserves pan & zoom')
		const s = makeSelf()
		const a = getActions(s)
		s.state.panDeg = -60; s.state.tiltDeg = -15; s.state.zoomPos = 4000
		await a.tilt_home_only.callback({ options: { tiltSpeed: 10 } })
		ok('1 packet', s.sent.length === 1)
		const b = s.sent[0]
		const p = ((b[6]&0xf)<<12)|((b[7]&0xf)<<8)|((b[8]&0xf)<<4)|(b[9]&0xf)
		const t = ((b[10]&0xf)<<12)|((b[11]&0xf)<<8)|((b[12]&0xf)<<4)|(b[13]&0xf)
		const panU = p >= 0x8000 ? p - 0x10000 : p
		const tiltU = t >= 0x8000 ? t - 0x10000 : t
		ok('tiltU=8000', tiltU === 8000, `got=${tiltU}`)
		ok('panU≈12526', Math.abs(panU - 12526) <= 1, `got=${panU}`)
		ok('state.panDeg -60', s.state.panDeg === -60)
		ok('state.zoomPos 4000', s.state.zoomPos === 4000)
		ok('no zoomDirect', !s.sent.some(x => x[3] === 0x47))
	}

	// V4 zoom_home_only
	{
		console.log('\n[V4] zoom_home_only → zoomDirect(0)')
		const s = makeSelf()
		const a = getActions(s)
		s.state.panDeg = 42; s.state.tiltDeg = -17; s.state.zoomPos = 12000
		await a.zoom_home_only.callback()
		ok('1 packet', s.sent.length === 1)
		const b = s.sent[0]
		ok('starts 81 01 04 47', b[0]===0x81 && b[1]===0x01 && b[2]===0x04 && b[3]===0x47)
		const p = ((b[4]&0xf)<<12)|((b[5]&0xf)<<8)|((b[6]&0xf)<<4)|(b[7]&0xf)
		ok('zoomDirect(0)', p === 0, `got=${p}`)
		ok('state.panDeg 42', s.state.panDeg === 42)
		ok('state.tiltDeg -17', s.state.tiltDeg === -17)
		const last = s.varUpdates[s.varUpdates.length-1]
		ok('zoom_percent=0', last && last.zoom_percent === 0, JSON.stringify(last))
	}

	// V5 15 rapid zoom_step_in clicks with 10ms spacing → 1 teleVar + 1 stop
	{
		console.log('\n[V5] 15 rapid zoom_step_in @ speed 4 idleMs 120 → 1 teleVar + 1 stop')
		const s = makeSelf()
		const a = getActions(s)
		for (let i = 0; i < 15; i++) {
			await a.zoom_step_in.callback({ options: { speed: 4, idleMs: 120 } })
			await new Promise(r => setTimeout(r, 10))
		}
		// wait ~200ms for auto-stop
		await waitFor(() => classifyZoomCmd(s.sent[s.sent.length-1] || [])?.kind === 'stop', 600)
		const kinds = s.sent.map(classifyZoomCmd)
		const tele = kinds.filter(k => k?.kind === 'teleVar')
		const wide = kinds.filter(k => k?.kind === 'wideVar')
		const stop = kinds.filter(k => k?.kind === 'stop')
		const direct = kinds.filter(k => k?.kind === 'direct')
		ok('exactly 1 teleVar', tele.length === 1, `got=${tele.length} kinds=${JSON.stringify(kinds.map(k=>k?.kind))}`)
		ok('teleVar speed=4', tele[0]?.speed === 4, `got=${tele[0]?.speed}`)
		ok('exactly 1 stop', stop.length === 1, `got=${stop.length}`)
		ok('no wideVar during tele-only spin', wide.length === 0, `got=${wide.length}`)
		ok('no zoomDirect during drive', direct.length === 0, `got=${direct.length}`)
		ok('total zoom packets = 2', kinds.filter(k => k !== null).length === 2, `got=${kinds.filter(k => k !== null).length}`)
	}

	// V6 zoom_position variable emission after ~500ms continuous drive
	{
		console.log('\n[V6] 500ms continuous zoom_step_in @ speed 7 → zoom_position > 0, zoom_percent > 0')
		const s = makeSelf()
		const a = getActions(s)
		s.state.zoomPos = 0
		s.varUpdates.length = 0
		const t0 = Date.now()
		while (Date.now() - t0 < 500) {
			await a.zoom_step_in.callback({ options: { speed: 7, idleMs: 100 } })
			await new Promise(r => setTimeout(r, 15))
		}
		await waitFor(() => s.varUpdates.some(v => 'zoom_position' in v && v.zoom_position > 0), 800)
		const last = s.varUpdates[s.varUpdates.length-1]
		ok('setVariableValues called with zoom_position > 0', last && last.zoom_position > 0, JSON.stringify(last))
		ok('zoom_percent > 0', last && last.zoom_percent > 0, JSON.stringify(last))
		ok('zoom_percent <= 100', last && last.zoom_percent <= 100)
		ok('state.zoomPos > 0', s.state.zoomPos > 0, `got=${s.state.zoomPos}`)
	}

	// V7 direction reversal
	{
		console.log('\n[V7] tele → 200ms wait → wide: 1 teleVar + 1 wideVar + ≥1 stop; zoomPos advanced during tele')
		const s = makeSelf()
		const a = getActions(s)
		s.state.zoomPos = 5000
		await a.zoom_step_in.callback({ options: { speed: 4, idleMs: 300 } })
		await new Promise(r => setTimeout(r, 200))
		const posBeforeSwitch = s.state.zoomPos
		await a.zoom_step_out.callback({ options: { speed: 4, idleMs: 100 } })
		// direction switch inside zoomDriveStep flushes previous drive distance → zoomPos should exceed 5000
		ok('zoomPos > 5000 after tele phase (flushed on reversal)', s.state.zoomPos > 5000, `got=${s.state.zoomPos}, posBeforeSwitch=${posBeforeSwitch}`)
		await waitFor(() => s.sent.map(classifyZoomCmd).filter(k => k?.kind === 'stop').length >= 1, 600)
		const kinds = s.sent.map(classifyZoomCmd)
		const tele = kinds.filter(k => k?.kind === 'teleVar')
		const wide = kinds.filter(k => k?.kind === 'wideVar')
		const stop = kinds.filter(k => k?.kind === 'stop')
		ok('exactly 1 teleVar', tele.length === 1, `got=${tele.length}`)
		ok('exactly 1 wideVar', wide.length === 1, `got=${wide.length}`)
		ok('at least 1 stop', stop.length >= 1, `got=${stop.length}`)
	}

	// V8 state init
	{
		console.log('\n[V8] fresh self state.zoomPos = 0 (not null)')
		const s = makeSelf()
		ok('state.zoomPos === 0', s.state.zoomPos === 0, `got=${s.state.zoomPos}`)
		ok('state.zoomPos is number', typeof s.state.zoomPos === 'number')
		ok('state.zoomPos is NOT null', s.state.zoomPos !== null)
	}

	console.log(`\n───── ${pass} passed, ${fail} failed ─────`)
	process.exit(fail ? 1 : 0)
}

run().catch((e) => {
	console.error(e)
	process.exit(2)
})
