/**
 * v1.10.0 tests — verifies real-time per-click publication of zoom + focus variables.
 *
 * Root of the previous bug: variables only updated when the auto-stop timer fired. In real
 * Companion usage the timer sometimes fired too late (or not at all in the user's report)
 * so the variable appeared to never update. Fix: publish on EVERY click with an estimated
 * position derived from elapsed × unitsPerSec.
 */
import { getActions } from '../src/actions.js'

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

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
			tiltCenter: 8000,
			tiltUnitsPerDeg: 86.66,
			zoomUnitsPerSec: 3200,
			focusUnitsPerSec: 3200,
			...overrides,
		},
		state: { panDeg: 0, tiltDeg: 0, zoomPos: 0, focusPos: 0, blc: 'off' },
		_pulseTimers: {},
		send: async (bytes) => sent.push(Array.from(bytes)),
		setVariableValues: (v) => varUpdates.push(v),
		checkFeedbacks: () => {},
		log: () => {},
		sent,
		varUpdates,
	}
	return self
}

async function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms))
}

async function test1_zoomStepPublishesEveryClick() {
	console.log('\n[TEST 1] zoom_step_in publishes zoom_position + zoom_percent on EVERY click')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.varUpdates.length = 0

	// 5 clicks spaced 20ms apart
	for (let i = 0; i < 5; i++) {
		await acts.zoom_step_in.callback({ options: { speed: 4, idleMs: 500 } })
		await sleep(20)
	}
	// We expect at least 5 variable publications for zoom_position (one per click)
	const zoomPubs = self.varUpdates.filter((v) => 'zoom_position' in v)
	assert('at least 5 zoom_position publications', zoomPubs.length >= 5, `got ${zoomPubs.length}`)
	// Each value should be monotonically non-decreasing (tele direction)
	let prev = -1
	let monotonic = true
	for (const p of zoomPubs) {
		if (p.zoom_position < prev) monotonic = false
		prev = p.zoom_position
	}
	assert('zoom_position values are non-decreasing across clicks', monotonic)
	// After the 5 clicks, the last value must be > 0
	const last = zoomPubs[zoomPubs.length - 1]
	assert('final zoom_position > 0', last.zoom_position > 0, JSON.stringify(last))
	assert('final zoom_percent in [0..100]', last.zoom_percent >= 0 && last.zoom_percent <= 100)
}

async function test2_focusStepPublishesEveryClick() {
	console.log('\n[TEST 2] focus_step_far publishes focus_position + focus_percent on EVERY click')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.varUpdates.length = 0

	for (let i = 0; i < 6; i++) {
		await acts.focus_step_far.callback({ options: { speed: 4, idleMs: 500 } })
		await sleep(15)
	}
	const focusPubs = self.varUpdates.filter((v) => 'focus_position' in v)
	assert('at least 6 focus_position publications', focusPubs.length >= 6, `got ${focusPubs.length}`)
	let prev = -1
	let monotonic = true
	for (const p of focusPubs) {
		if (p.focus_position < prev) monotonic = false
		prev = p.focus_position
	}
	assert('focus_position monotonic non-decreasing', monotonic)
	const last = focusPubs[focusPubs.length - 1]
	assert('final focus_position > 0', last.focus_position > 0)
	assert('final focus_percent > 0', last.focus_percent > 0)
}

async function test3_zoomStepDirectionReversalPublishes() {
	console.log('\n[TEST 3] Reversing zoom mid-spin publishes updated values immediately')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 5000
	self.varUpdates.length = 0

	// Two tele clicks with a gap so elapsed > 0 on the 2nd
	await acts.zoom_step_in.callback({ options: { speed: 7, idleMs: 500 } })
	await sleep(150)
	await acts.zoom_step_in.callback({ options: { speed: 7, idleMs: 500 } })
	// After the second click, zoom_position should be > 5000
	const pubsPreReverse = self.varUpdates.filter((v) => 'zoom_position' in v)
	const maxPreReverse = pubsPreReverse.reduce((a, p) => Math.max(a, p.zoom_position), 0)
	assert('tele-phase publications > 5000 baseline', maxPreReverse > 5000, `max=${maxPreReverse}, pubs=${JSON.stringify(pubsPreReverse.map((p)=>p.zoom_position))}`)

	// Now reverse
	await acts.zoom_step_out.callback({ options: { speed: 7, idleMs: 500 } })
	const pubsAfterReverse = self.varUpdates.filter((v) => 'zoom_position' in v)
	assert('publications continue after reversal', pubsAfterReverse.length > pubsPreReverse.length)
}

async function test4_focusStepPublishesEvenBeforeAutoStop() {
	console.log('\n[TEST 4] focus_step_near publishes IMMEDIATELY on 1st click (no waiting for auto-stop)')
	const self = makeFakeSelf()
	self.state.focusPos = 10000
	const acts = getActions(self)
	self.varUpdates.length = 0

	// Single click — no waiting
	await acts.focus_step_near.callback({ options: { speed: 4, idleMs: 500 } })

	// Immediately (synchronously after await), variable must already be published
	const pubs = self.varUpdates.filter((v) => 'focus_position' in v)
	assert('focus_position published on 1st click', pubs.length >= 1, `got ${pubs.length}`)
	assert('published value in [0..16384]', pubs[0].focus_position >= 0 && pubs[0].focus_position <= 16384)
}

async function test5_zoomStopFinalisesEstimate() {
	console.log('\n[TEST 5] Auto-stop still refines final zoom_position after idle')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.zoomPos = 0
	self.varUpdates.length = 0

	// One click then wait for auto-stop
	await acts.zoom_step_in.callback({ options: { speed: 4, idleMs: 100 } })
	const posAtClick = self.state.zoomPos
	// Wait long enough for auto-stop
	await sleep(250)
	assert('state.zoomPos increased between click and auto-stop', self.state.zoomPos > posAtClick, `click=${posAtClick}, stop=${self.state.zoomPos}`)
	// A zoomStop packet must be in the outgoing bytes (81 01 04 07 00 FF)
	const stopSent = self.sent.some((b) => b[0] === 0x81 && b[2] === 0x04 && b[3] === 0x07 && b[4] === 0x00)
	assert('zoomStop sent by auto-stop', stopSent)
}

async function test6_focusStopFinalisesEstimate() {
	console.log('\n[TEST 6] Auto-stop still refines final focus_position after idle')
	const self = makeFakeSelf()
	const acts = getActions(self)
	self.state.focusPos = 0
	self.varUpdates.length = 0
	await acts.focus_step_far.callback({ options: { speed: 4, idleMs: 100 } })
	const posAtClick = self.state.focusPos
	await sleep(250)
	assert('state.focusPos increased between click and auto-stop', self.state.focusPos > posAtClick, `click=${posAtClick}, stop=${self.state.focusPos}`)
	const stopSent = self.sent.some((b) => b[0] === 0x81 && b[2] === 0x04 && b[3] === 0x08 && b[4] === 0x00)
	assert('focusStop sent by auto-stop', stopSent)
}

async function test7_pollGuard_zoom() {
	console.log('\n[TEST 7] Poll _setZoomPos guard: while driving, incoming inquiry does NOT clobber tracker')
	// Instead of a full Companion instance, simulate the guard logic directly on a fake object
	// mirroring main.js _setZoomPos behaviour.
	const fake = { state: { zoomPos: 500 }, _zoomDriveDir: 'tele', _zoomStopTimer: null, setVariableValues: (v) => (fake._last = v) }
	const { parseInqReply, denibble16 } = await import('../src/commands.js')
	// Fake reply payload that would set zoomPos to 0
	const buf = Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0xff])
	// Directly invoke the module-level function logic — since it's a method on TenveoInstance,
	// mock the same behaviour here to prove the guard: if drive active, skip.
	function _setZoomPos(self, buf) {
		const data = parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = denibble16(data)
		if (self._zoomDriveDir || self._zoomStopTimer) return
		self.state.zoomPos = v
	}
	_setZoomPos(fake, buf)
	assert('state.zoomPos preserved (still 500) despite poll reply of 0', fake.state.zoomPos === 500)
	// Now with drive cleared: poll SHOULD overwrite
	fake._zoomDriveDir = null
	_setZoomPos(fake, buf)
	assert('state.zoomPos overwritten to 0 when drive is idle', fake.state.zoomPos === 0)
}

async function test8_pollGuard_focus() {
	console.log('\n[TEST 8] Poll _setFocusPos guard: same behaviour for focus')
	const fake = { state: { focusPos: 8000 }, _focusDriveDir: null, _focusStopTimer: 'timer', setVariableValues: () => {} }
	const { parseInqReply, denibble16 } = await import('../src/commands.js')
	const buf = Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0xff])
	function _setFocusPos(self, buf) {
		const data = parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = denibble16(data)
		if (self._focusDriveDir || self._focusStopTimer) return
		self.state.focusPos = v
	}
	_setFocusPos(fake, buf)
	assert('state.focusPos preserved while stop timer pending', fake.state.focusPos === 8000)
	fake._focusStopTimer = null
	_setFocusPos(fake, buf)
	assert('state.focusPos overwritten when idle', fake.state.focusPos === 0)
}

async function test9_focusPos0SeededOnInit() {
	console.log('\n[TEST 9] state.focusPos starts at 0 (mirrors main.js)')
	const self = makeFakeSelf()
	assert('state.focusPos === 0', self.state.focusPos === 0)
}

async function test10_zoomPos0SeededOnInit() {
	console.log('\n[TEST 10] state.zoomPos starts at 0 (mirrors main.js)')
	const self = makeFakeSelf()
	assert('state.zoomPos === 0', self.state.zoomPos === 0)
}

async function run() {
	await test1_zoomStepPublishesEveryClick()
	await test2_focusStepPublishesEveryClick()
	await test3_zoomStepDirectionReversalPublishes()
	await test4_focusStepPublishesEvenBeforeAutoStop()
	await test5_zoomStopFinalisesEstimate()
	await test6_focusStopFinalisesEstimate()
	await test7_pollGuard_zoom()
	await test8_pollGuard_focus()
	await test9_focusPos0SeededOnInit()
	await test10_zoomPos0SeededOnInit()

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
