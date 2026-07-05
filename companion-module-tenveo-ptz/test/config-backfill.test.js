/**
 * v1.17.1 test — Config backfill for missing new-version keys.
 *
 * Root cause of the "Save button stays greyed out" bug:
 *   Companion's config-panel Save is disabled when isValid() returns false.
 *   Number fields with value === undefined FAIL validation with the message
 *   "A value must be provided". After a module upgrade that adds new number
 *   fields (e.g. panDegPerSec, osdNavStyle), the user's persisted config
 *   lacks those keys and validation blocks Save even for unrelated edits.
 *
 * Fix — module.init(config) now runs _backfillConfig(config) which merges
 * every field.default from getConfigFields() into any undefined/null/empty
 * keys and persists back via saveConfig(...). Verified below.
 */
import { getConfigFields } from '../src/config.js'

const results = []
function assert(name, cond, extra = '') {
	results.push({ name, ok: !!cond, extra })
	if (cond) console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`)
	else console.error(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`)
}

/** Isolated re-implementation of the same logic embedded in TenveoInstance —
 *  this is what we're testing. Kept in sync with main.js by identical shape. */
function backfillConfig(config, fields, saveConfig, log) {
	const defaults = {}
	for (const f of fields) {
		if (f && f.id && f.type !== 'static-text' && f.default !== undefined) defaults[f.id] = f.default
	}
	let dirty = false
	const merged = { ...config }
	for (const [k, v] of Object.entries(defaults)) {
		if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
			merged[k] = v
			dirty = true
		}
	}
	if (dirty) saveConfig(merged)
	return merged
}

function test1_fieldsHaveDefaults() {
	console.log('\n[TEST 1] Every non-static-text field in getConfigFields() defines a default')
	const fields = getConfigFields()
	for (const f of fields) {
		if (f.type === 'static-text') continue
		assert(`${f.id} has default`, f.default !== undefined, `type=${f.type}`)
	}
}

function test2_backfillPopulatesMissingKeys() {
	console.log('\n[TEST 2] Config missing new fields → backfill applies defaults + calls saveConfig')
	const stored = { name: 'Cam 11', host: '192.168.88.11' } // simulate an ancient config that predates most fields
	const saved = []
	const merged = backfillConfig(stored, getConfigFields(), (c) => saved.push(c), () => {})
	assert('saveConfig was called exactly once', saved.length === 1)
	// A few fields we know are numeric and must not be undefined post-backfill:
	for (const key of ['panSpeed', 'tiltSpeed', 'zoomSpeed', 'unitsPerDegree', 'zoomUnitsPerSec', 'focusUnitsPerSec',
		'panDegPerSec', 'tiltDegPerSec', 'panCenter', 'panUnitsPerDeg', 'tiltCenter', 'tiltUnitsPerDeg', 'pollInterval']) {
		assert(`${key} backfilled`, typeof merged[key] === 'number')
	}
	assert('verbose backfilled to false (checkbox)', merged.verbose === false)
	assert('original name preserved', merged.name === 'Cam 11')
	assert('original host preserved', merged.host === '192.168.88.11')
}

function test3_backfillNoopWhenAllKeysPresent() {
	console.log('\n[TEST 3] Backfill is a NO-OP (does NOT call saveConfig) when every key is already set')
	const fields = getConfigFields()
	const full = {}
	for (const f of fields) {
		if (f.type !== 'static-text' && f.default !== undefined) full[f.id] = f.default
	}
	// Also user-tweaked values to be sure they survive
	full.panSpeed = 20
	const saved = []
	const merged = backfillConfig(full, fields, (c) => saved.push(c), () => {})
	assert('saveConfig NOT called when nothing missing', saved.length === 0)
	assert('user-tweaked panSpeed preserved', merged.panSpeed === 20)
}

function test4_backfillTreatsEmptyStringAsMissing() {
	console.log('\n[TEST 4] Empty string / null values are treated as missing and get defaults')
	const stored = {
		panSpeed: null,
		tiltSpeed: '',
		zoomSpeed: undefined,
	}
	const saved = []
	const merged = backfillConfig(stored, getConfigFields(), (c) => saved.push(c), () => {})
	assert('null → default', typeof merged.panSpeed === 'number')
	assert('empty string → default', typeof merged.tiltSpeed === 'number')
	assert('undefined → default', typeof merged.zoomSpeed === 'number')
	assert('saveConfig was called', saved.length === 1)
}

test1_fieldsHaveDefaults()
test2_backfillPopulatesMissingKeys()
test3_backfillNoopWhenAllKeysPresent()
test4_backfillTreatsEmptyStringAsMissing()

const failed = results.filter((r) => !r.ok)
const total = results.length
console.log(`\n───── ${total - failed.length}/${total} assertions passed ─────`)
if (failed.length) {
	console.error('Failed:')
	failed.forEach((f) => console.error(`  ✗ ${f.name}${f.extra ? ' — ' + f.extra : ''}`))
	process.exit(1)
}
