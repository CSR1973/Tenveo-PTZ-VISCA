import * as C from './commands.js'

const speedChoices = (min, max) =>
	Array.from({ length: max - min + 1 }, (_, i) => ({ id: min + i, label: String(min + i) }))

const PAN_SPEEDS = speedChoices(1, 24)
const TILT_SPEEDS = speedChoices(1, 20)
const ZOOM_SPEEDS = speedChoices(0, 7)

/** Smarter auto-stop pulse. Only sends the drive command when direction changes;
 *  each subsequent fire in the same direction just extends the auto-stop timer. */
function pulse(self, key, dirLabel, cmdFn, stopCmdFn, holdMs) {
	if (!self._pulseState) self._pulseState = {}
	const st = self._pulseState[key] || {}
	if (self._pulseTimers[key]) clearTimeout(self._pulseTimers[key])
	if (st.dir !== dirLabel) {
		self.send(cmdFn())
		st.dir = dirLabel
		st.lastSent = Date.now()
		self._pulseState[key] = st
	}
	self._pulseTimers[key] = setTimeout(() => {
		self.send(stopCmdFn())
		delete self._pulseTimers[key]
		st.dir = null
		self._pulseState[key] = st
	}, holdMs)
}

/** Read calibrated units-per-degree from config (default 14). */
const upd = (self) => Math.max(1, +self.config.unitsPerDegree || 14)
/** Read ms-per-degree for NDI variant drive-pulse (default 80). */
const mpd = (self) => Math.max(10, +self.config.msPerDegree || 80)
/** Is this connection configured as an NDI-quirks camera? */
const isNdi = (self) => (self.config.variant || 'standard') === 'ndi'

/** Drive-pulse step for cameras that don't accept ptAbsolute properly.
 *  Coalesces rapid clicks so the counter stays in sync with actual physical
 *  motion instead of racing ahead of the camera's mechanical speed. */
async function driveStepPan(self, deg, speed) {
	if (self._panPending === undefined) self._panPending = 0
	// Cap pending at ±15° so runaway clicks don't queue seconds of motion
	self._panPending = Math.max(-15, Math.min(15, self._panPending + deg))
	if (self._panRunning) return
	self._panRunning = true
	while (Math.abs(self._panPending) > 0.05) {
		// Drive up to 3° per iteration
		const chunk = Math.max(-3, Math.min(3, self._panPending))
		const absDeg = Math.abs(chunk)
		const dir = chunk > 0 ? C.PT_DIR.RIGHT : C.PT_DIR.LEFT
		const ms = Math.max(30, Math.round(absDeg * mpd(self)))
		await self.send(C.ptDrive(dir, speed, speed))
		await new Promise((r) => setTimeout(r, ms))
		await self.send(C.ptDrive(C.PT_DIR.STOP))
		self.state.panDeg = (self.state.panDeg || 0) + chunk
		self._panPending -= chunk
		self.setVariableValues({ pan_degrees: self.state.panDeg.toFixed(1) })
	}
	self._panRunning = false
}

async function driveStepTilt(self, deg, speed) {
	if (self._tiltPending === undefined) self._tiltPending = 0
	self._tiltPending = Math.max(-15, Math.min(15, self._tiltPending + deg))
	if (self._tiltRunning) return
	self._tiltRunning = true
	while (Math.abs(self._tiltPending) > 0.05) {
		const chunk = Math.max(-3, Math.min(3, self._tiltPending))
		const absDeg = Math.abs(chunk)
		const dir = chunk > 0 ? C.PT_DIR.UP : C.PT_DIR.DOWN
		const ms = Math.max(30, Math.round(absDeg * mpd(self)))
		await self.send(C.ptDrive(dir, speed, speed))
		await new Promise((r) => setTimeout(r, ms))
		await self.send(C.ptDrive(C.PT_DIR.STOP))
		self.state.tiltDeg = (self.state.tiltDeg || 0) + chunk
		self._tiltPending -= chunk
		self.setVariableValues({ tilt_degrees: self.state.tiltDeg.toFixed(1) })
	}
	self._tiltRunning = false
}

/** Kept for backward compatibility with any code that still calls it. */
async function driveStep(self, dir, deg, speed) {
	const ms = Math.max(30, Math.round(Math.abs(deg) * mpd(self)))
	await self.send(C.ptDrive(dir, speed, speed))
	await new Promise((r) => setTimeout(r, ms))
	await self.send(C.ptDrive(C.PT_DIR.STOP))
}

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
			name: 'Pan/Tilt: Home (true center + wide zoom)',
			options: [],
			callback: async () => {
				if (isNdi(self)) {
					// VHD20HAN: raw VISCA Home works, ptAbsolute goes to extremes
					await self.send(C.ptHome())
				} else {
					await self.send(C.ptAbsolute(0, 0, self.config.panSpeed || 12, self.config.tiltSpeed || 10))
				}
				await self.send(C.zoomDirect(0))
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
				pulse(self, 'pt', 'L', () => C.ptDrive(C.PT_DIR.LEFT, +options.speed, self.config.tiltSpeed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},
		pan_rotary_right: {
			name: 'Rotary HOLD: Pan Right (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'pt', 'R', () => C.ptDrive(C.PT_DIR.RIGHT, +options.speed, self.config.tiltSpeed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},
		tilt_rotary_up: {
			name: 'Rotary HOLD: Tilt Up (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'pt', 'U', () => C.ptDrive(C.PT_DIR.UP, self.config.panSpeed, +options.speed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},
		tilt_rotary_down: {
			name: 'Rotary HOLD: Tilt Down (Stream Deck +)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 180, min: 80, max: 2000 },
			],
			callback: async ({ options }) =>
				pulse(self, 'pt', 'D', () => C.ptDrive(C.PT_DIR.DOWN, self.config.panSpeed, +options.speed), () => C.ptDrive(C.PT_DIR.STOP), +options.holdMs),
		},

		/* ───────── Pan / Tilt rotary STEP (variant-aware) ───────── */
		pan_step_left: {
			name: 'Rotary STEP: Pan Left (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
			],
			callback: async ({ options }) => {
				if (isNdi(self)) {
					driveStepPan(self, -(+options.deg), +options.speed)
				} else {
					self.state.panDeg = (self.state.panDeg || 0) - +options.deg
					const panU = Math.round(self.state.panDeg * upd(self))
					const tiltU = Math.round((self.state.tiltDeg || 0) * upd(self))
					await self.send(C.ptAbsolute(panU, tiltU, +options.speed, self.config.tiltSpeed))
					self.setVariableValues({ pan_degrees: self.state.panDeg.toFixed(1) })
				}
			},
		},
		pan_step_right: {
			name: 'Rotary STEP: Pan Right (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.panSpeed || 12, choices: PAN_SPEEDS },
			],
			callback: async ({ options }) => {
				if (isNdi(self)) {
					driveStepPan(self, +options.deg, +options.speed)
				} else {
					self.state.panDeg = (self.state.panDeg || 0) + +options.deg
					const panU = Math.round(self.state.panDeg * upd(self))
					const tiltU = Math.round((self.state.tiltDeg || 0) * upd(self))
					await self.send(C.ptAbsolute(panU, tiltU, +options.speed, self.config.tiltSpeed))
					self.setVariableValues({ pan_degrees: self.state.panDeg.toFixed(1) })
				}
			},
		},
		tilt_step_up: {
			name: 'Rotary STEP: Tilt Up (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) => {
				if (isNdi(self)) {
					driveStepTilt(self, +options.deg, +options.speed)
				} else {
					self.state.tiltDeg = (self.state.tiltDeg || 0) + +options.deg
					const panU = Math.round((self.state.panDeg || 0) * upd(self))
					const tiltU = Math.round(self.state.tiltDeg * upd(self))
					await self.send(C.ptAbsolute(panU, tiltU, self.config.panSpeed, +options.speed))
					self.setVariableValues({ tilt_degrees: self.state.tiltDeg.toFixed(1) })
				}
			},
		},
		tilt_step_down: {
			name: 'Rotary STEP: Tilt Down (° per click)',
			options: [
				{ type: 'number', id: 'deg', label: 'Degrees per click', default: 1, min: 0.1, max: 30, step: 0.1 },
				{ type: 'dropdown', id: 'speed', label: 'Move speed', default: self.config.tiltSpeed || 10, choices: TILT_SPEEDS },
			],
			callback: async ({ options }) => {
				if (isNdi(self)) {
					driveStepTilt(self, -(+options.deg), +options.speed)
				} else {
					self.state.tiltDeg = (self.state.tiltDeg || 0) - +options.deg
					const panU = Math.round((self.state.panDeg || 0) * upd(self))
					const tiltU = Math.round(self.state.tiltDeg * upd(self))
					await self.send(C.ptAbsolute(panU, tiltU, self.config.panSpeed, +options.speed))
					self.setVariableValues({ tilt_degrees: self.state.tiltDeg.toFixed(1) })
				}
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
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 100, min: 50, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'zoom', 'IN', () => C.zoomTeleVar(+options.speed), C.zoomStop, +options.holdMs),
		},
		zoom_rotary_out: {
			name: 'Rotary HOLD: Zoom Out',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 100, min: 50, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'zoom', 'OUT', () => C.zoomWideVar(+options.speed), C.zoomStop, +options.holdMs),
		},
		zoom_step_in: {
			name: 'Rotary STEP: Zoom In (per click, no HOLD — best for NDI)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'ms', label: 'Duration per click (ms)', default: 80, min: 20, max: 500 },
			],
			callback: async ({ options }) => {
				if (self._zoomBusy) return
				self._zoomBusy = true
				await self.send(C.zoomTeleVar(+options.speed))
				await new Promise((r) => setTimeout(r, +options.ms))
				await self.send(C.zoomStop())
				self._zoomBusy = false
			},
		},
		zoom_step_out: {
			name: 'Rotary STEP: Zoom Out (per click, no HOLD — best for NDI)',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: self.config.zoomSpeed || 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'ms', label: 'Duration per click (ms)', default: 80, min: 20, max: 500 },
			],
			callback: async ({ options }) => {
				if (self._zoomBusy) return
				self._zoomBusy = true
				await self.send(C.zoomWideVar(+options.speed))
				await new Promise((r) => setTimeout(r, +options.ms))
				await self.send(C.zoomStop())
				self._zoomBusy = false
			},
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
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 120, min: 50, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'focus', 'N', () => C.focusNearVar(+options.speed), C.focusStop, +options.holdMs),
		},
		focus_rotary_far: {
			name: 'Rotary HOLD: Focus Far',
			options: [
				{ type: 'dropdown', id: 'speed', label: 'Speed', default: 4, choices: ZOOM_SPEEDS },
				{ type: 'number', id: 'holdMs', label: 'Hold (ms)', default: 120, min: 50, max: 2000 },
			],
			callback: async ({ options }) => pulse(self, 'focus', 'F', () => C.focusFarVar(+options.speed), C.focusStop, +options.holdMs),
		},

		/* ───────── Presets (variant-aware) ───────── */
		preset_recall: {
			name: 'Preset: Recall',
			options: [{ type: 'number', id: 'n', label: 'Preset (1-255)', default: 1, min: 1, max: 255 }],
			callback: async ({ options }) => {
				const n = +options.n
				if (isNdi(self)) {
					await self.send(C.presetRecall(n))
				} else if (self.onvif) {
					try { await self.onvif.gotoPreset(String(n)) } catch (e) { self.log('error', `ONVIF GotoPreset ${n}: ${e.message}`) }
				} else {
					await self.send(C.presetRecall(n))
				}
				self.state.lastPreset = n
				self.setVariableValues({ last_preset: n })
				self.checkFeedbacks('preset_recalled')
			},
		},
		preset_recall_var: {
			name: 'Preset: Recall (from variable)',
			options: [{ type: 'textinput', id: 'expr', label: 'Preset (expression)', default: '1', useVariables: true }],
			callback: async ({ options }, ctx) => {
				const raw = await ctx.parseVariablesInString(options.expr)
				const n = parseInt(raw, 10)
				if (Number.isNaN(n)) return self.log('warn', `Invalid preset expression: ${raw}`)
				if (isNdi(self)) {
					await self.send(C.presetRecall(n))
				} else if (self.onvif) {
					try { await self.onvif.gotoPreset(String(n)) } catch (e) { self.log('error', `ONVIF GotoPreset ${n}: ${e.message}`) }
				} else {
					await self.send(C.presetRecall(n))
				}
				self.state.lastPreset = n
				self.setVariableValues({ last_preset: n })
				self.checkFeedbacks('preset_recalled')
			},
		},
		preset_save: {
			name: 'Preset: Save',
			options: [
				{ type: 'number', id: 'n', label: 'Preset (1-255)', default: 1, min: 1, max: 255 },
				{ type: 'textinput', id: 'name', label: 'Preset name (ONVIF only)', default: '' },
			],
			callback: async ({ options }) => {
				const n = +options.n
				if (isNdi(self)) {
					await self.send(C.presetSet(n))
				} else if (self.onvif) {
					try { await self.onvif.setPreset(String(n), options.name || `Preset ${n}`) } catch (e) { self.log('error', `ONVIF SetPreset ${n}: ${e.message}`) }
				} else {
					await self.send(C.presetSet(n))
				}
			},
		},
		preset_clear: {
			name: 'Preset: Clear',
			options: [{ type: 'number', id: 'n', label: 'Preset (1-255)', default: 1, min: 1, max: 255 }],
			callback: async ({ options }) => {
				const n = +options.n
				if (isNdi(self)) {
					await self.send(C.presetReset(n))
				} else if (self.onvif) {
					try { await self.onvif.removePreset(String(n)) } catch (e) { self.log('error', `ONVIF RemovePreset ${n}: ${e.message}`) }
				} else {
					await self.send(C.presetReset(n))
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

		gain_up: { name: 'Gain: Up (routes to ExpComp on NDI variant)', options: [], callback: async () => self.send(isNdi(self) ? C.expCompUp() : C.gainUp()) },
		gain_down: { name: 'Gain: Down (routes to ExpComp on NDI variant)', options: [], callback: async () => self.send(isNdi(self) ? C.expCompDown() : C.gainDown()) },
		gain_reset: { name: 'Gain: Reset (routes to ExpComp on NDI variant)', options: [], callback: async () => self.send(isNdi(self) ? C.expCompReset() : C.gainReset()) },
		gain_direct: {
			name: 'Gain: Direct Value (0-14) — Standard variant only',
			options: [{ type: 'number', id: 'v', label: 'Value', default: 4, min: 0, max: 14 }],
			callback: async ({ options }) => self.send(C.gainDirect(+options.v)),
		},
		gain_limit: {
			name: 'Gain: Set Gain Limit — Standard variant only',
			options: [{ type: 'number', id: 'v', label: 'Limit (4-15)', default: 9, min: 4, max: 15 }],
			callback: async ({ options }) => self.send(C.gainLimit(+options.v)),
		},
		gain_rotary_up:   { name: 'Rotary STEP: Gain Up (auto-routes to ExpComp on NDI)',   options: [], callback: async () => self.send(isNdi(self) ? C.expCompUp() : C.gainUp()) },
		gain_rotary_down: { name: 'Rotary STEP: Gain Down (auto-routes to ExpComp on NDI)', options: [], callback: async () => self.send(isNdi(self) ? C.expCompDown() : C.gainDown()) },

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
		expcomp_rotary_up:   { name: 'Rotary STEP: ExpComp Up',   options: [], callback: async () => self.send(C.expCompUp()) },
		expcomp_rotary_down: { name: 'Rotary STEP: ExpComp Down', options: [], callback: async () => self.send(C.expCompDown()) },
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
			name: 'WB: Color Temperature (K) — Standard variant only',
			options: [{ type: 'number', id: 'k', label: 'Kelvin (2500-8000)', default: 5600, min: 2500, max: 8000, step: 100 }],
			callback: async ({ options }) => {
				await self.send(C.colorTempDirect(+options.k))
				self.state.colorTemp = +options.k
				self.setVariableValues({ color_temp: self.state.colorTemp })
			},
		},
		color_temp_rotary_up: {
			name: 'Rotary STEP: Color Temp Up (Standard variant only)',
			options: [{ type: 'number', id: 'step', label: 'Kelvin per click', default: 100, min: 100, max: 1000, step: 100 }],
			callback: async ({ options }) => {
				if (self.state.wbMode !== C.WB_MODE.COLOR_TEMP) {
					await self.send(C.wbMode(C.WB_MODE.COLOR_TEMP))
					self.state.wbMode = C.WB_MODE.COLOR_TEMP
				}
				const cur = self.state.colorTemp || 5600
				const next = Math.min(8000, cur + +options.step)
				await self.send(C.colorTempDirect(next))
				self.state.colorTemp = next
				self.setVariableValues({ color_temp: next })
			},
		},
		color_temp_rotary_down: {
			name: 'Rotary STEP: Color Temp Down (Standard variant only)',
			options: [{ type: 'number', id: 'step', label: 'Kelvin per click', default: 100, min: 100, max: 1000, step: 100 }],
			callback: async ({ options }) => {
				if (self.state.wbMode !== C.WB_MODE.COLOR_TEMP) {
					await self.send(C.wbMode(C.WB_MODE.COLOR_TEMP))
					self.state.wbMode = C.WB_MODE.COLOR_TEMP
				}
				const cur = self.state.colorTemp || 5600
				const next = Math.max(2500, cur - +options.step)
				await self.send(C.colorTempDirect(next))
				self.state.colorTemp = next
				self.setVariableValues({ color_temp: next })
			},
		},

		/* ───────── Warmth (R-Gain/B-Gain) — works on both variants ───────── */
		warmth_rotary_up: {
			name: 'Rotary STEP: Warmth Up (warmer per click)',
			options: [{ type: 'number', id: 'step', label: 'Step size (1-16)', default: 4, min: 1, max: 16 }],
			callback: async ({ options }) => {
				if (self.state.wbMode !== C.WB_MODE.MANUAL) {
					await self.send(C.wbMode(C.WB_MODE.MANUAL))
					self.state.wbMode = C.WB_MODE.MANUAL
				}
				const w = Math.min(64, (self.state.warmth || 0) + +options.step)
				self.state.warmth = w
				await self.send(C.rGainDirect(128 + w))
				await self.send(C.bGainDirect(128 - w))
				self.setVariableValues({ warmth: w })
			},
		},
		warmth_rotary_down: {
			name: 'Rotary STEP: Warmth Down (cooler per click)',
			options: [{ type: 'number', id: 'step', label: 'Step size (1-16)', default: 4, min: 1, max: 16 }],
			callback: async ({ options }) => {
				if (self.state.wbMode !== C.WB_MODE.MANUAL) {
					await self.send(C.wbMode(C.WB_MODE.MANUAL))
					self.state.wbMode = C.WB_MODE.MANUAL
				}
				const w = Math.max(-64, (self.state.warmth || 0) - +options.step)
				self.state.warmth = w
				await self.send(C.rGainDirect(128 + w))
				await self.send(C.bGainDirect(128 - w))
				self.setVariableValues({ warmth: w })
			},
		},
		warmth_reset: {
			name: 'Warmth: Reset to neutral',
			options: [],
			callback: async () => {
				if (self.state.wbMode !== C.WB_MODE.MANUAL) {
					await self.send(C.wbMode(C.WB_MODE.MANUAL))
					self.state.wbMode = C.WB_MODE.MANUAL
				}
				self.state.warmth = 0
				await self.send(C.rGainDirect(128))
				await self.send(C.bGainDirect(128))
				self.setVariableValues({ warmth: 0 })
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
