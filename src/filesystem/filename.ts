export const MAX_FILENAME_BYTES = 200
const MAX_EXTENSION_LENGTH = 16
const DEFAULT_FALLBACK = 'download'
const INVALID_CHARACTERS = /[<>:"|?*\u0000-\u001f\u007f]/g
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const encoder = new TextEncoder()

function byteLength(text: string): number {
	return encoder.encode(text).length
}

function takeBytes(text: string, budget: number): string {
	let result = ''
	let remaining = budget
	for (const character of text) {
		const size = byteLength(character)
		if (size > remaining) break
		result += character
		remaining -= size
	}
	return result
}

/**
 * Shortens a filename to at most `maxBytes` UTF-8 bytes without splitting a
 * character and while keeping a short extension intact.
 */
export function truncateFilename(name: string, maxBytes: number = MAX_FILENAME_BYTES): string {
	if (byteLength(name) <= maxBytes) return name
	const dot = name.lastIndexOf('.')
	const hasExtension = dot > 0 && name.length - dot <= MAX_EXTENSION_LENGTH
	if (hasExtension) {
		const extension = name.slice(dot)
		const stem = takeBytes(name.slice(0, dot), maxBytes - byteLength(extension)).replace(/[. ]+$/, '')
		if (stem !== '') return stem + extension
	}
	return takeBytes(name, maxBytes).replace(/[. ]+$/, '')
}

/**
 * Turns untrusted text into a safe single-segment filename.
 *
 * - Directory components in either separator style are dropped, so
 *   `../../etc/passwd` becomes `passwd`.
 * - Control characters (including null bytes) and `< > : " | ? *` become `_`.
 * - Trailing dots and spaces are removed.
 * - Windows reserved device names such as `CON` or `nul.txt` get a `_` prefix.
 * - The result is limited to 200 UTF-8 bytes, keeping short extensions.
 *
 * Returns `fallback` when nothing usable remains.
 */
export function sanitizeFilename(raw: string, fallback: string = DEFAULT_FALLBACK): string {
	const lastSegment = raw.normalize('NFC').split(/[\\/]+/).filter((segment) => segment !== '').at(-1)
	let name = (lastSegment ?? '').replace(INVALID_CHARACTERS, '_').trimStart().replace(/[. ]+$/, '')
	if (name === '') return fallback
	const stem = name.split('.')[0] ?? ''
	if (WINDOWS_RESERVED.test(stem.trimEnd())) name = `_${name}`
	const truncated = truncateFilename(name)
	return truncated === '' ? fallback : truncated
}
