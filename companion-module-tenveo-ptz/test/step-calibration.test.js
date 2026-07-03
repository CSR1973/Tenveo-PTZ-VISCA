/**
 * Integration test — validates that Rotary STEP Pan/Tilt actions emit ptAbsolute
 * VISCA packets whose 16-bit pan/tilt fields match the user-provided calibration:
 *
 *   pan center  = 19050 units,  108.74 units per degree (default)
 *   tilt center = 8000  units,  86.66  units per degree (default)
 *   panDeg range  = [-175 .. +175]  (LEFT is negative deg, RIGHT is positive)
 *   tiltDeg range = [ -90 .. +90]   (DOWN is negative deg, UP is positive)
 *
 * We use a fake self so no camera/socket is needed. We assert:
 *   1. A single click of 1° right → panDeg = +1, sent panU = 19050 + 108.74 = 19159.
 *   2. 37 rapid clicks right → panDeg = +37, ONLY one ptAbsolute is sent, panU carries the
 *      summed target (19050 + 37×108.74 ≈ 23073).
 *   3. Clicks past the LEFT limit clamp at panMinDeg (-175) → panU ≈ 20 (matches user's data).
 *   4. Tilt 10 clicks up → tiltDeg = +10, tiltU = 8000 + 866.6 = 8867.
 *   5. Signed 16-bit wrap: at RIGHT extreme (panDeg=+175) the naive units would exceed
 *      the int16 range; the module normalises via toInt16 so ptAbsolute can encode it.
 *   6. VISCA byte-level check: nibble encoding of the pan field matches what nibble16 produces.
 */
import { getActions } from '../src/actions.js'
import * as C from '../src/commands.js'

function makeFakeSelf(overrides = {}) {
	const sent = [] // captured VISCA byte arrays
	const varUpdates = [] // captured setVariableValues calls
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
		state: { panDeg: 0, tiltDeg: 0 },
		_pulseTimers: {},
		send: async (bytes) => {
			sent.push(Array.from(bytes))
		},
		setVariableValues: (v) => {
			varUpdates.push(v)
		},
		log: () => {},
		checkFeedbacks: () => {},
		sent,
		varUpdates,
	}
	return self
}

async function waitFor(condFn, timeoutMs = 500) {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		if (condFn()) return true
		await new Promise((r) => setTimeout(r, 5))
	}
	return false
}

function decodePtAbsolute(bytes) {
	// Layout: 81 01 06 02 pv tv p1 p2 p3 p4 t1 t2 t3 t4 FF
	if (bytes.length !== 15 || bytes[0] !== 0x81 || bytes[2] !== 0x06 || bytes[3] !== 0x02) return null
	const p = ((bytes[6] & 0xf) << 12) | ((bytes[7] & 0xf) << 8) | ((bytes[8] & 0xf) << 4) | (bytes[9] & 0xf)
	const t = ((bytes[10] & 0xf) << 12) | ((bytes[11] & 0xf) << 8) | ((bytes[12] & 0xf) << 4) | (bytes[13] & 0xf)
	const panU = p >= 0x8000 ? p - 0x10000 : p
	const tiltU = t >= 0x8000 ? t - 0x10000 : t
	return { panU, tiltU, panSpeed: bytes[4], tiltSpeed: bytes[5] }
}

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

async function test1_singleClickRight() {
	console.log('\n[TEST 1] Single click right → panU = center + 108.74')
	const self = makeFakeSelf()
	const acts = getActions(self)
	await acts.pan_step_right.callback({ options: { deg: 1, speed: 12 } })
	await waitFor(() => self.sent.length > 0)
	assert('panDeg is +1', Math.abs(self.state.panDeg - 1) < 0.001, `got ${self.state.panDeg}`)
	assert('exactly 1 packet sent', self.sent.length === 1, `got ${self.sent.length}`)
	const dec = decodePtAbsolute(self.sent[0])
	assert('packet is ptAbsolute', !!dec)
	const expectedPanU = Math.round(19050 + 108.74)
	assert(
		`panU = ${expectedPanU}`,
		dec && Math.abs(dec.panU - expectedPanU) <= 1,
		`got ${dec?.panU}`,
	)
	assert(
		`tiltU = 8000 (unchanged)`,
		dec && dec.tiltU === 8000,
		`got ${dec?.tiltU}`,
	)
}

async function test2_thirtySevenRapidClicksCoalesced() {
	console.log('\n[TEST 2] 37 rapid right clicks → summed target, ONE packet only')
	const self = makeFakeSelf()
	const acts = getActions(self)
	for (let i = 0; i < 37; i++) {
		await acts.pan_step_right.callback({ options: { deg: 1, speed: 12 } })
	}
	await waitFor(() => self.sent.length > 0)
	// give a bit more time to catch stray extra packets
	await new Promise((r) => setTimeout(r, 50))
	assert('panDeg = 37', Math.abs(self.state.panDeg - 37) < 0.001, `got ${self.state.panDeg}`)
	assert('exactly 1 packet emitted after coalesce', self.sent.length === 1, `got ${self.sent.length}`)
	const dec = decodePtAbsolute(self.sent[0])
	const expected = Math.round(19050 + 37 * 108.74)
	assert(`panU carries summed target (~${expected})`, dec && Math.abs(dec.panU - expected) <= 1, `got ${dec?.panU}`)
}

async function test3_clampsAtLeftLimit() {
	console.log('\n[TEST 3] Overshoot LEFT clamps at panMinDeg (-175); panU ≈ 20')
	const self = makeFakeSelf()
	const acts = getActions(self)
	// 300 clicks left, each 1° → should stop at -175°
	for (let i = 0; i < 300; i++) {
		await acts.pan_step_left.callback({ options: { deg: 1, speed: 12 } })
	}
	await new Promise((r) => setTimeout(r, 50))
	assert('panDeg clamped to -175', Math.abs(self.state.panDeg - -175) < 0.001, `got ${self.state.panDeg}`)
	const last = self.sent[self.sent.length - 1]
	const dec = decodePtAbsolute(last)
	const expected = Math.round(19050 + -175 * 108.74)
	assert(`panU ≈ ${expected} (matches user LEFT extreme ~20)`, dec && Math.abs(dec.panU - expected) <= 1, `got ${dec?.panU}`)
	assert('|panU - 20| < 5 (matches physical LEFT extreme)', dec && Math.abs(dec.panU - 20) < 5, `got ${dec?.panU}`)
}

async function test4_tiltCalibration() {
	console.log('\n[TEST 4] 10 clicks tilt up → tiltU = 8000 + 866.6')
	const self = makeFakeSelf()
	const acts = getActions(self)
	for (let i = 0; i < 10; i++) {
		await acts.tilt_step_up.callback({ options: { deg: 1, speed: 10 } })
	}
	await new Promise((r) => setTimeout(r, 50))
	assert('tiltDeg = 10', Math.abs(self.state.tiltDeg - 10) < 0.001, `got ${self.state.tiltDeg}`)
	const last = self.sent[self.sent.length - 1]
	const dec = decodePtAbsolute(last)
	const expected = Math.round(8000 + 10 * 86.66)
	assert(`tiltU ≈ ${expected}`, dec && Math.abs(dec.tiltU - expected) <= 1, `got ${dec?.tiltU}`)
}

async function test5_int16WrapAtRightExtreme() {
	console.log('\n[TEST 5] Right extreme (+175°) produces int16-wrapped panU')
	const self = makeFakeSelf()
	const acts = getActions(self)
	for (let i = 0; i < 300; i++) {
		await acts.pan_step_right.callback({ options: { deg: 1, speed: 12 } })
	}
	await new Promise((r) => setTimeout(r, 50))
	assert('panDeg clamped to +175', Math.abs(self.state.panDeg - 175) < 0.001, `got ${self.state.panDeg}`)
	const last = self.sent[self.sent.length - 1]
	const dec = decodePtAbsolute(last)
	// Raw naive: 19050 + 175 × 108.74 = 38079.5 → int16 wrap = -27456 (approx)
	assert('panU is inside int16 range', dec && dec.panU >= -32768 && dec.panU <= 32767, `got ${dec?.panU}`)
	assert('panU is negative (int16-wrapped from ~38079)', dec && dec.panU < 0, `got ${dec?.panU}`)
}

async function test6_holdTracking() {
	console.log('\n[TEST 6] Pan/Tilt HOLD updates pan_degrees / tilt_degrees on release')
	const self = makeFakeSelf()
	const acts = getActions(self)
	await acts.pt_left.callback({ options: { pan: 24 } })
	await new Promise((r) => setTimeout(r, 500))
	await acts.pt_stop.callback()
	// 500 ms @ speed 24, panDegPerSec 100 → ~-50°
	assert('pan_degrees ~ -50 after 500ms hold-left', Math.abs(self.state.panDeg - -50) < 3, `got ${self.state.panDeg}`)
	const lastVar = self.varUpdates[self.varUpdates.length - 1]
	assert('pan_degrees variable updated', lastVar && 'pan_degrees' in lastVar, JSON.stringify(lastVar))

	await acts.pt_up.callback({ options: { tilt: 20 } })
	await new Promise((r) => setTimeout(r, 300))
	await acts.pt_stop.callback()
	// 300 ms @ speed 20, tiltDegPerSec 60 → ~+18°
	assert('tilt_degrees ~ +18 after 300ms hold-up', Math.abs(self.state.tiltDeg - 18) < 3, `got ${self.state.tiltDeg}`)
}

async function test7_signInversion() {
	console.log('\n[TEST 7] Flipping sign of panUnitsPerDeg inverts direction')
	const self = makeFakeSelf({ panUnitsPerDeg: -108.74 })
	const acts = getActions(self)
	await acts.pan_step_right.callback({ options: { deg: 10, speed: 12 } })
	await waitFor(() => self.sent.length > 0)
	const dec = decodePtAbsolute(self.sent[0])
	const expected = Math.round(19050 + 10 * -108.74)
	assert(`with negative slope, panU decreases (~${expected})`, dec && Math.abs(dec.panU - expected) <= 1, `got ${dec?.panU}`)
}

async function test8_stepResetAction() {
	console.log('\n[TEST 8] pt_step_reset zeroes counter without sending a VISCA packet')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.panDeg = 42
	self.state.tiltDeg = -17
	self.sent.length = 0
	await acts.pt_step_reset.callback()
	assert('panDeg zeroed', self.state.panDeg === 0)
	assert('tiltDeg zeroed', self.state.tiltDeg === 0)
	assert('no VISCA sent', self.sent.length === 0, `got ${self.sent.length} packets`)
}

async function test9_pureCommandsEncoding() {
	console.log('\n[TEST 9] ptAbsolute encodes signed 16-bit correctly (unit check)')
	// Positive value 19159 → nibbles 4/A/D/7 → bytes 0x81 0x01 0x06 0x02 pv tv 04 0A 0D 07 ...
	const bytes = C.ptAbsolute(19159, 8000, 12, 10)
	const dec = decodePtAbsolute(bytes)
	assert('encode positive panU=19159', dec && dec.panU === 19159, `got ${dec?.panU}`)
	assert('encode positive tiltU=8000', dec && dec.tiltU === 8000, `got ${dec?.tiltU}`)
	// Negative value -20 → wraps to 65516 → nibbles F/F/E/C
	const b2 = C.ptAbsolute(-20, 0, 12, 10)
	const dec2 = decodePtAbsolute(b2)
	assert('encode negative panU=-20 via two-s complement', dec2 && dec2.panU === -20, `got ${dec2?.panU}`)
}

async function run() {
	await test1_singleClickRight()
	await test2_thirtySevenRapidClicksCoalesced()
	await test3_clampsAtLeftLimit()
	await test4_tiltCalibration()
	await test5_int16WrapAtRightExtreme()
	await test6_holdTracking()
	await test7_signInversion()
	await test8_stepResetAction()
	await test9_pureCommandsEncoding()

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
