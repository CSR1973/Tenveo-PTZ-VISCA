/**
 * v1.16.1 test — OSD menu navigation VISCA bytes.
 *
 * The pre-v1.16.1 build used pan/tilt drive bytes for menu Up/Down/Left/Right,
 * which does NOT work on Tenveo VHD20HAN in OSD mode. The correct standard
 * VISCA sequences use the CAM_Menu navigation group (0x06 0x01 0x0E 0x0E ...).
 */
import { getActions } from '../src/actions.js'
import * as C from '../src/commands.js'

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

function bytesEq(actual, expected) {
	if (!Array.isArray(actual) || actual.length !== expected.length) return false
	return expected.every((b, i) => actual[i] === b)
}

function makeSelf() {
	const sent = []
	return {
		config: { variant: 'ndi' },
		state: { menuOpen: false },
		_pulseTimers: {},
		send: async (b) => sent.push(b),
		setVariableValues: () => {},
		checkFeedbacks: () => {},
		log: () => {},
		sent,
	}
}

function test1_navByteExactness() {
	console.log('\n[TEST 1] Menu nav commands use CAM_Menu-Nav opcodes (0x06 0x01 0x0E 0x0E ...)')
	assert('menuNavUp    = 81 01 06 01 0E 0E 03 01 FF', bytesEq(C.menuNavUp(),    [0x81, 0x01, 0x06, 0x01, 0x0e, 0x0e, 0x03, 0x01, 0xff]))
	assert('menuNavDown  = 81 01 06 01 0E 0E 03 02 FF', bytesEq(C.menuNavDown(),  [0x81, 0x01, 0x06, 0x01, 0x0e, 0x0e, 0x03, 0x02, 0xff]))
	assert('menuNavLeft  = 81 01 06 01 0E 0E 01 03 FF', bytesEq(C.menuNavLeft(),  [0x81, 0x01, 0x06, 0x01, 0x0e, 0x0e, 0x01, 0x03, 0xff]))
	assert('menuNavRight = 81 01 06 01 0E 0E 02 03 FF', bytesEq(C.menuNavRight(), [0x81, 0x01, 0x06, 0x01, 0x0e, 0x0e, 0x02, 0x03, 0xff]))
}

function test2_enterAndBackBytes() {
	console.log('\n[TEST 2] menuEnter = CAM_MenuReturn OK (0x06 06 05), menuBack = CAM_MenuReturn Cancel (0x06 06 04)')
	assert('menuEnter = 81 01 06 06 05 FF', bytesEq(C.menuEnter(), [0x81, 0x01, 0x06, 0x06, 0x05, 0xff]))
	assert('menuBack  = 81 01 06 06 04 FF', bytesEq(C.menuBack(),  [0x81, 0x01, 0x06, 0x06, 0x04, 0xff]))
}

function test3_menuBackNoLongerEqualsMenuOff() {
	console.log('\n[TEST 3] Regression: menuBack must NOT be identical to menuOff (regression fix)')
	assert('menuBack ≠ menuOff', !bytesEq(C.menuBack(), C.menuOff()))
}

async function test4_menuToggleStateFlipUsesOnOffBytes() {
	console.log('\n[TEST 4] menu_toggle uses reliable on/off bytes + tracks menuOpen state locally')
	const self = makeSelf()
	const acts = getActions(self)
	assert('initial menuOpen = false', self.state.menuOpen === false)

	await acts.menu_toggle.callback()
	assert('after 1st toggle → menuOpen = true', self.state.menuOpen === true)
	assert('1st toggle sent menuOn bytes (06 06 02)', self.sent[0] && self.sent[0][3] === 0x06 && self.sent[0][4] === 0x02)

	await acts.menu_toggle.callback()
	assert('after 2nd toggle → menuOpen = false', self.state.menuOpen === false)
	assert('2nd toggle sent menuOff bytes (06 06 03)', self.sent[1] && self.sent[1][3] === 0x06 && self.sent[1][4] === 0x03)
}

async function test5_navigationActionsFire() {
	console.log('\n[TEST 5] Nav actions dispatch through osdNavStyle (default = cam_menu_nav)')
	const self = makeSelf()
	const acts = getActions(self)
	await acts.menu_up.callback()
	await acts.menu_down.callback()
	await acts.menu_enter.callback()
	await acts.menu_back.callback()
	assert('menu_up sent nav-up bytes',    bytesEq(self.sent[0], C.menuNavUp()))
	assert('menu_down sent nav-down bytes',bytesEq(self.sent[1], C.menuNavDown()))
	assert('menu_enter sent enter bytes',  bytesEq(self.sent[2], C.menuEnter()))
	assert('menu_back sent back bytes',    bytesEq(self.sent[3], C.menuBack()))
}

async function test6_ptzDriveStylesSendDifferentBytes() {
	console.log('\n[TEST 6] osdNavStyle=ptz_drive_* switches to pan/tilt drive bytes at chosen speed')
	for (const [style, speed] of [['ptz_drive_slow', 3], ['ptz_drive_med', 6], ['ptz_drive_fast', 0x0e]]) {
		const self = makeSelf()
		self.config.osdNavStyle = style
		const acts = getActions(self)
		await acts.menu_down.callback()
		const b = self.sent[0]
		assert(`${style}: bytes = ptDrive DOWN @ speed ${speed}`,
			b && b[0] === 0x81 && b[1] === 0x01 && b[2] === 0x06 && b[3] === 0x01 && b[4] === speed && b[5] === speed && b[6] === 0x03 && b[7] === 0x02,
			JSON.stringify(b))
	}
}

async function test7_broadcastFiresAllStyles() {
	console.log('\n[TEST 7] osdNavStyle=broadcast fires CAM_Menu-Nav + 3 pt-drive speeds')
	const self = makeSelf()
	self.config.osdNavStyle = 'broadcast'
	const acts = getActions(self)
	await acts.menu_up.callback()
	// Wait for the delayed pt-stop after 150ms
	await new Promise((r) => setTimeout(r, 220))
	// Expect 4 fires + 1 stop = 5 total
	assert('broadcast sent 5 commands (4 nav + 1 stop)', self.sent.length === 5, `got ${self.sent.length}`)
	assert('first cmd = CAM_Menu-Nav up', bytesEq(self.sent[0], C.menuNavUp()))
	assert('last cmd = ptStop', bytesEq(self.sent[4], C.menuPtStop()))
}

;(async () => {
	test1_navByteExactness()
	test2_enterAndBackBytes()
	test3_menuBackNoLongerEqualsMenuOff()
	await test4_menuToggleStateFlipUsesOnOffBytes()
	await test5_navigationActionsFire()
	await test6_ptzDriveStylesSendDifferentBytes()
	await test7_broadcastFiresAllStyles()

	const failed = results.filter((r) => !r.ok)
	const total = results.length
	console.log(`\n───── ${total - failed.length}/${total} assertions passed ─────`)
	if (failed.length) {
		console.error('Failed:')
		failed.forEach((f) => console.error(`  ✗ ${f.name}${f.extra ? ' — ' + f.extra : ''}`))
		process.exit(1)
	}
})()
