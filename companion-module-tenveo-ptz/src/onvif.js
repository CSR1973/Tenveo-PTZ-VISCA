/**
 * Minimal ONVIF SOAP client for Tenveo PTZ cameras.
 *
 * Used because Tenveo firmwares (notably the NDI line) silently drop VISCA
 * preset memory commands (0x04 0x3F) — they reply ACK+Completion but never
 * actually save or recall the position. ONVIF presets work natively over
 * HTTP/SOAP on port 2000.
 *
 * Implements only the 3 PTZ preset operations we need:
 *   - GetProfiles       (called once on connect; caches the profile token)
 *   - SetPreset         (save current PTZ position as preset N)
 *   - GotoPreset        (recall preset N)
 *   - RemovePreset      (delete preset N)
 *
 * Auth: HTTP Digest (Tenveo default username/password is admin/admin).
 */

import http from 'node:http'
import crypto from 'node:crypto'

export class OnvifClient {
	constructor({ host, port = 2000, username = 'admin', password = 'admin', logger = console, verbose = false }) {
		this.host = host
		this.port = port
		this.username = username
		this.password = password
		this.logger = logger
		this.verbose = verbose
		this.profileToken = null
	}

	_request(service, body) {
		return new Promise((resolve, reject) => {
			const path = `/onvif/${service}`
			const opts = {
				host: this.host,
				port: this.port,
				path,
				method: 'POST',
				headers: {
					'Content-Type': 'application/soap+xml; charset=utf-8',
					'Content-Length': Buffer.byteLength(body),
				},
				timeout: 4000,
			}
			const handleRes = (res, onChallenge) => {
				let data = ''
				res.on('data', (c) => (data += c))
				res.on('end', () => {
					if (res.statusCode === 401 && onChallenge && res.headers['www-authenticate']) {
						onChallenge(res.headers['www-authenticate'])
					} else if (res.statusCode >= 200 && res.statusCode < 300) {
						if (this.verbose) this.logger.debug(`ONVIF RX ${service}: ${data.slice(0, 200)}…`)
						resolve(data)
					} else {
						reject(new Error(`ONVIF HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
					}
				})
			}
			if (this.verbose) this.logger.debug(`ONVIF TX ${service}: ${body.slice(0, 200)}…`)
			const req = http.request(opts, (res) =>
				handleRes(res, (challenge) => {
					const auth = this._buildDigestAuth(challenge, 'POST', path)
					opts.headers['Authorization'] = auth
					const retry = http.request(opts, (res2) => handleRes(res2))
					retry.on('error', reject)
					retry.on('timeout', () => retry.destroy(new Error('ONVIF timeout')))
					retry.write(body)
					retry.end()
				}),
			)
			req.on('error', reject)
			req.on('timeout', () => req.destroy(new Error('ONVIF timeout')))
			req.write(body)
			req.end()
		})
	}

	_buildDigestAuth(challenge, method, path) {
		const parts = {}
		challenge
			.replace(/^Digest\s+/i, '')
			.split(',')
			.forEach((p) => {
				const eq = p.indexOf('=')
				if (eq < 0) return
				const k = p.slice(0, eq).trim()
				const v = p.slice(eq + 1).trim().replace(/^"|"$/g, '')
				parts[k] = v
			})
		const qop = parts.qop ? parts.qop.split(',')[0].trim() : 'auth'
		const ha1 = crypto
			.createHash('md5')
			.update(`${this.username}:${parts.realm}:${this.password}`)
			.digest('hex')
		const ha2 = crypto.createHash('md5').update(`${method}:${path}`).digest('hex')
		const nc = '00000001'
		const cnonce = crypto.randomBytes(8).toString('hex')
		const response = crypto
			.createHash('md5')
			.update(`${ha1}:${parts.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
			.digest('hex')
		return (
			`Digest username="${this.username}", realm="${parts.realm}", ` +
			`nonce="${parts.nonce}", uri="${path}", qop=${qop}, nc=${nc}, ` +
			`cnonce="${cnonce}", response="${response}", algorithm=MD5`
		)
	}

	_envelope(body) {
		return (
			'<?xml version="1.0" encoding="UTF-8"?>\n' +
			'<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" ' +
			'xmlns:tt="http://www.onvif.org/ver10/schema" ' +
			'xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" ' +
			'xmlns:trt="http://www.onvif.org/ver10/media/wsdl">' +
			`<s:Body>${body}</s:Body>` +
			'</s:Envelope>'
		)
	}

	async getProfileToken() {
		if (this.profileToken) return this.profileToken
		const body = this._envelope('<trt:GetProfiles/>')
		const res = await this._request('media_service', body)
		// Find the first Profiles element's token attribute.
		// Match handles either <trt:Profiles ... token="X"> or <Profiles ... token="X">.
		const m = res.match(/<(?:[a-zA-Z]+:)?Profiles\b[^>]*\btoken="([^"]+)"/)
		if (!m) throw new Error('No ONVIF media profiles returned')
		this.profileToken = m[1]
		return this.profileToken
	}

	async gotoPreset(presetToken) {
		const profile = await this.getProfileToken()
		const body = this._envelope(
			`<tptz:GotoPreset>` +
				`<tptz:ProfileToken>${profile}</tptz:ProfileToken>` +
				`<tptz:PresetToken>${presetToken}</tptz:PresetToken>` +
				`</tptz:GotoPreset>`,
		)
		return this._request('ptz_service', body)
	}

	async setPreset(presetToken, name) {
		const profile = await this.getProfileToken()
		const body = this._envelope(
			`<tptz:SetPreset>` +
				`<tptz:ProfileToken>${profile}</tptz:ProfileToken>` +
				(name ? `<tptz:PresetName>${name}</tptz:PresetName>` : '') +
				`<tptz:PresetToken>${presetToken}</tptz:PresetToken>` +
				`</tptz:SetPreset>`,
		)
		return this._request('ptz_service', body)
	}

	async removePreset(presetToken) {
		const profile = await this.getProfileToken()
		const body = this._envelope(
			`<tptz:RemovePreset>` +
				`<tptz:ProfileToken>${profile}</tptz:ProfileToken>` +
				`<tptz:PresetToken>${presetToken}</tptz:PresetToken>` +
				`</tptz:RemovePreset>`,
		)
		return this._request('ptz_service', body)
	}
}
