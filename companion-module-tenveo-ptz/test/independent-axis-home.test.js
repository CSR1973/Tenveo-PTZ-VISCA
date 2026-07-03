/**
 * Independent verify — confirms review-request items:
 *  - Action keys pan_home_only, tilt_home_only, zoom_home_only exist
 *  - Byte-level correctness of each home action
 *  - Smooth zoom step (coalesce) and zoom_percent variable behaviour
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

let pass = 0, fail = 0
function ok(name, cond, extra = '') {
	if (cond) { console.log('  ✓', name, extra); pass++ }
	else { console.error('  ✗', name, extra); fail++ }
}

// 1. Action keys exist
{
	console.log('\n[V1] Action keys exist on getActions(self)')
	const s = makeSelf()
	const a = getActions(s)
	ok('pan_home_only key present', typeof a.pan_home_only === 'object' && typeof a.pan_home_only.callback === 'function')
	ok('tilt_home_only key present', typeof a.tilt_home_only === 'object' && typeof a.tilt_home_only.callback === 'function')
	ok('zoom_home_only key present', typeof a.zoom_home_only === 'object' && typeof a.zoom_home_only.callback === 'function')
}

// 2. pan_home_only preserves tilt & zoom
{
	console.log('\n[V2] pan_home_only preserves tilt & zoom')
	const s = makeSelf()
	const a = getActions(s)
	s.state.tiltDeg = 25; s.state.panDeg = 42; s.state.zoomPos = 8000
	await a.pan_home_only.callback({ options: { panSpeed: 12 } })
	ok('1 packet', s.sent.length === 1, `got=${s.sent.length}`)
	const b = s.sent[0]
	ok('ptAbsolute packet (cmd 06 02)', b[2] === 0x06 && b[3] === 0x02)
	const p = ((b[6]&0xf)<<12)|((b[7]&0xf)<<8)|((b[8]&0xf)<<4)|(b[9]&0xf)
	const t = ((b[10]&0xf)<<12)|((b[11]&0xf)<<8)|((b[12]&0xf)<<4)|(b[13]&0xf)
	const panU = p >= 0x8000 ? p - 0x10000 : p
	const tiltU = t >= 0x8000 ? t - 0x10000 : t
	ok('panU=19050', panU === 19050, `got=${panU}`)
	ok('tiltU≈10167 (25° * 86.66 + 8000)', Math.abs(tiltU - 10167) <= 1, `got=${tiltU}`)
	ok('no zoomDirect sent', !s.sent.some(x => x[3] === 0x47))
	ok('state.tiltDeg still 25', s.state.tiltDeg === 25, `got=${s.state.tiltDeg}`)
	ok('state.zoomPos still 8000', s.state.zoomPos === 8000, `got=${s.state.zoomPos}`)
}

// 3. tilt_home_only preserves pan & zoom
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
	ok('panU≈12526 (-60° * 108.74 + 19050)', Math.abs(panU - 12526) <= 1, `got=${panU}`)
	ok('state.panDeg untouched (-60)', s.state.panDeg === -60)
	ok('state.zoomPos untouched (4000)', s.state.zoomPos === 4000)
	ok('no zoomDirect sent', !s.sent.some(x => x[3] === 0x47))
}

// 4. zoom_home_only sends zoomDirect(0), no pt packet, updates var
{
	console.log('\n[V4] zoom_home_only → zoomDirect(0)')
	const s = makeSelf()
	const a = getActions(s)
	s.state.panDeg = 42; s.state.tiltDeg = -17; s.state.zoomPos = 12000
	await a.zoom_home_only.callback()
	ok('1 packet', s.sent.length === 1)
	const b = s.sent[0]
	ok('starts with 81 01 04 47', b[0]===0x81 && b[1]===0x01 && b[2]===0x04 && b[3]===0x47)
	const p = ((b[4]&0xf)<<12)|((b[5]&0xf)<<8)|((b[6]&0xf)<<4)|(b[7]&0xf)
	ok('zoomDirect(0)', p === 0, `got=${p}`)
	ok('state.panDeg untouched 42', s.state.panDeg === 42)
	ok('state.tiltDeg untouched -17', s.state.tiltDeg === -17)
	const last = s.varUpdates[s.varUpdates.length-1]
	ok('zoom_percent var = 0', last && last.zoom_percent === 0, JSON.stringify(last))
}

// 5. Smooth zoom stepping (coalesce)
{
	console.log('\n[V5] 10 rapid zoom_step_in → 1 zoomDirect(5120)')
	const s = makeSelf()
	const a = getActions(s)
	for (let i = 0; i < 10; i++) await a.zoom_step_in.callback({ options: { delta: 512 } })
	await new Promise(r => setTimeout(r, 80))
	ok('exactly 1 packet after coalesce', s.sent.length === 1, `got=${s.sent.length}`)
	const b = s.sent[0]
	const p = ((b[4]&0xf)<<12)|((b[5]&0xf)<<8)|((b[6]&0xf)<<4)|(b[7]&0xf)
	ok('zoomDirect pos=5120', p === 5120, `got=${p}`)
	ok('no start/stop pulses (single-packet only)', s.sent.length === 1)
}

// 6. zoom_percent variable progression
{
	console.log('\n[V6] zoom_percent variable: 50 then 100 then 0')
	const s = makeSelf()
	const a = getActions(s)
	await a.zoom_step_in.callback({ options: { delta: 8192 } })
	ok('has zoom_percent=50', s.varUpdates.some(v => v.zoom_percent === 50), JSON.stringify(s.varUpdates))
	await a.zoom_step_in.callback({ options: { delta: 8192 } })
	ok('has zoom_percent=100', s.varUpdates.some(v => v.zoom_percent === 100))
	await a.zoom_home_only.callback()
	ok('after zoom_home_only → zoom_percent=0', s.varUpdates[s.varUpdates.length-1].zoom_percent === 0)
}

console.log(`\n───── ${pass} passed, ${fail} failed ─────`)
process.exit(fail ? 1 : 0)
