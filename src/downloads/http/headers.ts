import { HttpStatusError, ResolverError } from './errors'

export const DEFAULT_USER_AGENT = 'Wayfarer/0.1 (+https://github.com/thenolle/wayfarer)'
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * Headers a regular browser sends when loading a page. Used by resolvers for
 * hosts that serve different content to clients that do not look like one.
 */
export const BROWSER_HEADERS: Readonly<Record<string, string>> = {
	'User-Agent': BROWSER_USER_AGENT,
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9'
}

export interface ContentRange {
	readonly start: number
	readonly end: number
	readonly total: number | null
}

/**
 * Parses a `Retry-After` header (seconds or HTTP date) into milliseconds.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
	if (value === null) return null
	const trimmed = value.trim()
	if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
	const date = Date.parse(trimmed)
	return Number.isNaN(date) ? null : Math.max(0, date - now)
}

export function parseContentLength(value: string | null): number | null {
	if (value === null || !/^\d+$/.test(value.trim())) return null
	const length = Number(value)
	return Number.isSafeInteger(length) ? length : null
}

/**
 * Parses `Content-Range: bytes <start>-<end>/<total|*>`.
 */
export function parseContentRange(value: string | null): ContentRange | null {
	if (value === null) return null
	const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(value.trim())
	if (match === null) return null
	const start = Number(match[1])
	const end = Number(match[2])
	const total = match[3] === '*' ? null : Number(match[3])
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null
	return { start, end, total }
}

/**
 * Parses the total size from an unsatisfied range, `Content-Range: bytes *\/<total>`.
 */
export function parseUnsatisfiedRange(value: string | null): number | null {
	if (value === null) return null
	const match = /^bytes \*\/(\d+)$/.exec(value.trim())
	return match === null ? null : Number(match[1])
}

/**
 * Releases the connection behind a response whose body is not needed.
 */
export function discardBody(response: Response): void {
	void response.body?.cancel().catch(() => undefined)
}

/**
 * Throws `HttpStatusError` for non-2xx responses and releases their body.
 */
export function assertOk(response: Response): void {
	if (response.ok) return
	discardBody(response)
	throw new HttpStatusError(response.status, parseRetryAfter(response.headers.get('retry-after')))
}

/**
 * Refuses a response that is a Cloudflare challenge page, which only a browser
 * can pass. Wayfarer never solves or bypasses challenges.
 */
export function assertNoChallenge(response: Response, site: string): void {
	if (response.headers.get('cf-mitigated')?.toLowerCase() !== 'challenge') return
	discardBody(response)
	throw new ResolverError(`${site} is protected by a Cloudflare challenge that only a browser can pass, and Wayfarer does not bypass those. Open the page in your browser, start the download there, copy the download link and add that link here instead.`)
}
