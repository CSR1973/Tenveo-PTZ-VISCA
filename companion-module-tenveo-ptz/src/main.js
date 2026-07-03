import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'

import { getConfigFields } from './config.js'
import { getActions } from './actions.js'
import { getFeedbacks } from './feedbacks.js'
import { getVariables } from './variables.js'
import { getPresets } from './presets.js'
import { ViscaIP } from './visca.js'
import { OnvifClient } from './onvif.js'
import * as C from './commands.js'

const AE_NAME = {
	[C.AE_MODE.FULL_AUTO]: 'Full Auto',
	[C.AE_MODE.MANUAL]: 'Manual',
	[C.AE_MODE.SHUTTER_PRI]: 'Shutter Pri',
	[C.AE_MODE.IRIS_PRI]: 'Iris Pri',
	[C.AE_MODE.BRIGHT]: 'Bright',
}

const WB_NAME = {
	[C.WB_MODE.AUTO]: 'Auto',
	[C.WB_MODE.INDOOR]: 'Indoor',
	[C.WB_MODE.OUTDOOR]: 'Outdoor',
	[C.WB_MODE.ONE_PUSH]: 'One-Push',
	[C.WB_MODE.ATW]: 'ATW',
	[C.WB_MODE.MANUAL]: 'Manual',
	[C.WB_MODE.SODIUM]: 'Sodium',
	[C.WB_MODE.COLOR_TEMP]: 'Color Temp',
}

class TenveoInstance extends InstanceBase {
	async init(config) {
		this.config = config
		this.state = {
			connected: false,
			onvifReady: false,
			power: 'unknown',
			af: 'unknown',
			aeMode: null,
			wbMode: null,
			lastPreset: null,
			gain: null,
			iris: null,
			shutter: null,
			zoomPos: 0,
			focusPos: null,
			panPos: null,
			tiltPos: null,
			panDeg: 0,
			tiltDeg: 0,
			colorTemp: 5600,
		}
		this._pulseTimers = {}

		this.setActionDefinitions(getActions(this))
		this.setFeedbackDefinitions(getFeedbacks(this))
		this.setVariableDefinitions(getVariables())
		this.setPresetDefinitions(getPresets())

		this._publishStaticVars()
		await this._connect()
		await this._initOnvif()
	}

	async destroy() {
		this._stopPolling()
		for (const t of Object.values(this._pulseTimers)) clearTimeout(t)
		this._pulseTimers = {}
		if (this.visca) {
			this.visca.close()
			this.visca = null
		}
		this.onvif = null
	}

	async configUpdated(config) {
		this.config = config
		this._publishStaticVars()
		this._stopPolling()
		if (this.visca) this.visca.close()
		await this._connect()
		await this._initOnvif()
	}

	getConfigFields() {
		return getConfigFields()
	}

	/* ─── Internal helpers ─── */

	_publishStaticVars() {
		this.setVariableValues({
			camera_name: this.config.name || 'Tenveo',
			host: this.config.host || '',
			pan_degrees: '0.0',
			tilt_degrees: '0.0',
			zoom_position: this.state?.zoomPos ?? 0,
			zoom_percent: Math.round(((this.state?.zoomPos ?? 0) / 16384) * 100),
			color_temp: this.state?.colorTemp ?? 5600,
			warmth: 0,
		})
	}

	async _connect() {
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No IP address')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)

		const transport = this.config.transport || 'tcp'
		this.visca = new ViscaIP({
			host: this.config.host,
			port: this.config.port || 52381,
			transport,
			cameraId: this.config.cameraId || 1,
			logger: {
				debug: (...a) => this.log('debug', a.join(' ')),
				info: (...a) => this.log('info', a.join(' ')),
				warn: (...a) => this.log('warn', a.join(' ')),
				error: (...a) => this.log('error', a.join(' ')),
			},
			verbose: !!this.config.verbose,
		})
		this.visca.on('connected', () => {
			this.state.connected = true
			this.setVariableValues({ connected: 'true' })
			this.updateStatus(InstanceStatus.Ok)
			this.checkFeedbacks('connected')
			this._startPolling()
		})
		this.visca.on('disconnected', (err) => {
			this.state.connected = false
			this.setVariableValues({ connected: 'false' })
			this.updateStatus(InstanceStatus.ConnectionFailure, err?.message)
			this.checkFeedbacks('connected')
		})
		this.visca.open()
	}

	async _initOnvif() {
		if (!this.config.host) return
		this.onvif = new OnvifClient({
			host: this.config.host,
			port: this.config.onvifPort || 2000,
			username: this.config.onvifUser || 'admin',
			password: this.config.onvifPass || 'admin',
			logger: {
				debug: (...a) => this.log('debug', a.join(' ')),
				info: (...a) => this.log('info', a.join(' ')),
				warn: (...a) => this.log('warn', a.join(' ')),
				error: (...a) => this.log('error', a.join(' ')),
			},
			verbose: !!this.config.verbose,
		})
		try {
			const token = await this.onvif.getProfileToken()
			this.state.onvifReady = true
			this.setVariableValues({ onvif_ready: 'true' })
			this.log('info', `ONVIF ready (profile token: ${token})`)
		} catch (e) {
			this.state.onvifReady = false
			this.setVariableValues({ onvif_ready: 'false' })
			this.log('warn', `ONVIF init failed: ${e.message} — presets will not work until this succeeds`)
		}
	}

	send(bytes) {
		if (!this.visca) return Promise.resolve()
		return this.visca.command(bytes).catch((e) => this.log('error', `VISCA send failed: ${e.message}`))
	}

	/* ─── Polling (chained, never overlaps) ─── */

	_startPolling() {
		this._stopPolling()
		const interval = parseInt(this.config.pollInterval, 10) || 0
		if (interval < 250) return
		this._pollStopped = false
		const loop = async () => {
			if (this._pollStopped) return
			await this._pollOnce()
			if (this._pollStopped) return
			this._poll = setTimeout(loop, interval)
		}
		loop()
	}

	_stopPolling() {
		this._pollStopped = true
		if (this._poll) {
			clearTimeout(this._poll)
			this._poll = null
		}
	}

	async _pollOnce() {
		if (!this.visca) return
		try {
			const queries = [
				{ q: C.inqPower(), set: (r) => this._setPower(r) },
				{ q: C.inqAF(), set: (r) => this._setAF(r) },
				{ q: C.inqAeMode(), set: (r) => this._setAeMode(r) },
				{ q: C.inqWbMode(), set: (r) => this._setWbMode(r) },
				{ q: C.inqZoomPos(), set: (r) => this._setZoomPos(r) },
				{ q: C.inqFocusPos(), set: (r) => this._setFocusPos(r) },
				{ q: C.inqGain(), set: (r) => this._setGain(r) },
				{ q: C.inqIris(), set: (r) => this._setIris(r) },
				{ q: C.inqShutter(), set: (r) => this._setShutter(r) },
			]
			for (const { q, set } of queries) {
				const r = await this.visca.inquiry(q)
				if (r && r.payload) set(r.payload)
			}
		} catch (e) {
			this.log('debug', `Poll error: ${e.message}`)
		}
	}

	_setPower(buf) {
		const data = C.parseInqReply(buf)
		if (!data) return
		const v = data[0] === 0x02 ? 'on' : data[0] === 0x03 ? 'off' : 'unknown'
		this.state.power = v
		this.setVariableValues({ power: v })
		this.checkFeedbacks('power_state')
	}
	_setAF(buf) {
		const data = C.parseInqReply(buf)
		if (!data) return
		const v = data[0] === 0x02 ? 'on' : 'off'
		this.state.af = v
		this.setVariableValues({ af: v })
		this.checkFeedbacks('af_state')
	}
	_setAeMode(buf) {
		const data = C.parseInqReply(buf)
		if (!data) return
		this.state.aeMode = data[0]
		this.setVariableValues({ exposure_mode: AE_NAME[data[0]] || `0x${data[0].toString(16)}` })
		this.checkFeedbacks('exposure_mode')
	}
	_setWbMode(buf) {
		const data = C.parseInqReply(buf)
		if (!data) return
		this.state.wbMode = data[0]
		this.setVariableValues({ wb_mode: WB_NAME[data[0]] || `0x${data[0].toString(16)}` })
		this.checkFeedbacks('wb_mode')
	}
	_setZoomPos(buf) {
		const data = C.parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = C.denibble16(data)
		this.state.zoomPos = v
		this.setVariableValues({
			zoom_position: v,
			zoom_percent: Math.round((Math.max(0, Math.min(16384, v)) / 16384) * 100),
		})
	}
	_setFocusPos(buf) {
		const data = C.parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = C.denibble16(data)
		this.state.focusPos = v
		this.setVariableValues({ focus_position: v })
	}
	_setGain(buf) {
		const data = C.parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = C.denibble16(data)
		this.state.gain = v
		this.setVariableValues({ gain: v })
	}
	_setIris(buf) {
		const data = C.parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = C.denibble16(data)
		this.state.iris = v
		this.setVariableValues({ iris: v })
	}
	_setShutter(buf) {
		const data = C.parseInqReply(buf)
		if (!data || data.length < 4) return
		const v = C.denibble16(data)
		this.state.shutter = v
		this.setVariableValues({ shutter: v })
	}
}

runEntrypoint(TenveoInstance, [])
