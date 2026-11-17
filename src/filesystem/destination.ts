import { readdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { isErrnoException } from './errors'
import { PART_SUFFIX } from './paths'

const MAX_ATTEMPTS = 10_000
const MAX_EXTENSION_LENGTH = 16

/**
 * Splits a filename into stem and extension. Compound `.tar.*` extensions stay
 * together so `backup.tar.gz` becomes `backup (1).tar.gz`.
 */
export function splitExtension(filename: string): { readonly stem: string; readonly extension: string } {
	const dot = filename.lastIndexOf('.')
	if (dot <= 0 || filename.length - dot > MAX_EXTENSION_LENGTH) return { stem: filename, extension: '' }
	const stem = filename.slice(0, dot)
	if (stem.toLowerCase().endsWith('.tar')) return { stem: stem.slice(0, -4), extension: `${stem.slice(-4)}${filename.slice(dot)}` }
	return { stem, extension: filename.slice(dot) }
}

async function listLowercaseNames(directory: string): Promise<Set<string>> {
	try {
		const entries = await readdir(directory)
		return new Set(entries.map((entry) => entry.toLowerCase()))
	} catch (error) {
		if (isErrnoException(error) && error.code === 'ENOENT') return new Set()
		throw error
	}
}

/**
 * Chooses a destination path inside `directory` that does not collide with an
 * existing file, an in-progress `.part` file, or any path in `reservedPaths`.
 *
 * Names are compared case-insensitively on every platform, so results are
 * identical on case-sensitive and case-insensitive filesystems. The first free
 * candidate is `filename`, then `name (1).ext`, `name (2).ext`, and so on.
 *
 * This function only reads. Callers must serialise allocation and insert the
 * result into the database, whose unique destination index is the final
 * guard against two downloads choosing the same name.
 *
 * @throws {Error} when no free name is found within 10 000 attempts.
 */
export async function allocateDestination(directory: string, filename: string, reservedPaths: Iterable<string> = []): Promise<string> {
	const taken = await listLowercaseNames(directory)
	const resolvedDirectory = resolve(directory)
	for (const reserved of reservedPaths) { if (resolve(dirname(reserved)) === resolvedDirectory) taken.add(basename(reserved).toLowerCase()) }
	const { stem, extension } = splitExtension(filename)
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const candidate = attempt === 0 ? filename : `${stem} (${attempt})${extension}`
		const key = candidate.toLowerCase()
		if (!taken.has(key) && !taken.has(`${key}${PART_SUFFIX}`)) return join(directory, candidate)
	}
	throw new Error('No free filename could be found in the download directory')
}
