/**
 * v1.14.0 test — Yellow Triangle guard.
 *
 * Verifies that any runtime error thrown inside an action callback is caught
 * and logged via self.log('error', ...) INSTEAD of surfacing up to Bitfocus
 * Companion as an unhandled rejection (which would show a yellow warning
 * triangle on the Stream Deck button).
 */
import { getActions } from '../src/actions.js'

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

function makeSelf(overrides = {}) {
	const logs = []
	return {
		config: { variant: 'ndi', panSpeed: 12, tiltSpeed: 10 },
		state: { expComp: 0, expCompMode: 'off', focusPos: 0, zoomPos: 0, iris: 7, blc: 'off' },
		_pulseTimers: {},
		send: async () => {},
		setVariableValues: () => {},
		checkFeedbacks: () => {},
		log: (lvl, msg) => logs.push({ lvl, msg }),
		logs,
		...overrides,
	}
}

async function test1_expcompToggleCrashIsCaught() {
	console.log('\n[TEST 1] expcomp_toggle callback throw is caught + logged, does NOT bubble')
	const self = makeSelf({
		send: async () => {
			throw new Error('simulated VISCA crash')
		},
	})
	const acts = getActions(self)
	self.logs.length = 0
	let bubbled = null
	try {
		await acts.expcomp_toggle.callback()
	} catch (e) {
		bubbled = e
	}
	assert('no exception bubbles out of callback', bubbled === null, bubbled ? String(bubbled) : 'clean')
	assert('error was logged with expcomp_toggle label', self.logs.some((l) => l.lvl === 'error' && /expcomp_toggle/.test(l.msg)))
	assert('log includes original error message', self.logs.some((l) => /simulated VISCA crash/.test(l.msg)))
}

async function test2_expcompUpCrashIsCaught() {
	console.log('\n[TEST 2] expcomp_up callback throw is caught + logged')
	const self = makeSelf({
		setVariableValues: () => {
			throw new Error('setVariableValues crash')
		},
	})
	const acts = getActions(self)
	self.logs.length = 0
	let bubbled = null
	try {
		await acts.expcomp_up.callback()
	} catch (e) {
		bubbled = e
	}
	assert('no exception bubbles out', bubbled === null)
	assert('error was logged with expcomp_up label', self.logs.some((l) => /expcomp_up/.test(l.msg)))
}

async function test3_successCallbackStillReturns() {
	console.log('\n[TEST 3] Successful callback is NOT swallowed (wrapper is transparent)')
	const self = makeSelf()
	const acts = getActions(self)
	self.logs.length = 0
	await acts.expcomp_toggle.callback()
	assert('no error was logged', self.logs.length === 0, `logs=${JSON.stringify(self.logs)}`)
	assert('state.expCompMode was flipped', self.state.expCompMode === 'on')
}

async function test4_callbackReceivesEventArgument() {
	console.log('\n[TEST 4] Wrapper forwards event + context args (expcomp_direct with options)')
	const self = makeSelf()
	const acts = getActions(self)
	self.logs.length = 0
	await acts.expcomp_direct.callback({ options: { v: 5 } })
	assert('no error was logged', self.logs.length === 0, `logs=${JSON.stringify(self.logs)}`)
	assert('state.expComp = 5 (options forwarded)', self.state.expComp === 5)
}

async function test5_gainRoutingCrashIsCaught() {
	console.log('\n[TEST 5] gain_up (NDI-routing) crash is caught + logged')
	const self = makeSelf({
		send: async () => {
			throw new Error('gain send crash')
		},
	})
	const acts = getActions(self)
	self.logs.length = 0
	let bubbled = null
	try {
		await acts.gain_up.callback()
	} catch (e) {
		bubbled = e
	}
	assert('no exception bubbles out of gain_up', bubbled === null)
	assert('error was logged with gain_up label', self.logs.some((l) => /gain_up/.test(l.msg)))
}

;(async () => {
	await test1_expcompToggleCrashIsCaught()
	await test2_expcompUpCrashIsCaught()
	await test3_successCallbackStillReturns()
	await test4_callbackReceivesEventArgument()
	await test5_gainRoutingCrashIsCaught()

	const failed = results.filter((r) => !r.ok)
	const total = results.length
	console.log(`\n───── ${total - failed.length}/${total} assertions passed ─────`)
	if (failed.length) {
		console.error('Failed:')
		failed.forEach((f) => console.error(`  ✗ ${f.name}${f.extra ? ' — ' + f.extra : ''}`))
		process.exit(1)
	}
})()
