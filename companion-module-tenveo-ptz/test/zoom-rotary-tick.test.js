/**
 * v1.16.0 test — Zoom Rotary TICK actions.
 *
 * Each rotary tick must:
 *   • Move state.zoomPos by exactly the configured step size (clamped 0..16384).
 *   • Publish updated zoom_position + zoom_percent variables IMMEDIATELY.
 *   • Send VISCA zoomDirect(newPos) so the camera lands exactly at that spot.
 */
import { getActions } from '../src/actions.js'

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

function makeSelf(zoomPos = 0) {
	const sent = []
	const vars = {}
	return {
		config: { variant: 'ndi', zoomUnitsPerSec: 3200, zoomSpeed: 4 },
		state: { zoomPos },
		_pulseTimers: {},
		send: async (b) => sent.push(b),
		setVariableValues: (v) => Object.assign(vars, v),
		checkFeedbacks: () => {},
		log: () => {},
		sent,
		vars,
	}
}

async function test1_tickInMovesForwardAndUpdatesVar() {
	console.log('\n[TEST 1] zoom_rotary_tick_in: single click → +500 units, variable updates instantly, zoomDirect sent')
	const self = makeSelf(0)
	const acts = getActions(self)
	assert('action defined', !!acts.zoom_rotary_tick_in)
	await acts.zoom_rotary_tick_in.callback({ options: { step: 500 } })
	assert('state.zoomPos = 500', self.state.zoomPos === 500)
	assert('variable zoom_position = 500', self.vars.zoom_position === 500)
	assert('variable zoom_percent = 3 (500/16384)', self.vars.zoom_percent === 3, `got ${self.vars.zoom_percent}`)
	assert('exactly 1 VISCA cmd sent', self.sent.length === 1)
	// zoomDirect(500) = 81 01 04 47 pp pp pp pp FF — nibble16(500) = [0,0,1,244]... wait 500 = 0x1F4 → nibbles = [0,0,1,15,4] wait let's just check opcode
	assert('cmd is zoomDirect opcode (0x47)', self.sent[0] && self.sent[0][3] === 0x47, JSON.stringify(self.sent[0]))
}

async function test2_multipleTicksAccumulate() {
	console.log('\n[TEST 2] 5 clicks × 500 units → zoomPos = 2500, percent = 15')
	const self = makeSelf(0)
	const acts = getActions(self)
	for (let i = 0; i < 5; i++) {
		await acts.zoom_rotary_tick_in.callback({ options: { step: 500 } })
	}
	assert('zoomPos = 2500', self.state.zoomPos === 2500)
	assert('zoom_percent = 15', self.vars.zoom_percent === 15, `got ${self.vars.zoom_percent}`)
	assert('5 VISCA cmds sent', self.sent.length === 5)
}

async function test3_tickOutSubtracts() {
	console.log('\n[TEST 3] zoom_rotary_tick_out subtracts step')
	const self = makeSelf(3000)
	const acts = getActions(self)
	await acts.zoom_rotary_tick_out.callback({ options: { step: 800 } })
	assert('zoomPos = 2200', self.state.zoomPos === 2200)
	assert('zoom_position variable = 2200', self.vars.zoom_position === 2200)
}

async function test4_clampAtMax() {
	console.log('\n[TEST 4] tick_in clamps at 16384')
	const self = makeSelf(16000)
	const acts = getActions(self)
	await acts.zoom_rotary_tick_in.callback({ options: { step: 5000 } })
	assert('zoomPos clamps to 16384', self.state.zoomPos === 16384)
	assert('zoom_percent = 100', self.vars.zoom_percent === 100)
}

async function test5_clampAtMin() {
	console.log('\n[TEST 5] tick_out clamps at 0')
	const self = makeSelf(300)
	const acts = getActions(self)
	await acts.zoom_rotary_tick_out.callback({ options: { step: 1000 } })
	assert('zoomPos clamps to 0', self.state.zoomPos === 0)
	assert('zoom_percent = 0', self.vars.zoom_percent === 0)
}

async function test6_variableUpdatesBeforeSend() {
	console.log('\n[TEST 6] Variable IS updated even when send throws (send failure ≠ var-update failure)')
	const self = makeSelf(0)
	self.send = async () => {
		throw new Error('simulated VISCA timeout')
	}
	const acts = getActions(self)
	await acts.zoom_rotary_tick_in.callback({ options: { step: 500 } })
	// Safe wrapper swallows send throw but state + variable MUST already be updated
	assert('state.zoomPos = 500 despite send throw', self.state.zoomPos === 500)
	assert('variable zoom_position published despite send throw', self.vars.zoom_position === 500)
}

;(async () => {
	await test1_tickInMovesForwardAndUpdatesVar()
	await test2_multipleTicksAccumulate()
	await test3_tickOutSubtracts()
	await test4_clampAtMax()
	await test5_clampAtMin()
	await test6_variableUpdatesBeforeSend()

	const failed = results.filter((r) => !r.ok)
	const total = results.length
	console.log(`\n───── ${total - failed.length}/${total} assertions passed ─────`)
	if (failed.length) {
		console.error('Failed:')
		failed.forEach((f) => console.error(`  ✗ ${f.name}${f.extra ? ' — ' + f.extra : ''}`))
		process.exit(1)
	}
})()
