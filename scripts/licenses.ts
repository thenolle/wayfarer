import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const ALLOWED = new Set(['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'PolyForm-Strict-1.0.0'])
const modules = join(import.meta.dir, '..', 'node_modules')

interface Entry {
	readonly name: string
	readonly version: string
	readonly license: string
}

function textOf(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string') return value.type
	return 'UNKNOWN'
}

async function readEntry(directory: string): Promise<Entry | null> {
	const file = Bun.file(join(directory, 'package.json'))
	if (!(await file.exists())) return null
	const data: unknown = await file.json()
	if (typeof data !== 'object' || data === null) return null
	const record = data as Record<string, unknown>
	return {
		name: typeof record['name'] === 'string' ? record['name'] : directory,
		version: typeof record['version'] === 'string' ? record['version'] : '?',
		license: textOf(record['license'])
	}
}

function isAllowed(license: string): boolean {
	return license.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/).some((part) => ALLOWED.has(part.trim()))
}

const entries: Entry[] = []
for (const name of await readdir(modules)) {
	if (name.startsWith('.')) continue
	const directories = name.startsWith('@') ? (await readdir(join(modules, name))).map((child) => join(modules, name, child)) : [join(modules, name)]
	for (const directory of directories) {
		const entry = await readEntry(directory)
		if (entry !== null) entries.push(entry)
	}
}

entries.sort((a, b) => a.name.localeCompare(b.name))
for (const entry of entries) console.log(`${entry.name}@${entry.version}\t${entry.license}`)

const rejected = entries.filter((entry) => !isAllowed(entry.license))
if (rejected.length > 0) {
	console.error(`\n${rejected.length} package(s) have a licence that is not on the allow-list:`)
	for (const entry of rejected) console.error(`  ${entry.name}@${entry.version}: ${entry.license}`)
	process.exit(1)
}
