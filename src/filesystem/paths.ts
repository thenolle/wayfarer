import { isAbsolute, relative, resolve, sep } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { PathEscapeError } from './errors'

export const PART_SUFFIX = '.part'

/**
 * The in-progress file for a destination. Downloads are written here and only
 * renamed to the destination after they are complete and verified.
 */
export function partPathFor(destination: string): string {
	return `${destination}${PART_SUFFIX}`
}

/**
 * Resolves `name` inside `root` and returns the absolute path.
 *
 * @throws {PathEscapeError} when the result is `root` itself or lies outside it.
 */
export function resolveWithin(root: string, name: string): string {
	const base = resolve(root)
	const target = resolve(base, name)
	const offset = relative(base, target)
	if (offset === '' || offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) throw new PathEscapeError()
	return target
}

/**
 * Creates the given directories, including missing parents.
 */
export async function ensureDirectories(...directories: readonly string[]): Promise<void> {
	for (const directory of directories) await mkdir(directory, { recursive: true })
}
