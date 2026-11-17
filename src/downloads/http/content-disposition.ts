const MAX_CHARSET_BYTES = 4096

function splitParameters(header: string): string[] {
	const parts: string[] = []
	let current = ''
	let quoted = false
	let escaped = false
	for (const character of header) {
		if (escaped) {
			current += character
			escaped = false
			continue
		}
		if (quoted && character === '\\') {
			current += character
			escaped = true
			continue
		}
		if (character === '"') quoted = !quoted
		if (character === ';' && !quoted) {
			parts.push(current)
			current = ''
			continue
		}
		current += character
	}
	parts.push(current)
	return parts
}

function unquote(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\(.)/g, '$1')
	return value
}

function percentDecode(text: string, charset: 'utf-8' | 'iso-8859-1'): string | null {
	if (text.length > MAX_CHARSET_BYTES) return null
	const encoder = new TextEncoder()
	const bytes: number[] = []
	for (let index = 0; index < text.length; index += 1) {
		const character = text.charAt(index)
		if (character === '%') {
			const hex = text.slice(index + 1, index + 3)
			if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null
			bytes.push(Number.parseInt(hex, 16))
			index += 2
		} else {
			bytes.push(...encoder.encode(character))
		}
	}
	try {
		return new TextDecoder(charset, { fatal: true }).decode(Uint8Array.from(bytes))
	} catch {
		return null
	}
}

/**
 * Decodes an RFC 5987 / RFC 8187 value such as `UTF-8''%E2%82%AC%20rates.txt`.
 * Only UTF-8 and ISO-8859-1 are accepted.
 */
function decodeExtended(value: string): string | null {
	const match = /^([^']*)'[^']*'(.*)$/s.exec(value)
	if (match === null) return null
	const charset = (match[1] ?? '').toLowerCase()
	if (charset !== 'utf-8' && charset !== 'iso-8859-1') return null
	return percentDecode(match[2] ?? '', charset)
}

/**
 * Extracts the filename from a `Content-Disposition` header.
 *
 * `filename*` (RFC 5987) wins over `filename`. Returns null when the header is
 * missing, malformed or carries no usable name. The result is untrusted and
 * must be passed through `sanitizeFilename` before use.
 */
export function parseContentDisposition(header: string | null): string | null {
	if (header === null) return null
	let plain: string | null = null
	let extended: string | null = null
	for (const part of splitParameters(header).slice(1)) {
		const separator = part.indexOf('=')
		if (separator < 0) continue
		const name = part.slice(0, separator).trim().toLowerCase()
		const raw = part.slice(separator + 1).trim()
		if (name === 'filename*') extended = decodeExtended(unquote(raw))
		else if (name === 'filename') plain = unquote(raw)
	}
	const result = extended ?? plain
	return result === null || result.trim() === '' ? null : result
}

/**
 * The last path segment of a URL, percent-decoded, or null when it is empty.
 */
export function filenameFromUrl(url: URL): string | null {
	const segment = url.pathname.split('/').filter((part) => part !== '').at(-1)
	if (segment === undefined) return null
	try { return decodeURIComponent(segment) } catch { return segment }
}
