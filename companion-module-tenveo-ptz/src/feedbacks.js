import { combineRgb } from '@companion-module/base'
import * as C from './commands.js'

const RED = combineRgb(220, 40, 40)
const GREEN = combineRgb(40, 180, 80)
const AMBER = combineRgb(240, 170, 30)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

export function getFeedbacks(self) {
	return {
		preset_recalled: {
			type: 'boolean',
			name: 'Preset Recalled',
			description: 'Highlight when this preset was the last one recalled',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [{ type: 'number', id: 'n', label: 'Preset Number', default: 1, min: 0, max: 255 }],
			callback: ({ options }) => self.state.lastPreset === +options.n,
		},
		power_state: {
			type: 'boolean',
			name: 'Power State',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [{ type: 'dropdown', id: 'state', label: 'When power is', default: 'on', choices: [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }] }],
			callback: ({ options }) => self.state.power === options.state,
		},
		af_state: {
			type: 'boolean',
			name: 'Auto Focus State',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [{ type: 'dropdown', id: 'state', label: 'When AF is', default: 'on', choices: [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }] }],
			callback: ({ options }) => self.state.af === options.state,
		},
		backlight_state: {
			type: 'boolean',
			name: 'Backlight State',
			description: 'Highlights when Backlight Compensation (BLC) is On or Off',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [{ type: 'dropdown', id: 'state', label: 'When Backlight is', default: 'on', choices: [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }] }],
			callback: ({ options }) => self.state.blc === options.state,
		},
		expcomp_mode_state: {
			type: 'boolean',
			name: 'Exposure Compensation Mode',
			description: 'Highlights when ExpComp is Manual (on) or Auto (off)',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [{ type: 'dropdown', id: 'state', label: 'When ExpComp is', default: 'on', choices: [{ id: 'on', label: 'Manual (On)' }, { id: 'off', label: 'Auto (Off)' }] }],
			callback: ({ options }) => self.state.expCompMode === options.state,
		},
		exposure_mode: {
			type: 'boolean',
			name: 'Exposure Mode',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
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
			callback: ({ options }) => self.state.aeMode === +options.mode,
		},
		wb_mode: {
			type: 'boolean',
			name: 'White Balance Mode',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					default: C.WB_MODE.AUTO,
					choices: [
						{ id: C.WB_MODE.AUTO, label: 'Auto' },
						{ id: C.WB_MODE.INDOOR, label: 'Indoor' },
						{ id: C.WB_MODE.OUTDOOR, label: 'Outdoor' },
						{ id: C.WB_MODE.ONE_PUSH, label: 'One-Push' },
						{ id: C.WB_MODE.ATW, label: 'ATW' },
						{ id: C.WB_MODE.MANUAL, label: 'Manual' },
						{ id: C.WB_MODE.COLOR_TEMP, label: 'Color Temperature' },
					],
				},
			],
			callback: ({ options }) => self.state.wbMode === +options.mode,
		},
		connected: {
			type: 'boolean',
			name: 'Connection State',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [{ type: 'dropdown', id: 'state', label: 'When', default: 'disconnected', choices: [{ id: 'connected', label: 'Connected' }, { id: 'disconnected', label: 'Disconnected' }] }],
			callback: ({ options }) =>
				options.state === 'connected' ? self.state.connected : !self.state.connected,
		},
	}
}
