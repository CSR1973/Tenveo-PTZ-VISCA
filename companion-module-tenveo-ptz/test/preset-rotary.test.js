/**
 * v1.15.0 test — Preset rotary + zoom-rotary smoothness bump.
 *
 * SAVE rotary:  scroll (up/down) mutates state.presetSaveIdx (no VISCA sent),
 *               publishes preset_save_index variable, wraps at min/max, push
 *               emits presetSet(idx).
 * RECALL rotary: same behaviour for state.presetRecallIdx and presetRecall.
 *
 * Zoom rotary defaults: idleMs bumped from 200/250 → 800 so slow rotary spins
 * keep the drive alive instead of stutter-stopping between ticks.
 */
import { getActions } from '../src/actions.js'

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

function makeSelf(overrides = {}) {
	const sent = []
	const vars = {}
	return {
		config: { variant: 'ndi', panSpeed: 12, tiltSpeed: 10 },
		state: { presetSaveIdx: 1, presetRecallIdx: 1, lastPreset: null, zoomPos: 0 },
		_pulseTimers: {},
		send: async (b) => {
			sent.push(b)
		},
		setVariableValues: (v) => Object.assign(vars, v),
		checkFeedbacks: () => {},
		log: () => {},
		sent,
		vars,
		...overrides,
	}
}

async function test1_saveScrollUpAdvancesIndex() {
	console.log('\n[TEST 1] preset_save_scroll_up increments preset_save_index within min..max, no VISCA sent')
	const self = makeSelf()
	const acts = getActions(self)
	assert('preset_save_scroll_up defined', !!acts.preset_save_scroll_up)
	await acts.preset_save_scroll_up.callback({ options: { min: 1, max: 5, step: 1 } })
	assert('idx after 1 click = 2', self.state.presetSaveIdx === 2)
	assert('variable preset_save_index = 2', self.vars.preset_save_index === 2)
	await acts.preset_save_scroll_up.callback({ options: { min: 1, max: 5, step: 1 } })
	await acts.preset_save_scroll_up.callback({ options: { min: 1, max: 5, step: 1 } })
	await acts.preset_save_scroll_up.callback({ options: { min: 1, max: 5, step: 1 } })
	assert('idx after 4 clicks = 5', self.state.presetSaveIdx === 5)
	assert('no VISCA sent during scroll', self.sent.length === 0)
}

async function test2_saveScrollWraps() {
	console.log('\n[TEST 2] preset_save_scroll_up wraps at max → min')
	const self = makeSelf()
	const acts = getActions(self)
	self.state.presetSaveIdx = 5
	await acts.preset_save_scroll_up.callback({ options: { min: 1, max: 5, step: 1 } })
	assert('5 + 1 wraps to 1', self.state.presetSaveIdx === 1, `got ${self.state.presetSaveIdx}`)
}

async function test3_saveScrollDownWraps() {
	console.log('\n[TEST 3] preset_save_scroll_down decrements + wraps at min → max')
	const self = makeSelf()
	const acts = getActions(self)
	self.state.presetSaveIdx = 2
	await acts.preset_save_scroll_down.callback({ options: { min: 1, max: 5, step: 1 } })
	assert('2 - 1 = 1', self.state.presetSaveIdx === 1)
	await acts.preset_save_scroll_down.callback({ options: { min: 1, max: 5, step: 1 } })
	assert('1 - 1 wraps to 5', self.state.presetSaveIdx === 5, `got ${self.state.presetSaveIdx}`)
}

async function test4_saveConfirmSendsPresetSet() {
	console.log('\n[TEST 4] preset_save_confirm sends VISCA presetSet(idx)')
	const self = makeSelf()
	const acts = getActions(self)
	self.state.presetSaveIdx = 7
	await acts.preset_save_confirm.callback({ options: { name: 'Preset $INDEX' } })
	// VISCA presetSet(7) = 81 01 04 3F 01 07 FF
	assert('exactly 1 command sent', self.sent.length === 1)
	assert('command targets preset 7', self.sent[0] && self.sent[0][5] === 7, JSON.stringify(self.sent[0]))
	assert('command opcode is preset SET (0x3F 0x01)', self.sent[0] && self.sent[0][3] === 0x3f && self.sent[0][4] === 0x01)
}

async function test5_recallRotaryFullFlow() {
	console.log('\n[TEST 5] recall rotary — scroll up + push recalls that preset')
	const self = makeSelf()
	const acts = getActions(self)
	await acts.preset_recall_scroll_up.callback({ options: { min: 1, max: 10, step: 1 } })
	await acts.preset_recall_scroll_up.callback({ options: { min: 1, max: 10, step: 1 } })
	assert('preset_recall_index = 3', self.state.presetRecallIdx === 3)
	assert('variable published', self.vars.preset_recall_index === 3)
	await acts.preset_recall_confirm.callback()
	// VISCA presetRecall(3) = 81 01 04 3F 02 03 FF
	assert('recall opcode is preset RECALL (0x3F 0x02)', self.sent[0] && self.sent[0][3] === 0x3f && self.sent[0][4] === 0x02)
	assert('recall targets preset 3', self.sent[0] && self.sent[0][5] === 3)
	assert('last_preset variable updated', self.vars.last_preset === 3)
}

async function test6_directJumpActions() {
	console.log('\n[TEST 6] direct index-jump actions do NOT trigger VISCA')
	const self = makeSelf()
	const acts = getActions(self)
	await acts.preset_save_set_index.callback({ options: { n: 42 } })
	await acts.preset_recall_set_index.callback({ options: { n: 99 } })
	assert('save idx = 42', self.state.presetSaveIdx === 42)
	assert('recall idx = 99', self.state.presetRecallIdx === 99)
	assert('no VISCA sent for direct jumps', self.sent.length === 0)
}

async function test7_zoomRotaryDefaultsBumped() {
	console.log('\n[TEST 7] Zoom rotary default idleMs raised to 800ms for slow-spin smoothness')
	const self = makeSelf()
	const acts = getActions(self)
	const zi = acts.zoom_rotary_in.options.find((o) => o.id === 'holdMs')
	const zo = acts.zoom_rotary_out.options.find((o) => o.id === 'holdMs')
	const zsi = acts.zoom_step_in.options.find((o) => o.id === 'idleMs')
	const zso = acts.zoom_step_out.options.find((o) => o.id === 'idleMs')
	assert('zoom_rotary_in holdMs default = 800', zi && zi.default === 800, `got ${zi?.default}`)
	assert('zoom_rotary_out holdMs default = 800', zo && zo.default === 800, `got ${zo?.default}`)
	assert('zoom_step_in idleMs default = 800', zsi && zsi.default === 800, `got ${zsi?.default}`)
	assert('zoom_step_out idleMs default = 800', zso && zso.default === 800, `got ${zso?.default}`)
}

;(async () => {
	await test1_saveScrollUpAdvancesIndex()
	await test2_saveScrollWraps()
	await test3_saveScrollDownWraps()
	await test4_saveConfirmSendsPresetSet()
	await test5_recallRotaryFullFlow()
	await test6_directJumpActions()
	await test7_zoomRotaryDefaultsBumped()

	const failed = results.filter((r) => !r.ok)
	const total = results.length
	console.log(`\n───── ${total - failed.length}/${total} assertions passed ─────`)
	if (failed.length) {
		console.error('Failed:')
		failed.forEach((f) => console.error(`  ✗ ${f.name}${f.extra ? ' — ' + f.extra : ''}`))
		process.exit(1)
	}
})()
