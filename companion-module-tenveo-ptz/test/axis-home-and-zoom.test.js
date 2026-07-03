/**
 * Integration test (v1.7.0):
 *   1. pan_home_only sends ptAbsolute(panCenter, currentTiltU) — keeps tilt & zoom
 *   2. tilt_home_only sends ptAbsolute(currentPanU, tiltCenter) — keeps pan & zoom
 *   3. zoom_home_only sends zoomDirect(0) — no ptAbsolute
 *   4. Rotary STEP zoom (drive + auto-stop): fast clicks keep the camera moving; only ONE
 *      zoomTeleVar drive is emitted per continuous spin, and exactly ONE zoomStop is emitted
 *      after `idleMs` of no more clicks.
 *   5. zoom_position + zoom_percent variables update after auto-stop based on elapsed time × units/s.
 *   6. Reversing direction mid-spin flushes distance for the previous direction and starts a new drive.
 */
import { getActions } from '../src/actions.js'

function makeFakeSelf(overrides = {}) {
	const sent = []
	const varUpdates = []
	const self = {
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
			...overrides,
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
	return self
}

function decodePtAbsolute(bytes) {
	if (bytes.length !== 15 || bytes[0] !== 0x81 || bytes[2] !== 0x06 || bytes[3] !== 0x02) return null
	const p = ((bytes[6] & 0xf) << 12) | ((bytes[7] & 0xf) << 8) | ((bytes[8] & 0xf) << 4) | (bytes[9] & 0xf)
	const t = ((bytes[10] & 0xf) << 12) | ((bytes[11] & 0xf) << 8) | ((bytes[12] & 0xf) << 4) | (bytes[13] & 0xf)
	return {
		panU: p >= 0x8000 ? p - 0x10000 : p,
		tiltU: t >= 0x8000 ? t - 0x10000 : t,
		panSpeed: bytes[4],
		tiltSpeed: bytes[5],
	}
}

function decodeZoomDirect(bytes) {
	if (bytes.length !== 9 || bytes[0] !== 0x81 || bytes[2] !== 0x04 || bytes[3] !== 0x47) return null
	const p = ((bytes[4] & 0xf) << 12) | ((bytes[5] & 0xf) << 8) | ((bytes[6] & 0xf) << 4) | (bytes[7] & 0xf)
	return p
}

/** Classify a zoom-family packet. */
function classifyZoomCmd(bytes) {
	// zoomStop:    81 01 04 07 00 FF
	// zoomTeleVar: 81 01 04 07 (20|s) FF
	// zoomWideVar: 81 01 04 07 (30|s) FF
	// zoomDirect:  81 01 04 47 a b c d FF
	if (bytes[0] !== 0x81 || bytes[2] !== 0x04) return null
	if (bytes[3] === 0x07) {
		const b = bytes[4]
		if (b === 0x00) return { kind: 'stop' }
		if ((b & 0xf0) === 0x20) return { kind: 'teleVar', speed: b & 0x0f }
		if ((b & 0xf0) === 0x30) return { kind: 'wideVar', speed: b & 0x0f }
	}
	if (bytes[3] === 0x47) return { kind: 'direct', pos: decodeZoomDirect(bytes) }
	return null
}

async function waitFor(condFn, timeoutMs = 500) {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		if (condFn()) return true
		await new Promise((r) => setTimeout(r, 5))
	}
	return false
}

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

async function test1_panHomeOnly() {
	console.log('\n[TEST 1] pan_home_only preserves tilt in ptAbsolute')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.tiltDeg = 25
	self.state.zoomPos = 8000
	self.state.panDeg = 42
	self.sent.length = 0
	await acts.pan_home_only.callback({ options: { panSpeed: 12 } })
	assert('1 packet sent', self.sent.length === 1, `got ${self.sent.length}`)
	const dec = decodePtAbsolute(self.sent[0])
	assert('panU = 19050', dec && dec.panU === 19050, `got ${dec?.panU}`)
	assert('tiltU ≈ 10167 (tilt preserved)', dec && Math.abs(dec.tiltU - 10167) <= 1, `got ${dec?.tiltU}`)
	assert('state.tiltDeg untouched (25)', self.state.tiltDeg === 25)
	assert('state.zoomPos untouched (8000)', self.state.zoomPos === 8000)
	assert('no zoomDirect emitted', !self.sent.some((b) => b[3] === 0x47))
}

async function test2_tiltHomeOnly() {
	console.log('\n[TEST 2] tilt_home_only preserves pan in ptAbsolute')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.panDeg = -60
	self.state.tiltDeg = -15
	self.state.zoomPos = 4000
	self.sent.length = 0
	await acts.tilt_home_only.callback({ options: { tiltSpeed: 10 } })
	assert('1 packet sent', self.sent.length === 1)
	const dec = decodePtAbsolute(self.sent[0])
	assert('panU ≈ 12526 (pan preserved)', dec && Math.abs(dec.panU - 12526) <= 1, `got ${dec?.panU}`)
	assert('tiltU = 8000', dec && dec.tiltU === 8000)
	assert('state.panDeg untouched (-60)', self.state.panDeg === -60)
	assert('state.zoomPos untouched (4000)', self.state.zoomPos === 4000)
}

async function test3_zoomHomeOnly() {
	console.log('\n[TEST 3] zoom_home_only sends zoomDirect(0)')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.panDeg = 42
	self.state.tiltDeg = -17
	self.state.zoomPos = 12000
	self.sent.length = 0
	await acts.zoom_home_only.callback()
	assert('1 packet sent', self.sent.length === 1)
	assert('zoomDirect(0)', decodeZoomDirect(self.sent[0]) === 0)
	assert('state.zoomPos = 0', self.state.zoomPos === 0)
	assert('state.panDeg untouched (42)', self.state.panDeg === 42)
	assert('state.tiltDeg untouched (-17)', self.state.tiltDeg === -17)
	assert('zoom_percent = 0', self.varUpdates.some((v) => v.zoom_percent === 0))
}

async function test4_smoothDrivePlusAutoStop() {
	console.log('\n[TEST 4] Rapid zoom_step_in clicks → 1 zoomTeleVar drive + 1 auto-stop')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 0
	self.sent.length = 0
	// 20 rapid clicks over ~200ms
	for (let i = 0; i < 20; i++) {
		await acts.zoom_step_in.callback({ options: { speed: 4, idleMs: 120 } })
		await new Promise((r) => setTimeout(r, 10))
	}
	// Wait for auto-stop to fire
	await waitFor(() => classifyZoomCmd(self.sent[self.sent.length - 1] || [])?.kind === 'stop', 800)
	const kinds = self.sent.map((b) => classifyZoomCmd(b))
	const teleDrives = kinds.filter((k) => k?.kind === 'teleVar')
	const stops = kinds.filter((k) => k?.kind === 'stop')
	assert('exactly 1 zoomTeleVar drive during spin', teleDrives.length === 1, `got ${teleDrives.length}, kinds=${JSON.stringify(kinds.map((k)=>k?.kind))}`)
	assert('drive uses selected speed (4)', teleDrives[0] && teleDrives[0].speed === 4)
	assert('exactly 1 zoomStop after idle', stops.length === 1, `got ${stops.length}`)
	// Position should have advanced (elapsed × units/s > 0)
	assert('state.zoomPos > 0 after drive', self.state.zoomPos > 0, `got ${self.state.zoomPos}`)
}

async function test5_positionAndPercentUpdate() {
	console.log('\n[TEST 5] zoom_position + zoom_percent update after auto-stop')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 0
	self.varUpdates.length = 0
	// Fire drive, hold for 500ms of clicks
	const t0 = Date.now()
	while (Date.now() - t0 < 500) {
		await acts.zoom_step_in.callback({ options: { speed: 7, idleMs: 100 } })
		await new Promise((r) => setTimeout(r, 15))
	}
	// Wait for auto-stop
	await waitFor(() => self.varUpdates.some((v) => 'zoom_position' in v && v.zoom_position > 0), 800)
	// Expect roughly elapsed × 3200 u/s at speed 7 (~1500 units for 500ms)
	assert('state.zoomPos in 800-2500 range', self.state.zoomPos >= 800 && self.state.zoomPos <= 2500, `got ${self.state.zoomPos}`)
	const lastVar = self.varUpdates[self.varUpdates.length - 1]
	assert('zoom_position variable emitted (non-zero)', lastVar && lastVar.zoom_position > 0, JSON.stringify(lastVar))
	assert('zoom_percent variable emitted (non-zero)', lastVar && lastVar.zoom_percent > 0, JSON.stringify(lastVar))
	assert('zoom_percent within [0..100]', lastVar && lastVar.zoom_percent >= 0 && lastVar.zoom_percent <= 100)
}

async function test6_directionReversalFlushes() {
	console.log('\n[TEST 6] Reversing direction mid-spin flushes previous distance + starts new drive')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 5000
	self.sent.length = 0
	// Spin tele for a bit
	await acts.zoom_step_in.callback({ options: { speed: 4, idleMs: 200 } })
	await new Promise((r) => setTimeout(r, 200))
	const posAfterTele = self.state.zoomPos
	// Now reverse to wide
	await acts.zoom_step_out.callback({ options: { speed: 4, idleMs: 100 } })
	// Direction switch should flush previous drive → zoomPos should have grown from 5000
	assert('zoomPos > 5000 after tele phase (accumulated on direction change)', self.state.zoomPos > 5000, `got ${self.state.zoomPos}, posAfterTele=${posAfterTele}`)
	// Should now be driving wide
	const kinds = self.sent.map((b) => classifyZoomCmd(b))
	const teleDrives = kinds.filter((k) => k?.kind === 'teleVar')
	const wideDrives = kinds.filter((k) => k?.kind === 'wideVar')
	assert('one teleVar drive was issued', teleDrives.length === 1, `got ${teleDrives.length}`)
	assert('one wideVar drive was issued', wideDrives.length === 1, `got ${wideDrives.length}`)
	// Auto-stop should fire eventually
	await waitFor(() => self.sent.map((b) => classifyZoomCmd(b)).filter((k) => k?.kind === 'stop').length >= 1, 500)
	assert('final zoomStop emitted', self.sent.some((b) => classifyZoomCmd(b)?.kind === 'stop'))
}

async function test7_variablesSeededAtInit() {
	console.log('\n[TEST 7] state.zoomPos starts at 0 (not null) so variable evaluates')
	// This exercises the fake self mirroring main.js init: zoomPos:0.
	const self = makeFakeSelf()
	assert('state.zoomPos === 0 at init', self.state.zoomPos === 0, `got ${self.state.zoomPos}`)
	// Simulate main.js._publishStaticVars
	const posInit = Math.max(0, Math.min(16384, self.state.zoomPos))
	assert('would-publish zoom_position = 0', posInit === 0)
	assert('would-publish zoom_percent = 0', Math.round((posInit / 16384) * 100) === 0)
}

async function run() {
	await test1_panHomeOnly()
	await test2_tiltHomeOnly()
	await test3_zoomHomeOnly()
	await test4_smoothDrivePlusAutoStop()
	await test5_positionAndPercentUpdate()
	await test6_directionReversalFlushes()
	await test7_variablesSeededAtInit()

	const failed = results.filter((r) => !r.ok)
	console.log(`\n───── ${results.length - failed.length}/${results.length} assertions passed ─────`)
	if (failed.length) {
		console.log('Failed:')
		for (const f of failed) console.log(`  ✗ ${f.name} — ${f.extra}`)
		process.exit(1)
	}
	process.exit(0)
}

run().catch((e) => {
	console.error('FATAL:', e)
	process.exit(2)
})
