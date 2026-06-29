import * as C from './commands.js'

const speedChoices = (min, max) =>
	Array.from({ length: max - min + 1 }, (_, i) => ({ id: min + i, label: String(min + i) }))

const PAN_SPEEDS = speedChoices(1, 24)
const TILT_SPEEDS = speedChoices(1, 20)
const ZOOM_SPEEDS = speedChoices(0, 7)

/** Auto-stop pulse helper for hold-style rotary actions. */
function pulse(self, key, cmd, stopCmd, holdMs) {
	if (self._pulseTimers[key]) clearTimeout(self._pulseTimers[key])
	self.send(cmd())
	self._pulseTimers[key] = setTimeout(() => {
		self.send(stopCmd())
		delete self._pulseTimers[key]
	}, holdMs)
}

/** Read calibrated units-per-degree from config (default 14). */
const upd = (self) => Math.max(1, +self.config.unitsPerDegree || 14)

export function getActions(self) {
	return {
		/* ───────── Pan / Tilt drive (hold style) ───────── */
		pt_up: {
			name: 'Pan/Tilt: Up (hold)',
			options: [
				{ type: 'dropdown', id: 'tilt', label: 'Tilt Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) => self.send(C.ptDrive(C.PT_DIR.UP, self.config.panSpeed, +options.tilt)),
		},
		pt_down: {
			name: 'Pan/Tilt: Down (hold)',
			options: [
				{ type: 'dropdown', id: 'tilt', label: 'Tilt Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) => self.send(C.ptDrive(C.PT_DIR.DOWN, self.config.panSpeed, +options.tilt)),
		},
		pt_left: {
			name: 'Pan/Tilt: Left (hold)',
			options: [
				{ type: 'dropdown', id: 'pan', label: 'Pan Speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
			],
			callback: async ({ options }) => self.send(C.ptDrive(C.PT_DIR.LEFT, +options.pan, self.config.tiltSpeed)),
		},
		pt_right: {
			name: 'Pan/Tilt: Right (hold)',
			options: [
				{ type: 'dropdown', id: 'pan', label: 'Pan Speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
			],
			callback: async ({ options }) => self.send(C.ptDrive(C.PT_DIR.RIGHT, +options.pan, self.config.tiltSpeed)),
		},
		pt_up_left:    { name: 'Pan/Tilt: Up-Left (hold)',    options: [], callback: async () => self.send(C.ptDrive(C.PT_DIR.UP_LEFT,    self.config.panSpeed, self.config.tiltSpeed)) },
		pt_up_right:   { name: 'Pan/Tilt: Up-Right (hold)',   options: [], callback: async () => self.send(C.ptDrive(C.PT_DIR.UP_RIGHT,   self.config.panSpeed, self.config.tiltSpeed)) },
		pt_down_left:  { name: 'Pan/Tilt: Down-Left (hold)',  options: [], callback: async () => self.send(C.ptDrive(C.PT_DIR.DOWN_LEFT,  self.config.panSpeed, self.config.tiltSpeed)) },
		pt_down_right: { name: 'Pan/Tilt: Down-Right (hold)', options: [], callback: async () => self.send(C.ptDrive(C.PT_DIR.DOWN_RIGHT, self.config.panSpeed, self.config.tiltSpeed)) },
		pt_stop: { name: 'Pan/Tilt: Stop', options: [], callback: async () => self.send(C.ptDrive(C.PT_DIR.STOP)) },

		pt_home: {
			name: 'Pan/Tilt: Home (true center 0,0)',
			options: [],
			callback: async () => {
				await self.send(C.ptAbsolute(0, 0, self.config.panSpeed || 12, self.config.tiltSpeed || 10))
				self.state.panDeg = 0
				self.state.tiltDeg = 0
				self.setVariableValues({ pan_degrees: '0.0', tilt_degrees: '0.0' })
			},
		},
		pt_reset: {
			name: 'Pan/Tilt: Reset',
			options: [],
			callback: async () => {
				await self.send(C.ptReset())
				self.state.panDeg = 0
				self.state.tiltDeg = 0
				self.setVariableValues({ pan_degrees: '0.0', tilt_degrees: '0.0' })
			},
		},
		pt_absolute: {
			name: 'Pan/Tilt: Absolute Position (raw units)',
			options: [
				{ type: 'number', id: 'pan', label: 'Pan (-32768..32767)', default: 0, min: -32768, max: 32767 },
				{ type: 'number', id: 'tilt', label: 'Tilt (-32768..32767)', default: 0, min: -32768, max: 32767 },
				{ type: 'dropdown', id: 'panSpeed', label: 'Pan Speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
				{ type: 'dropdown', id: 'tiltSpeed', label: 'Tilt Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) =>
				self.send(C.ptAbsolute(+options.pan, +options.tilt, +options.panSpeed, +options.tiltSpeed)),
		},

		/* ───────── Pan / Tilt rotary HOLD (auto-stop after rotation halts) ───────── */
		pan_rotary_left: {
			name: 'Rotary HOLD: Pan Left (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'pan', () => C.ptDrive(C.PT_DIR.LEFT, +options.speed, self.config.tiltSpeed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},
		pan_rotary_right: {
			name: 'Rotary HOLD: Pan Right (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'pan', () => C.ptDrive(C.PT_DIR.RIGHT, +options.speed, self.config.tiltSpeed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},
		tilt_rotary_up: {
			name: 'Rotary HOLD: Tilt Up (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'tilt', () => C.ptDrive(C.PT_DIR.UP, self.config.panSpeed, +options.speed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},
		tilt_rotary_down: {
			name: 'Rotary HOLD: Tilt Down (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'tilt', () => C.ptDrive(C.PT_DIR.DOWN, self.config.panSpeed, +options.speed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},

		/* ───────── Pan / Tilt rotary STEP (precise 1°/click — recommended for Stream Deck +) ───────── */
		pan_step_left: {
			name: 'Rotary STEP: Pan Left (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
			],
			callback: async ({ options }) => {
				await self.send(C.ptRelative(-Math.round(+options.deg * upd(self)), 0, +options.speed, self.config.tiltSpeed))
				self.state.panDeg = (self.state.panDeg || 0) - (+options.deg)
				self.setVariableValues({ pan_degrees: self.state.panDeg.toFixed(1) })
			},
		},
		pan_step_right: {
			name: 'Rotary STEP: Pan Right (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
			],
			callback: async ({ options }) => {
				await self.send(C.ptRelative(Math.round(+options.deg * upd(self)), 0, +options.speed, self.config.tiltSpeed))
				self.state.panDeg = (self.state.panDeg || 0) + (+options.deg)
				self.setVariableValues({ pan_degrees: self.state.panDeg.toFixed(1) })
			},
		},
		tilt_step_up: {
			name: 'Rotary STEP: Tilt Up (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) => {
				await self.send(C.ptRelative(0, Math.round(+options.deg * upd(self)), self.config.panSpeed, +options.speed))
				self.state.tiltDeg = (self.state.tiltDeg || 0) + (+options.deg)
				self.setVariableValues({ tilt_degrees: self.state.tiltDeg.toFixed(1) })
			},
		},
		tilt_step_down: {
			name: 'Rotary STEP: Tilt Down (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) => {
				await self.send(C.ptRelative(0, -Math.round(+options.deg * upd(self)), self.config.panSpeed, +options.speed))
				self.state.tiltDeg = (self.state.tiltDeg || 0) - (+options.deg)
				self.setVariableValues({ tilt_degrees: self.state.tiltDeg.toFixed(1) })
			},
		},

		/* ───────── Zoom ───────── */
		zoom_in: {
			name: 'Zoom: In (Tele)',
			options: [{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS }],
			callback: async ({ options }) => self.send(C.zoomTeleVar(+options.speed)),
		},
		zoom_out: {
			name: 'Zoom: Out (Wide)',
			options: [{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS }],
			callback: async ({ options }) => self.send(C.zoomWideVar(+options.speed)),
		},
		zoom_stop: { name: 'Zoom: Stop', options: [], callback: async () => self.send(C.zoomStop()) },
		zoom_direct: {
			name: 'Zoom: Direct Position (0-16384)',
			options: [{ type: 'number', id: 'pos', label: 'Position', default: 0, min: 0, max: 16384 }],
			callback: async ({ options }) => self.send(C.zoomDirect(+options.pos)),
		},
		zoom_rotary_in: {
			name: 'Rotary HOLD: Zoom In',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 160, min: 80, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'zoom', () => C.zoomTeleVar(+options.speed), C.zoomStop, +options.holdMs),
		},
		zoom_rotary_out: {
			name: 'Rotary HOLD: Zoom Out',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 160, min: 80, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'zoom', () => C.zoomWideVar(+options.speed), C.zoomStop, +options.holdMs),
		},

		/* ───────── Focus ───────── */
		focus_auto: { name: 'Focus: Auto On', options: [], callback: async () => self.send(C.focusAuto()) },
		focus_manual: { name: 'Focus: Manual', options: [], callback: async () => self.send(C.focusManual()) },
		focus_toggle: { name: 'Focus: Auto Toggle', options: [], callback: async () => self.send(C.focusAutoToggle()) },
		focus_one_push: { name: 'Focus: One-Push AF', options: [], callback: async () => self.send(C.focusOnePush()) },
		focus_near: {
			name: 'Focus: Near',
			options: [{ type: 'dropdown', id: 'speed', label: 'Speed', default: 4, choices: ZOOM_SPEEDS }],
			callback: async ({ options }) => self.send(C.focusNearVar(+options.speed)),
		},
		focus_far: {
			name: 'Focus: Far',
			options: [{ type: 'dropdown', id: 'speed', label: 'Speed', default: 4, choices: ZOOM_SPEEDS }],
			callback: async ({ options }) => self.send(C.focusFarVar(+options.speed)),
		},
		focus_stop: { name: 'Focus: Stop', options: [], callback: async () => self.send(C.focusStop()) },
		focus_lock_on: { name: 'Focus: Lock On', options: [], callback: async () => self.send(C.focusLockOn()) },
		focus_lock_off: { name: 'Focus: Lock Off', options: [], callback: async () => self.send(C.focusLockOff()) },
		focus_direct: {
			name: 'Focus: Direct Position',
			options: [{ type: 'number', id: 'pos', label: 'Position (0-65535)', default: 0, min: 0, max: 65535 }],
			callback: async ({ options }) => self.send(C.focusDirect(+options.pos)),
		},
		focus_rotary_near: {
			name: 'Rotary HOLD: Focus Near',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 160, min: 80, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'focus', () => C.focusNearVar(+options.speed), C.focusStop, +options.holdMs),
		},
		focus_rotary_far: {
			name: 'Rotary HOLD: Focus Far',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 160, min: 80, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'focus', () => C.focusFarVar(+options.speed), C.focusStop, +options.holdMs),
		},

		/* ───────── Presets (ONVIF on Tenveo NDI — VISCA presets silently fail) ───────── */
		preset_recall: {
			name: 'Preset: Recall (via ONVIF)',
			options: [{ type: 'number', id: 'n', label: 'Preset (1-255)', default: 1, min: 1, max: 255 }],
			callback: async ({ options }) => {
				if (!self.onvif) return self.log('warn', 'ONVIF not initialised')
				try {
					await self.onvif.gotoPreset(String(+options.n))
					self.state.lastPreset = +options.n
					self.setVariableValues({ last_preset: self.state.lastPreset })
					self.checkFeedbacks('preset_recalled')
				} catch (e) {
					self.log('error', `ONVIF GotoPreset ${options.n}: ${e.message}`)
				}
			},
		},
		preset_recall_var: {
			name: 'Preset: Recall (from variable, via ONVIF)',
			options: [{ type: 'textinput', id: 'expr', label: 'Preset (expression)', default: '1', useVariables: true }],
			callback: async ({ options }, ctx) => {
				const raw = await ctx.parseVariablesInString(options.expr)
				const n = parseInt(raw, 10)
				if (Number.isNaN(n)) return self.log('warn', `Invalid preset expression: ${raw}`)
				if (!self.onvif) return self.log('warn', 'ONVIF not initialised')
				try {
					await self.onvif.gotoPreset(String(n))
					self.state.lastPreset = n
					self.setVariableValues({ last_preset: n })
					self.checkFeedbacks('preset_recalled')
				} catch (e) {
					self.log('error', `ONVIF GotoPreset ${n}: ${e.message}`)
				}
			},
		},
		preset_save: {
			name: 'Preset: Save (via ONVIF)',
			options: [
				{ type: 'number', id: 'n', label: 'Preset (1-255)', default: 1, min: 1, max: 255 },
				{ type: 'textinput', id: 'name', label: 'Preset name (optional)', default: '' },
			],
			callback: async ({ options }) => {
				if (!self.onvif) return self.log('warn', 'ONVIF not initialised')
				try {
					await self.onvif.setPreset(String(+options.n), options.name || `Preset ${options.n}`)
				} catch (e) {
					self.log('error', `ONVIF SetPreset ${options.n}: ${e.message}`)
				}
			},
		},
		preset_clear: {
			name: 'Preset: Clear (via ONVIF)',
			options: [{ type: 'number', id: 'n', label: 'Preset (1-255)', default: 1, min: 1, max: 255 }],
			callback: async ({ options }) => {
				if (!self.onvif) return self.log('warn', 'ONVIF not initialised')
				try {
					await self.onvif.removePreset(String(+options.n))
				} catch (e) {
					self.log('error', `ONVIF RemovePreset ${options.n}: ${e.message}`)
				}
			},
		},

		/* ───────── Power / OSD / IR ───────── */
		power_on: { name: 'Power: On', options: [], callback: async () => self.send(C.powerOn()) },
		power_off: { name: 'Power: Off (Standby)', options: [], callback: async () => self.send(C.powerOff()) },
		power_toggle: {
			name: 'Power: Toggle',
			options: [],
			callback: async () => self.send(self.state.power === 'on' ? C.powerOff() : C.powerOn()),
		},
		menu_on: { name: 'OSD: Open Menu', options: [], callback: async () => self.send(C.menuOn()) },
		menu_off: { name: 'OSD: Close Menu', options: [], callback: async () => self.send(C.menuOff()) },
		menu_toggle: { name: 'OSD: Toggle Menu', options: [], callback: async () => self.send(C.menuToggle()) },
		menu_up: { name: 'OSD: Navigate Up', options: [], callback: async () => self.send(C.menuNavUp()) },
		menu_down: { name: 'OSD: Navigate Down', options: [], callback: async () => self.send(C.menuNavDown()) },
		menu_left: { name: 'OSD: Navigate Left', options: [], callback: async () => self.send(C.menuNavLeft()) },
		menu_right: { name: 'OSD: Navigate Right', options: [], callback: async () => self.send(C.menuNavRight()) },
		menu_enter: { name: 'OSD: Enter', options: [], callback: async () => self.send(C.menuEnter()) },
		menu_back: { name: 'OSD: Back', options: [], callback: async () => self.send(C.menuBack()) },
		ir_on: { name: 'IR Remote: Enable', options: [], callback: async () => self.send(C.irOn()) },
		ir_off: { name: 'IR Remote: Disable', options: [], callback: async () => self.send(C.irOff()) },

		/* ───────── Exposure ───────── */
		exposure_mode: {
			name: 'Exposure: Mode',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					default: C.AE_MODE.FULL_AUTO,
					choices: [
						{ id: C.AE_MODE.FULL_AUTO, label: 'Full Auto' },
						{ id: C.AE_MODE.MANUAL, label: 'Manual' },
						{ id: C.AE_MODE.SHUTTER_PRI, label: 'Shutter Priority' },
						{ id: C.AE_MODE.IRIS_PRI, label: 'Iris Priority' },
						{ id: C.AE_MODE.BRIGHT, label: 'Bright' },
					],
				},
			],
			callback: async ({ options }) => self.send(C.aeMode(+options.mode)),
		},
		iris_up: { name: 'Iris: Up', options: [], callback: async () => self.send(C.irisUp()) },
		iris_down: { name: 'Iris: Down', options: [], callback: async () => self.send(C.irisDown()) },
		iris_reset: { name: 'Iris: Reset', options: [], callback: async () => self.send(C.irisReset()) },
		iris_direct: {
			name: 'Iris: Direct Value (0-13)',
			options: [{ type: 'number', id: 'v', label: 'Value', default: 7, min: 0, max: 13 }],
			callback: async ({ options }) => self.send(C.irisDirect(+options.v)),
		},
		iris_rotary_up:   { name: 'Rotary STEP: Iris Up',   options: [], callback: async () => self.send(C.irisUp()) },
		iris_rotary_down: { name: 'Rotary STEP: Iris Down', options: [], callback: async () => self.send(C.irisDown()) },

		shutter_up: { name: 'Shutter: Up', options: [], callback: async () => self.send(C.shutterUp()) },
		shutter_down: { name: 'Shutter: Down', options: [], callback: async () => self.send(C.shutterDown()) },
		shutter_reset: { name: 'Shutter: Reset', options: [], callback: async () => self.send(C.shutterReset()) },
		shutter_direct: {
			name: 'Shutter: Direct Value (0-21)',
			options: [{ type: 'number', id: 'v', label: 'Value', default: 11, min: 0, max: 21 }],
			callback: async ({ options }) => self.send(C.shutterDirect(+options.v)),
		},
		shutter_rotary_up:   { name: 'Rotary STEP: Shutter Up',   options: [], callback: async () => self.send(C.shutterUp()) },
		shutter_rotary_down: { name: 'Rotary STEP: Shutter Down', options: [], callback: async () => self.send(C.shutterDown()) },

		gain_up: { name: 'Gain: Up', options: [], callback: async () => self.send(C.gainUp()) },
		gain_down: { name: 'Gain: Down', options: [], callback: async () => self.send(C.gainDown()) },
		gain_reset: { name: 'Gain: Reset', options: [], callback: async () => self.send(C.gainReset()) },
		gain_direct: {
			name: 'Gain: Direct Value (0-14)',
			options: [{ type: 'number', id: 'v', label: 'Value', default: 4, min: 0, max: 14 }],
			callback: async ({ options }) => self.send(C.gainDirect(+options.v)),
		},
		gain_limit: {
			name: 'Gain: Set Gain Limit',
			options: [{ type: 'number', id: 'v', label: 'Limit (4-15)', default: 9, min: 4, max: 15 }],
			callback: async ({ options }) => self.send(C.gainLimit(+options.v)),
		},
		gain_rotary_up:   { name: 'Rotary STEP: Gain Up',   options: [], callback: async () => self.send(C.gainUp()) },
		gain_rotary_down: { name: 'Rotary STEP: Gain Down', options: [], callback: async () => self.send(C.gainDown()) },

		bright_up: { name: 'Bright: Up', options: [], callback: async () => self.send(C.brightUp()) },
		bright_down: { name: 'Bright: Down', options: [], callback: async () => self.send(C.brightDown()) },
		bright_direct: {
			name: 'Bright: Direct Value (0-27)',
			options: [{ type: 'number', id: 'v', label: 'Value', default: 13, min: 0, max: 27 }],
			callback: async ({ options }) => self.send(C.brightDirect(+options.v)),
		},
		expcomp_on: { name: 'ExpComp: On', options: [], callback: async () => self.send(C.expCompOn()) },
		expcomp_off: { name: 'ExpComp: Off', options: [], callback: async () => self.send(C.expCompOff()) },
		expcomp_up: { name: 'ExpComp: Up', options: [], callback: async () => self.send(C.expCompUp()) },
		expcomp_down: { name: 'ExpComp: Down', options: [], callback: async () => self.send(C.expCompDown()) },
		expcomp_reset: { name: 'ExpComp: Reset', options: [], callback: async () => self.send(C.expCompReset()) },
		blc_on: { name: 'BLC: On', options: [], callback: async () => self.send(C.blcOn()) },
		blc_off: { name: 'BLC: Off', options: [], callback: async () => self.send(C.blcOff()) },

		/* ───────── White Balance ───────── */
		wb_mode: {
			name: 'White Balance: Mode',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					default: C.WB_MODE.AUTO,
					choices: [
						{ id: C.WB_MODE.AUTO, label: 'Auto' },
						{ id: C.WB_MODE.INDOOR, label: 'Indoor (3200K)' },
						{ id: C.WB_MODE.OUTDOOR, label: 'Outdoor (5800K)' },
						{ id: C.WB_MODE.ONE_PUSH, label: 'One-Push' },
						{ id: C.WB_MODE.ATW, label: 'ATW' },
						{ id: C.WB_MODE.MANUAL, label: 'Manual' },
						{ id: C.WB_MODE.SODIUM, label: 'Sodium' },
						{ id: C.WB_MODE.COLOR_TEMP, label: 'Color Temperature' },
					],
				},
			],
			callback: async ({ options }) => self.send(C.wbMode(+options.mode)),
		},
		wb_one_push: { name: 'WB: One-Push Trigger', options: [], callback: async () => self.send(C.wbOnePushTrigger()) },
		rgain_up: { name: 'WB: R-Gain Up', options: [], callback: async () => self.send(C.rGainUp()) },
		rgain_down: { name: 'WB: R-Gain Down', options: [], callback: async () => self.send(C.rGainDown()) },
		rgain_reset: { name: 'WB: R-Gain Reset', options: [], callback: async () => self.send(C.rGainReset()) },
		rgain_direct: {
			name: 'WB: R-Gain Direct',
			options: [{ type: 'number', id: 'v', label: 'Value (0-255)', default: 128, min: 0, max: 255 }],
			callback: async ({ options }) => self.send(C.rGainDirect(+options.v)),
		},
		bgain_up: { name: 'WB: B-Gain Up', options: [], callback: async () => self.send(C.bGainUp()) },
		bgain_down: { name: 'WB: B-Gain Down', options: [], callback: async () => self.send(C.bGainDown()) },
		bgain_reset: { name: 'WB: B-Gain Reset', options: [], callback: async () => self.send(C.bGainReset()) },
		bgain_direct: {
			name: 'WB: B-Gain Direct',
			options: [{ type: 'number', id: 'v', label: 'Value (0-255)', default: 128, min: 0, max: 255 }],
			callback: async ({ options }) => self.send(C.bGainDirect(+options.v)),
		},
		color_temp_direct: {
			name: 'WB: Color Temperature (K) — set absolute',
			options: [{ type: 'number', id: 'k', label: 'Kelvin (2500-8000)', default: 5600, min: 2500, max: 8000, step: 100 }],
			callback: async ({ options }) => {
				await self.send(C.colorTempDirect(+options.k))
				self.state.colorTemp = +options.k
				self.setVariableValues({ color_temp: self.state.colorTemp })
			},
		},
		color_temp_rotary_up: {
			name: 'Rotary STEP: Color Temp Up (K per click)',
			options: [{ type: 'number', id: 'step', label: 'Kelvin per click', default: 100, min: 100, max: 1000, step: 100 }],
			callback: async ({ options }) => {
				const cur = self.state.colorTemp || 5600
				const next = Math.min(8000, cur + +options.step)
				await self.send(C.colorTempDirect(next))
				self.state.colorTemp = next
				self.setVariableValues({ color_temp: next })
			},
		},
		color_temp_rotary_down: {
			name: 'Rotary STEP: Color Temp Down (K per click)',
			options: [{ type: 'number', id: 'step', label: 'Kelvin per click', default: 100, min: 100, max: 1000, step: 100 }],
			callback: async ({ options }) => {
				const cur = self.state.colorTemp || 5600
				const next = Math.max(2500, cur - +options.step)
				await self.send(C.colorTempDirect(next))
				self.state.colorTemp = next
				self.setVariableValues({ color_temp: next })
			},
		},

		/* ───────── Raw VISCA ───────── */
		raw_visca: {
			name: 'Custom: Send Raw VISCA hex',
			options: [
				{
					type: 'textinput',
					id: 'hex',
					label: 'Hex bytes (e.g. "81 01 04 00 02 FF")',
					default: '81 01 04 00 02 FF',
					useVariables: true,
				},
			],
			callback: async ({ options }, ctx) => {
				const raw = await ctx.parseVariablesInString(options.hex)
				const bytes = raw
					.split(/[\s,]+/)
					.filter(Boolean)
					.map((b) => parseInt(b, 16))
					.filter((b) => !Number.isNaN(b))
				if (bytes.length < 2 || bytes[bytes.length - 1] !== 0xff) {
					self.log('warn', `Raw VISCA must end with 0xFF: got ${raw}`)
					return
				}
				return self.send(bytes)
			},
		},
	}
}
