/**
 * VISCA transport — supports both VISCA-over-IP (UDP 52381) and
 * raw VISCA-over-TCP on the same port (used by PTZOptics and many Tenveo models).
 *
 * UDP path wraps each command in the 8-byte Sony VISCA-over-IP header.
 * TCP path sends raw VISCA bytes (no header) and parses replies on 0xFF.
 */
import dgram from 'node:dgram'
import net from 'node:net'
import { EventEmitter } from 'node:events'

export const PAYLOAD_TYPE = {
	COMMAND: 0x0100,
	INQUIRY: 0x0110,
	REPLY: 0x0200,
	CONTROL: 0x0201,
}

export class ViscaIP extends EventEmitter {
	constructor({ host, port, transport = 'tcp', cameraId = 1, logger = console, verbose = false }) {
		super()
		this.host = host
		this.transport = transport === 'udp' ? 'udp' : 'tcp'
		this.port = port || 52381
		this.cameraId = Math.min(Math.max(cameraId, 1), 7)
		this.logger = logger
		this.verbose = verbose
		this.seq = 1
		this.socket = null
		this.connected = false
		this.pending = new Map()
		this._rxBuf = Buffer.alloc(0)
	}

	get addr() {
		return 0x80 | this.cameraId
	}

	open() {
		if (this.transport === 'tcp') this._openTcp()
		else this._openUdp()
	}

	close() {
		for (const [, p] of this.pending) {
			clearTimeout(p.timer)
			try {
				p.reject(new Error('socket closed'))
			} catch (_) {
				/* ignore */
			}
		}
		this.pending.clear()
		if (this.socket) {
			try {
				if (this.socket.destroy) this.socket.destroy()
				else this.socket.close()
			} catch (_) {
				/* ignore */
			}
			this.socket = null
		}
		this.connected = false
	}

	_openUdp() {
		this.socket = dgram.createSocket('udp4')
		this.socket.on('error', (err) => {
			this.logger.error(`VISCA UDP error: ${err.message}`)
			this.connected = false
			this.emit('disconnected', err)
		})
		this.socket.on('message', (msg) => this._onUdpMessage(msg))
		this.socket.bind(0, () => {
			this._sendRawUdp(PAYLOAD_TYPE.CONTROL, Buffer.from([0x01]))
				.then(() => {
					this.connected = true
					this.emit('connected')
				})
				.catch(() => {})
		})
	}

	_openTcp() {
		this.socket = net.createConnection(this.port, this.host)
		this.socket.setNoDelay(true)
		this.socket.on('connect', () => {
			this.connected = true
			this.emit('connected')
		})
		this.socket.on('data', (msg) => this._onTcpData(msg))
		this.socket.on('error', (err) => {
			this.logger.error(`VISCA TCP error: ${err.message}`)
			this.connected = false
			this.emit('disconnected', err)
		})
		this.socket.on('close', () => {
			this.connected = false
			this.emit('disconnected')
		})
	}

	_nextSeq() {
		const s = this.seq
		this.seq = (this.seq + 1) >>> 0
		if (this.seq === 0) this.seq = 1
		return s
	}

	_hex(buf) {
		return [...buf].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
	}

	command(payload) {
		const buf = Array.isArray(payload) ? Buffer.from(payload) : payload
		if (buf[0] === undefined) return Promise.reject(new Error('empty payload'))
		if ((buf[0] & 0xf0) === 0x80) buf[0] = this.addr
		return this._sendRaw(PAYLOAD_TYPE.COMMAND, buf)
	}

	inquiry(payload) {
		const buf = Array.isArray(payload) ? Buffer.from(payload) : payload
		if ((buf[0] & 0xf0) === 0x80) buf[0] = this.addr
		return this._sendRaw(PAYLOAD_TYPE.INQUIRY, buf)
	}

	_sendRaw(payloadType, payload) {
		if (this.transport === 'tcp') return this._sendRawTcp(payload)
		return this._sendRawUdp(payloadType, payload)
	}

	_sendRawUdp(payloadType, payload) {
		return new Promise((resolve, reject) => {
			if (!this.socket) return reject(new Error('socket not open'))
			const seq = this._nextSeq()
			const header = Buffer.alloc(8)
			header.writeUInt16BE(payloadType, 0)
			header.writeUInt16BE(payload.length, 2)
			header.writeUInt32BE(seq, 4)
			const packet = Buffer.concat([header, payload])

			const timer = setTimeout(() => {
				this.pending.delete(seq)
				resolve({ timeout: true, seq })
			}, 250)
			this.pending.set(seq, { resolve, reject, timer })

			if (this.verbose) {
				this.logger.debug(`UDP TX seq=${seq} type=0x${payloadType.toString(16)} ${this._hex(payload)}`)
			}
			this.socket.send(packet, this.port, this.host, (err) => {
				if (err) {
					clearTimeout(timer)
					this.pending.delete(seq)
					reject(err)
				}
			})
		})
	}

	_sendRawTcp(payload) {
		return new Promise((resolve, reject) => {
			if (!this.socket) return reject(new Error('socket not open'))
			const seq = this._nextSeq()
			const timer = setTimeout(() => {
				this.pending.delete(seq)
				resolve({ timeout: true, seq })
			}, 400)
			this.pending.set(seq, { resolve, reject, timer })
			if (this.verbose) this.logger.debug(`TCP TX seq=${seq} ${this._hex(payload)}`)
			try {
				this.socket.write(payload)
			} catch (e) {
				clearTimeout(timer)
				this.pending.delete(seq)
				reject(e)
			}
		})
	}

	_onUdpMessage(msg) {
		if (msg.length < 8) return
		const payloadType = msg.readUInt16BE(0)
		const seq = msg.readUInt32BE(4)
		const payload = msg.slice(8)
		if (this.verbose) {
			this.logger.debug(`UDP RX seq=${seq} type=0x${payloadType.toString(16)} ${this._hex(payload)}`)
		}
		const p = this.pending.get(seq)
		if (p) {
			clearTimeout(p.timer)
			this.pending.delete(seq)
			p.resolve({ payloadType, payload, seq })
		}
		this.emit('reply', { payloadType, payload, seq })
	}

	_onTcpData(chunk) {
		this._rxBuf = Buffer.concat([this._rxBuf, chunk])
		let idx
		while ((idx = this._rxBuf.indexOf(0xff)) >= 0) {
			const msg = this._rxBuf.slice(0, idx + 1)
			this._rxBuf = this._rxBuf.slice(idx + 1)
			if (this.verbose) this.logger.debug(`TCP RX ${this._hex(msg)}`)
			// Resolve the oldest pending command only on Completion (0x5*),
			// ignore intermediate ACK (0x4*).
			if (msg.length >= 2 && (msg[1] & 0xf0) === 0x50) {
				const nextKey = this.pending.keys().next().value
				if (nextKey !== undefined) {
					const p = this.pending.get(nextKey)
					clearTimeout(p.timer)
					this.pending.delete(nextKey)
					p.resolve({ payload: msg, seq: nextKey })
				}
			}
			this.emit('reply', { payload: msg })
		}
	}
}
