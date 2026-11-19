import { createHmac } from 'node:crypto'
import type { DownloadRecord } from './domain/records'
import { BlockedDestinationError } from './http/errors'
import { DEFAULT_USER_AGENT } from './http/headers'

export type WebhookEvent = 'download.completed' | 'download.failed'

export interface WebhookTarget {
	readonly url: URL
	/** When set, every request is signed with it. */
	readonly secret: string | null
}

/**
 * What a receiver gets. It deliberately leaves out the download link (which
 * may contain tokens), file system paths and anything secret.
 */
export interface WebhookPayload {
	readonly event: WebhookEvent
	readonly timestamp: string
	readonly download: {
		readonly id: string
		readonly filename: string
		readonly host: string | null
		readonly resolver: string | null
		readonly totalBytes: number | null
		readonly downloadedBytes: number
		readonly sha256: string | null
		readonly error: { readonly code: string; readonly message: string } | null
	}
}

export interface WebhookOptions {
	readonly policy: { assertAllowed(url: URL): Promise<void> }
	readonly fetchImpl?: (input: string, init: RequestInit) => Promise<Response>
	/** Waits before each retry; its length is the number of retries. */
	readonly retryDelaysMs?: readonly number[]
	readonly timeoutMs?: number
	readonly now?: () => number
	readonly sleep?: (ms: number) => Promise<void>
	readonly log?: (message: string) => void
}

const DEFAULT_RETRY_DELAYS_MS = [1_000, 5_000] as const
const DEFAULT_TIMEOUT_MS = 10_000

type Attempt = { readonly result: 'ok' } | { readonly result: 'retry' | 'permanent'; readonly reason: string }

export function eventFor(record: DownloadRecord): WebhookEvent | null {
	if (record.status === 'completed') return 'download.completed'
	if (record.status === 'failed') return 'download.failed'
	return null
}

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname
	} catch {
		return null
	}
}

export function buildPayload(event: WebhookEvent, record: DownloadRecord, now: number): WebhookPayload {
	return {
		event,
		timestamp: new Date(now).toISOString(),
		download: {
			id: record.id,
			filename: record.filename,
			host: hostOf(record.url),
			resolver: record.resolver,
			totalBytes: record.totalBytes,
			downloadedBytes: record.downloadedBytes,
			sha256: record.actualSha256,
			error: record.errorCode === null ? null : { code: record.errorCode, message: record.errorMessage ?? '' }
		}
	}
}

/**
 * HMAC-SHA256, as lowercase hex, of `<unix seconds>.<raw body>`.
 */
export function signBody(secret: string, timestamp: number, body: string): string {
	return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

/**
 * Sends a signed JSON `POST` when a download completes or fails.
 *
 * Requests go through the network policy before every attempt and redirects
 * are never followed. Transient failures (network errors, timeouts, 5xx, 408
 * and 429) are retried; everything else fails at once. Failures are logged
 * without the URL, which may contain a token. `notify` never throws and never
 * waits for the receiver.
 */
export class WebhookNotifier {
	private readonly pending = new Set<Promise<void>>()
	private readonly fetchImpl: (input: string, init: RequestInit) => Promise<Response>

	constructor(private readonly target: WebhookTarget, private readonly options: WebhookOptions) {
		this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
	}

	notify(record: DownloadRecord): void {
		const event = eventFor(record)
		if (event === null) return
		const body = JSON.stringify(buildPayload(event, record, this.now()))
		const task: Promise<void> = this.deliver(event, crypto.randomUUID(), body, record.id).finally(() => {
			this.pending.delete(task)
		})
		this.pending.add(task)
	}

	/**
	 * Waits for deliveries in progress, at most `timeoutMs`.
	 */
	async drain(timeoutMs: number = 5_000): Promise<void> {
		if (this.pending.size === 0) return
		let timer: ReturnType<typeof setTimeout> | undefined
		const timeout = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, timeoutMs)
		})
		await Promise.race([Promise.allSettled([...this.pending]).then(() => undefined), timeout])
		clearTimeout(timer)
	}

	private now(): number {
		return (this.options.now ?? Date.now)()
	}

	private async deliver(event: WebhookEvent, delivery: string, body: string, id: string): Promise<void> {
		const delays = this.options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
		const sleep = this.options.sleep ?? ((ms: number) => Bun.sleep(ms))
		const log = this.options.log ?? ((message: string) => console.error(`[wayfarer] ${message}`))
		for (let attempt = 0; ; attempt += 1) {
			const outcome = await this.attempt(event, delivery, body)
			if (outcome.result === 'ok') return
			const delay = delays[attempt]
			if (outcome.result === 'permanent' || delay === undefined) {
				log(`webhook ${event} for download ${id} was not delivered: ${outcome.reason}`)
				return
			}
			await sleep(delay)
		}
	}

	private async attempt(event: WebhookEvent, delivery: string, body: string): Promise<Attempt> {
		const { url, secret } = this.target
		try {
			await this.options.policy.assertAllowed(url)
			const timestamp = Math.floor(this.now() / 1000)
			const headers: Record<string, string> = {
				'content-type': 'application/json',
				'user-agent': DEFAULT_USER_AGENT,
				'x-wayfarer-event': event,
				'x-wayfarer-delivery': delivery,
				'x-wayfarer-timestamp': String(timestamp)
			}
			if (secret !== null) headers['x-wayfarer-signature'] = `sha256=${signBody(secret, timestamp, body)}`
			const response = await this.fetchImpl(url.href, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS) })
			void response.body?.cancel().catch(() => undefined)
			if (response.ok) return { result: 'ok' }
			if (response.status >= 300 && response.status < 400) return { result: 'permanent', reason: `HTTP ${response.status} (redirects are not followed)` }
			const transient = response.status >= 500 || response.status === 429 || response.status === 408
			return { result: transient ? 'retry' : 'permanent', reason: `HTTP ${response.status}` }
		} catch (error) {
			if (error instanceof BlockedDestinationError) return { result: 'permanent', reason: error.message }
			if (error instanceof DOMException && error.name === 'TimeoutError') return { result: 'retry', reason: 'the request timed out' }
			return { result: 'retry', reason: 'the request could not be sent' }
		}
	}
}
