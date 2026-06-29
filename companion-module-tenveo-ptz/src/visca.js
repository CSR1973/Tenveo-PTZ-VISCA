/**
 * VISCA over IP protocol layer for Tenveo PTZ cameras.
 *
 * Wraps VISCA payloads with the 8-byte Sony "VISCA over IP" header
 * and sends them via UDP (default port 52381).
 *
 *   Header (8 bytes, big-endian):
 *     [0..1] Payload type
 *              0x01 0x00 = VISCA command
 *              0x01 0x10 = VISCA inquiry
 *              0x02 0x00 = VISCA reply
 *              0x02 0x01 = VISCA device setting command (e.g. reset seq#)
 *     [2..3] Payload length (bytes after header)
 *     [4..7] Sequence number
 *
 *   Payload always begins with 0x8X (X = camera ID 1..7) and ends with 0xFF.
 */

import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'

export const PAYLOAD_TYPE = {
	COMMAND: 0x0100,
	INQUIRY: 0x0110,
	REPLY: 0x0200,
	CONTROL: 0x0201,
}

export class ViscaIP extends EventEmitter {
	constructor({ host, port = 52381, cameraId = 1, logger = console, verbose = false }) {
		super()
		this.host = host
		this.port = port
		this.cameraId = Math.min(Math.max(cameraId, 1), 7)
		this.logger = logger
		this.verbose = verbose
		this.seq = 1
		this.socket = null
		this.connected = false
		this.pending = new Map() // seq -> { resolve, reject, timer }
		this.connectionWatchdog = null
	}

	get addr() {
		return 0x80 | this.cameraId // 0x81 for ID=1
	}

	open() {
		if (this.socket) return
		this.socket = dgram.createSocket('udp4')
		this.socket.on('error', (err) => {
			this.logger.error(`VISCA UDP error: ${err.message}`)
			this.connected = false
			this.emit('disconnected', err)
		})
		this.socket.on('message', (msg) => this._onMessage(msg))
		this.socket.bind(0, () => {
			// Send a "reset sequence" control command to verify reachability.
			this._sendControl(Buffer.from([0x01]))
				.then(() => {
					this.connected = true
					this.emit('connected')
				})
				.catch(() => {
					/* swallow — connection will be retried */
				})
		})
	}

	close() {
		if (this.connectionWatchdog) {
			clearInterval(this.connectionWatchdog)
			this.connectionWatchdog = null
		}
		for (const [seq, p] of this.pending) {
			clearTimeout(p.timer)
			p.reject(new Error('socket closed'))
			this.pending.delete(seq)
		}
		if (this.socket) {
			try {
				this.socket.close()
			} catch (_) {
				/* ignore */
			}
			this.socket = null
		}
		this.connected = false
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

	_buildPacket(payloadType, payload) {
		const seq = this._nextSeq()
		const header = Buffer.alloc(8)
		header.writeUInt16BE(payloadType, 0)
		header.writeUInt16BE(payload.length, 2)
		header.writeUInt32BE(seq, 4)
		return { packet: Buffer.concat([header, payload]), seq }
	}

	_sendRaw(payloadType, payload) {
		return new Promise((resolve, reject) => {
			if (!this.socket) return reject(new Error('socket not open'))
			const { packet, seq } = this._buildPacket(payloadType, payload)

			const timer = setTimeout(() => {
				this.pending.delete(seq)
				resolve({ timeout: true, seq }) // VISCA replies are best-effort; do not reject
			}, 800)

			this.pending.set(seq, { resolve, reject, timer })

			if (this.verbose) {
				this.logger.debug(
					`TX seq=${seq} type=0x${payloadType.toString(16)} payload=${this._hex(payload)}`,
				)
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

	_sendControl(payload) {
		return this._sendRaw(PAYLOAD_TYPE.CONTROL, payload)
	}

	/** Send a VISCA command (payload should be the full 8X..FF sequence). */
	command(payload) {
		const buf = Array.isArray(payload) ? Buffer.from(payload) : payload
		if (buf[0] === undefined) return Promise.reject(new Error('empty payload'))
		// Override camera address byte if caller used 0x81 default
		if ((buf[0] & 0xf0) === 0x80) buf[0] = this.addr
		return this._sendRaw(PAYLOAD_TYPE.COMMAND, buf)
	}

	/** Send a VISCA inquiry and resolve with parsed reply (or null on timeout). */
	inquiry(payload) {
		const buf = Array.isArray(payload) ? Buffer.from(payload) : payload
		if ((buf[0] & 0xf0) === 0x80) buf[0] = this.addr
		return this._sendRaw(PAYLOAD_TYPE.INQUIRY, buf)
	}

	_onMessage(msg) {
		if (msg.length < 8) return
		const payloadType = msg.readUInt16BE(0)
		const seq = msg.readUInt32BE(4)
		const payload = msg.slice(8)

		if (this.verbose) {
			this.logger.debug(
				`RX seq=${seq} type=0x${payloadType.toString(16)} payload=${this._hex(payload)}`,
			)
		}

		const p = this.pending.get(seq)
		if (p) {
			clearTimeout(p.timer)
			this.pending.delete(seq)
			p.resolve({ payloadType, payload, seq })
		}
		this.emit('reply', { payloadType, payload, seq })
	}
}
