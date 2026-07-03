/**
 * Independent verification harness — spins up FRESH self objects per scenario
 * and re-checks the four claims from the review request without reusing state
 * from the primary test. This is a redundant sanity pass.
 */
import { getActions } from '../src/actions.js'

function makeSelf(overrides = {}) {
	const sent = []
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
		send: async (bytes) => sent.push(Array.from(bytes)),
		setVariableValues: () => {},
		log: () => {},
		checkFeedbacks: () => {},
		sent,
	}
	return self
}

function decodePtAbsolute(bytes) {
	if (bytes.length !== 15 || bytes[0] !== 0x81 || bytes[2] !== 0x06 || bytes[3] !== 0x02) return null
	const p = ((bytes[6] & 0xf) << 12) | ((bytes[7] & 0xf) << 8) | ((bytes[8] & 0xf) << 4) | (bytes[9] & 0xf)
	const t = ((bytes[10] & 0xf) << 12) | ((bytes[11] & 0xf) << 8) | ((bytes[12] & 0xf) << 4) | (bytes[13] & 0xf)
	const panU = p >= 0x8000 ? p - 0x10000 : p
	const tiltU = t >= 0x8000 ? t - 0x10000 : t
	return { panU, tiltU }
}

async function waitForPacket(self, timeoutMs = 400) {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		if (self.sent.length > 0) break
		await new Promise((r) => setTimeout(r, 5))
	}
}

let failed = 0
function check(name, cond, got, expected) {
	if (cond) {
		console.log(`  ✓ ${name} — got ${got}`)
	} else {
		failed++
		console.log(`  ✗ ${name} — got ${got}, expected ${expected}`)
	}
}

async function run() {
	// ---- Scenario A: single click right = 1° → panU = 19159 ----
	console.log('\n[A] single pan_step_right → panU ≈ 19159')
	{
		const self = makeSelf()
		const actions = getActions(self)
		await actions.pan_step_right.callback({ options: { deg: 1 } })
		await waitForPacket(self)
		check('one packet', self.sent.length === 1, self.sent.length, 1)
		const dec = decodePtAbsolute(self.sent[0])
		check('panU = 19159', dec.panU === 19159, dec.panU, 19159)
		check('tiltU = 8000', dec.tiltU === 8000, dec.tiltU, 8000)
	}

	// ---- Scenario B: 37 rapid pan_step_right → 1 packet, panU ≈ 23073 ----
	console.log('\n[B] 37 rapid pan_step_right → 1 packet, panU ≈ 23073')
	{
		const self = makeSelf()
		const actions = getActions(self)
		for (let i = 0; i < 37; i++) {
			await actions.pan_step_right.callback({ options: { deg: 1 } })
		}
		await waitForPacket(self)
		check('exactly 1 packet emitted', self.sent.length === 1, self.sent.length, 1)
		const dec = decodePtAbsolute(self.sent[0])
		const expected = Math.round(19050 + 37 * 108.74) // 23073
		check(`panU ~ ${expected} (±2)`, Math.abs(dec.panU - expected) <= 2, dec.panU, expected)
	}

	// ---- Scenario C: ~200 pan_step_left clicks clamp at -175, panU ≈ 20 ----
	console.log('\n[C] 200 pan_step_left → panDeg clamped to -175, panU ≈ 20 (int16 wrap OK)')
	{
		const self = makeSelf()
		const actions = getActions(self)
		for (let i = 0; i < 200; i++) {
			await actions.pan_step_left.callback({ options: { deg: 1 } })
		}
		await waitForPacket(self)
		check('panDeg clamped to -175', self.state.panDeg === -175, self.state.panDeg, -175)
		const last = self.sent[self.sent.length - 1]
		const dec = decodePtAbsolute(last)
		// Raw math: 19050 + (-175)*108.74 = 19050 - 19029.5 = 20.5 → rounds to 20 or 21
		check('panU ≈ 20 (±5 vs user LEFT extreme)', Math.abs(dec.panU - 20) <= 5, dec.panU, '~20')
	}

	// ---- Scenario D: 10 tilt_step_up → tiltU ≈ 8867 ----
	console.log('\n[D] 10 tilt_step_up → tiltU ≈ 8867')
	{
		const self = makeSelf()
		const actions = getActions(self)
		for (let i = 0; i < 10; i++) {
			await actions.tilt_step_up.callback({ options: { deg: 1 } })
		}
		await waitForPacket(self)
		check('exactly 1 packet emitted', self.sent.length === 1, self.sent.length, 1)
		const dec = decodePtAbsolute(self.sent[0])
		const expected = Math.round(8000 + 10 * 86.66) // 8867
		check(`tiltU ~ ${expected} (±1)`, Math.abs(dec.tiltU - expected) <= 1, dec.tiltU, expected)
		check('panU = 19050 (unchanged)', dec.panU === 19050, dec.panU, 19050)
	}

	console.log(`\n───── ${failed === 0 ? 'ALL INDEPENDENT SCENARIOS PASSED' : failed + ' FAILURE(S)'} ─────`)
	process.exit(failed === 0 ? 0 : 1)
}

run().catch((e) => {
	console.error(e)
	process.exit(2)
})
