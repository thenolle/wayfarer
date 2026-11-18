import { BlockedDestinationError, failAt } from '../http/errors'
import { filenameFromUrl, parseContentDisposition } from '../http/content-disposition'
import { withoutSensitiveHeaders } from '../http/guarded-fetch'
import { assertOk, discardBody, parseContentLength, parseContentRange, parseUnsatisfiedRange } from '../http/headers'
import type { ResolvedSource, ResolverContext } from '../resolvers/types'

/**
 * What the server told us about a file, gathered before downloading.
 *
 * `headers` are the request headers to use for `finalUrl`; credentials are
 * removed when the file lives on a different origin than the resolved URL.
 */
export interface ProbeResult {
	readonly finalUrl: string
	readonly headers: Readonly<Record<string, string>>
	readonly totalBytes: number | null
	readonly acceptsRanges: boolean
	readonly etag: string | null
	readonly lastModified: string | null
	readonly filename: string | null
}

interface HeadInfo {
	readonly url: URL
	readonly headers: Headers
}

function hasContentEncoding(headers: Headers): boolean {
	const encoding = headers.get('content-encoding')
	return encoding !== null && encoding.trim().toLowerCase() !== 'identity'
}

async function tryHead(source: ResolvedSource, headers: Readonly<Record<string, string>>, context: ResolverContext): Promise<HeadInfo | null> {
	try {
		const result = await context.fetch(source.url, { method: 'HEAD', headers, signal: context.signal })
		discardBody(result.response)
		return result.response.ok ? { url: result.url, headers: result.response.headers } : null
	} catch (error) {
		if (context.signal.aborted || error instanceof BlockedDestinationError) throw error
		return null
	}
}

function interpretRangeResponse(response: Response): { acceptsRanges: boolean; totalBytes: number | null } {
	if (response.status === 206) {
		const range = parseContentRange(response.headers.get('content-range'))
		if (range !== null && range.start === 0 && range.end === 0) return { acceptsRanges: range.total !== null, totalBytes: range.total }
		return { acceptsRanges: false, totalBytes: null }
	}
	if (response.status === 416) return { acceptsRanges: false, totalBytes: parseUnsatisfiedRange(response.headers.get('content-range')) }
	assertOk(response)
	const length = hasContentEncoding(response.headers) ? null : parseContentLength(response.headers.get('content-length'))
	return { acceptsRanges: false, totalBytes: length }
}

/**
 * Inspects a remote file before downloading it.
 *
 * 1. Sends `HEAD`. Failure or a non-2xx answer is not fatal, because many
 *    servers mishandle `HEAD`.
 * 2. Sends `GET` with `Range: bytes=0-0`. Only a `206` response whose
 *    `Content-Range` is exactly `bytes 0-0/<total>` proves range support. An
 *    `Accept-Ranges` header alone is never trusted.
 *
 * Requests ask for `Accept-Encoding: identity` so byte counts match the
 * stored file.
 *
 * @throws {HttpStatusError} when the server rejects the ranged request.
 * @throws {BlockedDestinationError} when a redirect leads somewhere not allowed.
 */
export async function probeSource(source: ResolvedSource, context: ResolverContext): Promise<ProbeResult> {
	const baseHeaders = { ...source.headers, 'Accept-Encoding': 'identity' }
	const sourceOrigin = new URL(source.url).origin
	const headersFor = (url: URL): Readonly<Record<string, string>> => url.origin === sourceOrigin ? baseHeaders : withoutSensitiveHeaders(baseHeaders)
	const head = await tryHead(source, baseHeaders, context)
	const rangeTarget = head?.url ?? new URL(source.url)
	const ranged = await context.fetch(rangeTarget, { headers: { ...headersFor(rangeTarget), Range: 'bytes=0-0' }, signal: context.signal })
	try {
		const { response } = ranged
		let interpreted: { acceptsRanges: boolean; totalBytes: number | null }
		try {
			interpreted = interpretRangeResponse(response)
		} catch (error) {
			if (source.resolver === 'direct') throw error
			failAt(`File server ${ranged.url.host}`, error)
		}
		const headLength = head === null || hasContentEncoding(head.headers) ? null : parseContentLength(head.headers.get('content-length'))
		return {
			finalUrl: ranged.url.href,
			headers: headersFor(ranged.url),
			totalBytes: interpreted.totalBytes ?? headLength,
			acceptsRanges: interpreted.acceptsRanges,
			etag: response.headers.get('etag') ?? head?.headers.get('etag') ?? null,
			lastModified: response.headers.get('last-modified') ?? head?.headers.get('last-modified') ?? null,
			filename: parseContentDisposition(response.headers.get('content-disposition') ?? head?.headers.get('content-disposition') ?? null) ?? source.filenameHint ?? filenameFromUrl(ranged.url)
		}
	} finally {
		discardBody(ranged.response)
		ranged.abort()
	}
}
