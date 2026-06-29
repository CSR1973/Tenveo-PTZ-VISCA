#!/usr/bin/env node
/**
 * Tenveo VISCA CLI tester.
 *
 *   node test/cli.js <host> <command> [args...]
 *
 * Examples:
 *   node test/cli.js 192.168.88.11 power-on
 *   node test/cli.js 192.168.88.12 recall 3
 *   node test/cli.js 192.168.88.13 pan-left 12
 *   node test/cli.js 192.168.88.14 zoom-in 4 800     # zoom in at speed 4 for 800ms then stop
 *   node test/cli.js 192.168.88.11 raw "81 01 04 38 02 FF"
 */
import { ViscaIP } from '../src/visca.js'
import * as C from '../src/commands.js'

const [, , host, cmd, ...args] = process.argv

function usage() {
	console.error('Usage: node test/cli.js <host> <command> [args]')
	console.error('Commands: power-on, power-off, home, recall <n>, save <n>, clear <n>,')
	console.error('          pan-left [speed] [ms], pan-right [..], tilt-up [..], tilt-down [..],')
	console.error('          zoom-in [speed] [ms], zoom-out [..], focus-near [..], focus-far [..],')
	console.error('          af-on, af-off, af-toggle, one-push-af,')
	console.error('          gain <0-14>, gain-up, gain-down,')
	console.error('          iris <0-13>, iris-up, iris-down,')
	console.error('          shutter <0-21>, shutter-up, shutter-down,')
	console.error('          menu-on, menu-off, menu-toggle, wb-auto, wb-indoor, wb-outdoor,')
	console.error('          color-temp <K>, raw "<hex bytes>"')
	process.exit(1)
}

if (!host || !cmd) usage()

const v = new ViscaIP({ host, verbose: true })
v.open()

const motion = async (cmdFn, stopFn, defaultSpeed, defaultMs) => {
	const speed = parseInt(args[0] ?? defaultSpeed, 10)
	const ms = parseInt(args[1] ?? defaultMs, 10)
	await v.command(cmdFn(speed))
	await new Promise((r) => setTimeout(r, ms))
	await v.command(stopFn())
}

const num = (i, d) => parseInt(args[i] ?? d, 10)

const run = async () => {
	switch (cmd) {
		case 'power-on': await v.command(C.powerOn()); break
		case 'power-off': await v.command(C.powerOff()); break
		case 'home': await v.command(C.ptHome()); break
		case 'recall': await v.command(C.presetRecall(num(0, 1))); break
		case 'save': await v.command(C.presetSet(num(0, 1))); break
		case 'clear': await v.command(C.presetReset(num(0, 1))); break

		case 'pan-left': await motion((s) => C.ptDrive(C.PT_DIR.LEFT, s, 10), () => C.ptDrive(C.PT_DIR.STOP), 12, 600); break
		case 'pan-right': await motion((s) => C.ptDrive(C.PT_DIR.RIGHT, s, 10), () => C.ptDrive(C.PT_DIR.STOP), 12, 600); break
		case 'tilt-up': await motion((s) => C.ptDrive(C.PT_DIR.UP, 12, s), () => C.ptDrive(C.PT_DIR.STOP), 10, 600); break
		case 'tilt-down': await motion((s) => C.ptDrive(C.PT_DIR.DOWN, 12, s), () => C.ptDrive(C.PT_DIR.STOP), 10, 600); break

		case 'zoom-in': await motion(C.zoomTeleVar, C.zoomStop, 4, 800); break
		case 'zoom-out': await motion(C.zoomWideVar, C.zoomStop, 4, 800); break
		case 'focus-near': await motion(C.focusNearVar, C.focusStop, 4, 600); break
		case 'focus-far': await motion(C.focusFarVar, C.focusStop, 4, 600); break

		case 'af-on': await v.command(C.focusAuto()); break
		case 'af-off': await v.command(C.focusManual()); break
		case 'af-toggle': await v.command(C.focusAutoToggle()); break
		case 'one-push-af': await v.command(C.focusOnePush()); break

		case 'gain': await v.command(C.gainDirect(num(0, 4))); break
		case 'gain-up': await v.command(C.gainUp()); break
		case 'gain-down': await v.command(C.gainDown()); break
		case 'iris': await v.command(C.irisDirect(num(0, 7))); break
		case 'iris-up': await v.command(C.irisUp()); break
		case 'iris-down': await v.command(C.irisDown()); break
		case 'shutter': await v.command(C.shutterDirect(num(0, 11))); break
		case 'shutter-up': await v.command(C.shutterUp()); break
		case 'shutter-down': await v.command(C.shutterDown()); break

		case 'menu-on': await v.command(C.menuOn()); break
		case 'menu-off': await v.command(C.menuOff()); break
		case 'menu-toggle': await v.command(C.menuToggle()); break

		case 'wb-auto': await v.command(C.wbMode(C.WB_MODE.AUTO)); break
		case 'wb-indoor': await v.command(C.wbMode(C.WB_MODE.INDOOR)); break
		case 'wb-outdoor': await v.command(C.wbMode(C.WB_MODE.OUTDOOR)); break
		case 'color-temp': await v.command(C.colorTempDirect(num(0, 5600))); break

		case 'raw': {
			const hex = (args.join(' ') || '').trim()
			const bytes = hex.split(/\s+/).map((b) => parseInt(b, 16))
			if (bytes.some(Number.isNaN)) {
				console.error('Invalid hex bytes')
				process.exit(1)
			}
			await v.command(bytes)
			break
		}
		default:
			usage()
	}
	await new Promise((r) => setTimeout(r, 250))
	v.close()
}

run().catch((e) => {
	console.error(e.message)
	v.close()
	process.exit(1)
})
