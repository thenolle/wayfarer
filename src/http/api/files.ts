import { PathEscapeError } from '../../filesystem/errors'
import { confineToLocations } from '../../filesystem/locations'
import type { ApiRuntime } from './context'
import { ApiError } from './errors'

export type RangeRequest =
	| { readonly kind: 'full' }
	| { readonly kind: 'partial'; readonly start: number; readonly end: number }
	| { readonly kind: 'unsatisfiable' }

/**
 * Interprets a `Range` header for a file of `size` bytes.
 *
 * Only a single `bytes=` range is honoured: `a-b`, `a-` and `-n`. Anything
 * else, including several ranges and malformed values, is ignored and the
 * whole file is served, which the HTTP specification permits. A well-formed
 * range that starts beyond the end of the file is unsatisfiable.
 */
export function parseRange(header: string | null, size: number): RangeRequest {
	if (header === null) return { kind: 'full' }
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
	if (match === null) return { kind: 'full' }
	const first = match[1] ?? ''
	const last = match[2] ?? ''
	if (first === '' && last === '') return { kind: 'full' }
	if (first === '') {
		const length = Number(last)
		if (length === 0 || size === 0) return { kind: 'unsatisfiable' }
		return { kind: 'partial', start: Math.max(0, size - length), end: size - 1 }
	}
	const start = Number(first)
	if (start >= size) return { kind: 'unsatisfiable' }
	const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
	if (end < start) return { kind: 'full' }
	return { kind: 'partial', start, end }
}

/**
 * Builds an attachment `Content-Disposition` with an ASCII fallback and an
 * RFC 5987 `filename*` for the real name.
 */
export function contentDisposition(filename: string): string {
	const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
	const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Streams a completed download. Supports single byte ranges.
 *
 * The path always comes from the database and is confined to the download
 * directory; clients never supply a path. Responses are marked as
 * attachments, are not sniffed, and carry a sandboxing content security policy
 * so a served file cannot run as a page.
 *
 * @throws {ApiError} 404 for unknown or missing files, 409 when unfinished.
 */
export async function serveCompletedFile(runtime: ApiRuntime, id: string, request: Request): Promise<Response> {
	const record = runtime.downloads.get(id)
	if (record === null) throw new ApiError(404, 'not_found', 'Download not found')
	if (record.status !== 'completed') throw new ApiError(409, 'not_ready', 'The download has not finished')
	let path: string
	try {
		path = confineToLocations(runtime.locations.current(), record.destination)
	} catch (error) {
		if (error instanceof PathEscapeError) throw new ApiError(404, 'file_unavailable', 'The file is not available')
		throw error
	}
	const file = Bun.file(path)
	if (!(await file.exists())) throw new ApiError(404, 'file_unavailable', 'The file is not available')
	const size = file.size
	const headers = new Headers({
		'content-type': 'application/octet-stream',
		'content-disposition': contentDisposition(record.filename),
		'accept-ranges': 'bytes',
		'cache-control': 'private, no-cache',
		'content-security-policy': 'sandbox'
	})
	if (record.completedAt !== null) headers.set('last-modified', new Date(record.completedAt).toUTCString())
	const range = parseRange(request.headers.get('range'), size)
	if (range.kind === 'unsatisfiable') {
		headers.set('content-range', `bytes */${size}`)
		return new Response(null, { status: 416, headers })
	}
	if (range.kind === 'partial') {
		headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`)
		headers.set('content-length', String(range.end - range.start + 1))
		return new Response(file.slice(range.start, range.end + 1), { status: 206, headers })
	}
	headers.set('content-length', String(size))
	return new Response(file, { headers })
}
