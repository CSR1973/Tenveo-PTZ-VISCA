#!/usr/bin/env node
/**
 * Mock VISCA-over-IP camera, used for unit testing the module without
 * real hardware.
 *
 *   node test/mock-camera.js [port]    (default 52381)
 *
 * It replies to all commands with "ACK + Completion" and to inquiries
 * with plausible reply bytes.
 */
import dgram from 'node:dgram'

const PORT = parseInt(process.argv[2] || '52381', 10)

const sock = dgram.createSocket('udp4')

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ')

function build(type, payload, seq) {
	const header = Buffer.alloc(8)
	header.writeUInt16BE(type, 0)
	header.writeUInt16BE(payload.length, 2)
	header.writeUInt32BE(seq, 4)
	return Buffer.concat([header, Buffer.from(payload)])
}

const state = {
	power: 0x02, // on
	af: 0x02,
	ae: 0x00,
	wb: 0x00,
	zoom: 0x0000,
	focus: 0x8000,
	pan: 0x0000,
	tilt: 0x0000,
	gain: 0x0004,
	iris: 0x0007,
	shutter: 0x000b,
}

const reply = (seq, bytes) => sock.send(build(0x0200, bytes, seq))

sock.on('message', (msg, rinfo) => {
	const type = msg.readUInt16BE(0)
	const seq = msg.readUInt32BE(4)
	const payload = msg.slice(8)
	console.log(`RX from ${rinfo.address}:${rinfo.port} type=0x${type.toString(16)} seq=${seq} ${hex(payload)}`)

	if (type === 0x0201) {
		// control: e.g. reset sequence
		return sock.send(build(0x0201, [0x01], seq), rinfo.port, rinfo.address)
	}

	const inquiry = type === 0x0110
	const addr = payload[0]
	const cmd = payload[2]
	const sub = payload[3]

	if (inquiry) {
		// 0x09 ... 0xFF
		const cat = payload[2]
		const fn = payload[3]
		let data = []
		if (cat === 0x04 && fn === 0x00) data = [state.power]
		else if (cat === 0x04 && fn === 0x38) data = [state.af]
		else if (cat === 0x04 && fn === 0x39) data = [state.ae]
		else if (cat === 0x04 && fn === 0x35) data = [state.wb]
		else if (cat === 0x04 && fn === 0x47) data = nib4(state.zoom)
		else if (cat === 0x04 && fn === 0x48) data = nib4(state.focus)
		else if (cat === 0x06 && fn === 0x12) data = [...nib4(state.pan), ...nib4(state.tilt)]
		else if (cat === 0x04 && fn === 0x4c) data = nib4(state.gain)
		else if (cat === 0x04 && fn === 0x4b) data = nib4(state.iris)
		else if (cat === 0x04 && fn === 0x4a) data = nib4(state.shutter)
		const replyBuf = [0x90, 0x50, ...data, 0xff]
		return sock.send(build(0x0200, replyBuf, seq), rinfo.port, rinfo.address)
	}

	// Command — mutate state for common ones, then ACK+Completion
	if (cmd === 0x04 && sub === 0x00) state.power = payload[4]
	if (cmd === 0x04 && sub === 0x38) state.af = payload[4]
	if (cmd === 0x04 && sub === 0x39) state.ae = payload[4]
	if (cmd === 0x04 && sub === 0x35) state.wb = payload[4]
	if (cmd === 0x04 && sub === 0x3f && payload[4] === 0x02) {
		console.log(`  → recall preset ${payload[5]}`)
	}
	if (cmd === 0x04 && sub === 0x47) {
		state.zoom = denib(payload.slice(4, 8))
	}
	if (cmd === 0x04 && sub === 0x4c) state.gain = denib(payload.slice(6, 8))

	sock.send(build(0x0200, [0x90, 0x41, 0xff], seq), rinfo.port, rinfo.address)
	sock.send(build(0x0200, [0x90, 0x51, 0xff], seq), rinfo.port, rinfo.address)
})

function nib4(v) {
	return [(v >> 12) & 0x0f, (v >> 8) & 0x0f, (v >> 4) & 0x0f, v & 0x0f]
}
function denib(arr) {
	return ((arr[0] & 0x0f) << 12) | ((arr[1] & 0x0f) << 8) | ((arr[2] & 0x0f) << 4) | (arr[3] & 0x0f)
}

sock.on('listening', () => {
	const a = sock.address()
	console.log(`Mock Tenveo VISCA camera listening on UDP ${a.address}:${a.port}`)
})

sock.bind(PORT, '0.0.0.0')
