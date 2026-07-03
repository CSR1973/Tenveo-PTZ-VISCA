/**
 * Integration test — verifies:
 *   1. pan_home_only sends ptAbsolute(panCenter, currentTiltU) — keeps tilt & zoom
 *   2. tilt_home_only sends ptAbsolute(currentPanU, tiltCenter) — keeps pan & zoom
 *   3. zoom_home_only sends zoomDirect(0) — no ptAbsolute at all
 *   4. Smooth zoom stepping: 10 rapid zoom_step_in clicks → ONE zoomDirect packet, position = 10 × delta
 *   5. zoom_percent variable updates correctly (0..100)
 *   6. Zoom clamps at 0 and 16384 (wide and tele extremes)
 */
import { getActions } from '../src/actions.js'
import * as C from '../src/commands.js'

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
	// 81 01 04 47 a b c d FF
	if (bytes.length !== 9 || bytes[0] !== 0x81 || bytes[2] !== 0x04 || bytes[3] !== 0x47) return null
	const p = ((bytes[4] & 0xf) << 12) | ((bytes[5] & 0xf) << 8) | ((bytes[6] & 0xf) << 4) | (bytes[7] & 0xf)
	return p
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

async function test1_panHomeOnly_preservesTilt() {
	console.log('\n[TEST 1] pan_home_only preserves tilt in the ptAbsolute payload')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.tiltDeg = 25 // pretend camera is 25° up
	self.state.zoomPos = 8000 // pretend zoom is mid-range
	self.state.panDeg = 42 // pretend camera is 42° right
	self.sent.length = 0
	await acts.pan_home_only.callback({ options: { panSpeed: 12 } })
	assert('exactly 1 packet sent', self.sent.length === 1, `got ${self.sent.length}`)
	const dec = decodePtAbsolute(self.sent[0])
	assert('packet is ptAbsolute', !!dec)
	assert('panU = panCenter (19050) — pan homed', dec && dec.panU === 19050, `got ${dec?.panU}`)
	const expectedTiltU = Math.round(8000 + 25 * 86.66)
	assert(`tiltU = current tracked tilt (~${expectedTiltU})`, dec && Math.abs(dec.tiltU - expectedTiltU) <= 1, `got ${dec?.tiltU}`)
	assert('state.panDeg reset to 0', self.state.panDeg === 0, `got ${self.state.panDeg}`)
	assert('state.tiltDeg untouched (25)', self.state.tiltDeg === 25, `got ${self.state.tiltDeg}`)
	assert('state.zoomPos untouched (8000)', self.state.zoomPos === 8000, `got ${self.state.zoomPos}`)
	// No zoomDirect must have been sent
	const zoomSent = self.sent.some((b) => b[3] === 0x47)
	assert('no zoomDirect emitted', !zoomSent)
}

async function test2_tiltHomeOnly_preservesPan() {
	console.log('\n[TEST 2] tilt_home_only preserves pan in the ptAbsolute payload')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.panDeg = -60 // pretend camera is 60° left
	self.state.tiltDeg = -15
	self.state.zoomPos = 4000
	self.sent.length = 0
	await acts.tilt_home_only.callback({ options: { tiltSpeed: 10 } })
	assert('exactly 1 packet sent', self.sent.length === 1, `got ${self.sent.length}`)
	const dec = decodePtAbsolute(self.sent[0])
	const expectedPanU = Math.round(19050 + -60 * 108.74)
	assert(`panU = current tracked pan (~${expectedPanU})`, dec && Math.abs(dec.panU - expectedPanU) <= 1, `got ${dec?.panU}`)
	assert('tiltU = tiltCenter (8000) — tilt homed', dec && dec.tiltU === 8000, `got ${dec?.tiltU}`)
	assert('state.tiltDeg reset to 0', self.state.tiltDeg === 0, `got ${self.state.tiltDeg}`)
	assert('state.panDeg untouched (-60)', self.state.panDeg === -60, `got ${self.state.panDeg}`)
	assert('state.zoomPos untouched (4000)', self.state.zoomPos === 4000, `got ${self.state.zoomPos}`)
}

async function test3_zoomHomeOnly_preservesPanTilt() {
	console.log('\n[TEST 3] zoom_home_only sends zoomDirect(0) and does not touch Pan/Tilt')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.panDeg = 42
	self.state.tiltDeg = -17
	self.state.zoomPos = 12000
	self.sent.length = 0
	await acts.zoom_home_only.callback()
	assert('exactly 1 packet sent', self.sent.length === 1, `got ${self.sent.length}`)
	const pos = decodeZoomDirect(self.sent[0])
	assert('packet is zoomDirect(0)', pos === 0, `got ${pos}`)
	assert('state.zoomPos = 0', self.state.zoomPos === 0)
	assert('state.panDeg untouched (42)', self.state.panDeg === 42)
	assert('state.tiltDeg untouched (-17)', self.state.tiltDeg === -17)
	// zoom_percent variable must reflect 0
	const lastVars = self.varUpdates[self.varUpdates.length - 1]
	assert('zoom_percent = 0 in vars', lastVars && lastVars.zoom_percent === 0, JSON.stringify(lastVars))
}

async function test4_zoomStepSmoothCoalesce() {
	console.log('\n[TEST 4] 10 rapid zoom_step_in clicks → ONE zoomDirect packet at expected pos')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 0
	self.sent.length = 0
	for (let i = 0; i < 10; i++) {
		await acts.zoom_step_in.callback({ options: { delta: 512 } })
	}
	await waitFor(() => self.sent.length > 0)
	await new Promise((r) => setTimeout(r, 60))
	assert('state.zoomPos = 5120', self.state.zoomPos === 5120, `got ${self.state.zoomPos}`)
	assert('exactly 1 zoomDirect packet emitted (coalesced)', self.sent.length === 1, `got ${self.sent.length}`)
	const pos = decodeZoomDirect(self.sent[0])
	assert('zoomDirect pos = 5120', pos === 5120, `got ${pos}`)
}

async function test5_zoomPercentVariable() {
	console.log('\n[TEST 5] zoom_percent variable updates 0..100 as we step')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 0
	self.varUpdates.length = 0
	// Halfway
	await acts.zoom_step_in.callback({ options: { delta: 8192 } })
	assert('zoom_percent ≈ 50 at 8192', self.varUpdates.some((v) => v.zoom_percent === 50), JSON.stringify(self.varUpdates))
	// Full tele
	await acts.zoom_step_in.callback({ options: { delta: 8192 } })
	assert('zoom_percent = 100 at 16384', self.varUpdates.some((v) => v.zoom_percent === 100), JSON.stringify(self.varUpdates))
}

async function test6_zoomClampsAt0And16384() {
	console.log('\n[TEST 6] zoom stepping clamps at 0 (wide) and 16384 (tele)')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 0
	// Over-step to tele
	for (let i = 0; i < 100; i++) {
		await acts.zoom_step_in.callback({ options: { delta: 512 } })
	}
	await new Promise((r) => setTimeout(r, 60))
	assert('clamped at 16384 (tele)', self.state.zoomPos === 16384, `got ${self.state.zoomPos}`)
	// Over-step to wide
	self.sent.length = 0
	for (let i = 0; i < 100; i++) {
		await acts.zoom_step_out.callback({ options: { delta: 512 } })
	}
	await new Promise((r) => setTimeout(r, 60))
	assert('clamped at 0 (wide)', self.state.zoomPos === 0, `got ${self.state.zoomPos}`)
	assert('zoom_percent hit 0', self.varUpdates.some((v) => v.zoom_percent === 0))
}

async function test7_panHomeOnlyKeepsTiltAtSpecificValue() {
	console.log('\n[TEST 7] pan_home_only after tilt hold — end tilt position preserved on wire')
	const self = makeFakeSelf()
	const acts = getActions(self)
	// Simulate tilt HOLD up for 500 ms (panDegPerSec=100 tiltDegPerSec=60 → ~+30°)
	await acts.pt_up.callback({ options: { tilt: 20 } })
	await new Promise((r) => setTimeout(r, 500))
	await acts.pt_stop.callback()
	self.sent.length = 0
	await acts.pan_home_only.callback({ options: { panSpeed: 12 } })
	const dec = decodePtAbsolute(self.sent[0])
	const expectedTiltU = Math.round(8000 + self.state.tiltDeg * 86.66)
	assert(
		`tiltU matches ~+${self.state.tiltDeg.toFixed(1)}° tracked (${expectedTiltU})`,
		dec && Math.abs(dec.tiltU - expectedTiltU) <= 1,
		`got ${dec?.tiltU}, tiltDeg=${self.state.tiltDeg}`,
	)
	assert('panU = 19050', dec && dec.panU === 19050, `got ${dec?.panU}`)
}

async function run() {
	await test1_panHomeOnly_preservesTilt()
	await test2_tiltHomeOnly_preservesPan()
	await test3_zoomHomeOnly_preservesPanTilt()
	await test4_zoomStepSmoothCoalesce()
	await test5_zoomPercentVariable()
	await test6_zoomClampsAt0And16384()
	await test7_panHomeOnlyKeepsTiltAtSpecificValue()

	const failed = results.filter((r) => !r.ok)
	console.log(`\n───── ${results.length - failed.length}/${results.length} assertions passed ─────`)
	if (failed.length) {
		console.log('Failed assertions:')
		for (const f of failed) console.log(`  ✗ ${f.name} — ${f.extra}`)
		process.exit(1)
	}
	process.exit(0)
}

run().catch((e) => {
	console.error('FATAL:', e)
	process.exit(2)
})
