export function getVariables() {
	return [
		{ variableId: 'camera_name', name: 'Camera friendly name' },
		{ variableId: 'host', name: 'Camera IP address' },
		{ variableId: 'connected', name: 'Connected (true/false)' },
		{ variableId: 'last_preset', name: 'Last recalled preset' },
		{ variableId: 'power', name: 'Power state (on/off)' },
		{ variableId: 'af', name: 'Auto-focus state (on/off)' },
		{ variableId: 'exposure_mode', name: 'Exposure mode name' },
		{ variableId: 'wb_mode', name: 'White-balance mode name' },
		{ variableId: 'gain', name: 'Gain value' },
		{ variableId: 'iris', name: 'Iris value' },
		{ variableId: 'shutter', name: 'Shutter value' },
		{ variableId: 'zoom_position', name: 'Zoom position (0-16384)' },
		{ variableId: 'focus_position', name: 'Focus position (0-65535)' },
		{ variableId: 'pan_position', name: 'Pan position' },
		{ variableId: 'tilt_position', name: 'Tilt position' },
	]
}
