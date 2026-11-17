// src/downloads/engine/transfer.ts
import type { RetryPolicy } from '../../config/config'
import type { SegmentRecord } from '../domain/records'
import { IncompleteResponseError, InvalidRangeResponseError, RemoteChangedError } from '../http/errors'
import type { GuardedFetch } from '../http/guarded-fetch'
import { assertOk, parseContentLength, parseContentRange } from '../http/headers'
import { readWithIdleTimeout } from '../http/stream'
import type { PartFile } from './part-file'
import type { ProgressTracker } from './progress'
import { withRetry } from './retry'

/**
 * Called before each chunk is written. The bandwidth limiter plugs in here and
 * delays the returned promise to slow the transfer down.
 */
export type Throttle = (bytes: number, signal: AbortSignal) => Promise<void>

export const noThrottle: Throttle = async () => undefined

export interface TransferContext {
	readonly url: string
	readonly headers: Readonly<Record<string, string>>
	readonly fetch: GuardedFetch
	readonly retry: RetryPolicy
	readonly idleTimeoutMs: number
	readonly throttle: Throttle
	readonly signal: AbortSignal
	readonly file: PartFile
	readonly tracker: ProgressTracker
	readonly onRetry: (segmentId: number | null, error: unknown) => void
}

export interface SegmentTransferContext extends TransferContext {
	/** Sent as `If-Range`; null when the server offered no usable validator. */
	readonly validator: string | null
	readonly totalBytes: number
}

/**
 * The value to send in `If-Range`. A strong ETag is preferred. A weak ETag
 * (`W/...`) cannot be used with `If-Range`, so `Last-Modified` is used instead.
 */
export function validatorFor(etag: string | null, lastModified: string | null): string | null {
	return etag !== null && !etag.startsWith('W/') ? etag : lastModified
}

async function pump(response: Response, abort: () => void, ctx: TransferContext, startPosition: number, limit: number | null, overshoot: () => Error, onChunk: (position: number, length: number) => void): Promise<number> {
	const reader = response.body?.getReader()
	if (reader === undefined) throw new IncompleteResponseError()
	let position = startPosition
	try {
		for (; ;) {
			const result = await readWithIdleTimeout(reader, ctx.idleTimeoutMs, abort)
			if (result.done) break
			const chunk = result.value
			if (chunk.length === 0) continue
			if (limit !== null && position + chunk.length > limit) throw overshoot()
			await ctx.throttle(chunk.length, ctx.signal)
			await ctx.file.writeAt(chunk, position)
			position += chunk.length
			onChunk(position, chunk.length)
		}
	} finally {
		void reader.cancel().catch(() => undefined)
	}
	return position
}

function validateSegmentResponse(response: Response, start: number, end: number, ctx: SegmentTransferContext): void {
	if (response.status === 416) throw new RemoteChangedError()
	if (response.status === 200 && ctx.validator !== null) throw new RemoteChangedError()
	if (response.status !== 206) {
		assertOk(response)
		throw new InvalidRangeResponseError()
	}
	const range = parseContentRange(response.headers.get('content-range'))
	if (range === null || range.start !== start || range.end !== end) throw new InvalidRangeResponseError()
	if (range.total !== null && range.total !== ctx.totalBytes) throw new RemoteChangedError()
}

/**
 * Downloads one segment into the shared part file, resuming from the segment's
 * current offset after each transient failure.
 *
 * Every response is checked: it must be `206` with a `Content-Range` that
 * matches the request exactly and the expected total size. A `200` answer to
 * an `If-Range` request means the file changed. Data beyond the requested
 * range is rejected rather than written.
 *
 * @throws {RemoteChangedError} when the server's file no longer matches.
 * @throws {InvalidRangeResponseError} when the server mishandles ranges.
 */
export async function downloadSegment(segment: Pick<SegmentRecord, 'id' | 'startOffset' | 'endOffset'>, ctx: SegmentTransferContext): Promise<void> {
	const { tracker } = ctx
	const end = segment.endOffset
	tracker.markStatus(segment.id, 'active')
	await withRetry(async () => {
		const start = tracker.nextOffset(segment.id)
		if (start > end) return
		const headers: Record<string, string> = { ...ctx.headers, 'Accept-Encoding': 'identity', Range: `bytes=${start}-${end}` }
		if (ctx.validator !== null) headers['If-Range'] = ctx.validator
		const { response, abort } = await ctx.fetch(ctx.url, { headers, signal: ctx.signal })
		try {
			validateSegmentResponse(response, start, end, ctx)
			const finished = await pump(response, abort, ctx, start, end + 1, () => new InvalidRangeResponseError(), (position, length) => tracker.advance(segment.id, position, length))
			if (finished !== end + 1) throw new IncompleteResponseError()
		} finally {
			abort()
		}
	}, ctx.retry, { signal: ctx.signal, onRetry: (_attempt, error) => ctx.onRetry(segment.id, error) })
	tracker.markStatus(segment.id, 'completed')
}

/**
 * Downloads a whole file in one request, for servers without reliable range
 * support. A failed attempt starts again from byte zero, because the server
 * cannot resume it.
 *
 * Returns the number of bytes written. When `expectedBytes` is known, the
 * body must match it exactly.
 */
export async function downloadSingleStream(ctx: TransferContext, expectedBytes: number | null): Promise<number> {
	return withRetry(async () => {
		ctx.tracker.reset()
		const { response, abort } = await ctx.fetch(ctx.url, {
			headers: { ...ctx.headers, 'Accept-Encoding': 'identity' },
			signal: ctx.signal
		})
		try {
			assertOk(response)
			const declared = response.headers.has('content-encoding') ? null : parseContentLength(response.headers.get('content-length'))
			if (expectedBytes !== null && declared !== null && declared !== expectedBytes) throw new RemoteChangedError()
			const finished = await pump(response, abort, ctx, 0, expectedBytes, () => new RemoteChangedError(), (_position, length) => ctx.tracker.addBytes(length))
			if (expectedBytes !== null && finished !== expectedBytes) throw new IncompleteResponseError()
			return finished
		} finally {
			abort()
		}
	}, ctx.retry, { signal: ctx.signal, onRetry: (_attempt, error) => ctx.onRetry(null, error) })
}
