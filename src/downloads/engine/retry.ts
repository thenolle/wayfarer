import type { RetryPolicy } from '../../config/config'
import { HttpStatusError, IncompleteResponseError } from '../http/errors'

const MAX_RETRY_AFTER_MS = 300_000
const NETWORK_ERROR_CODES = /^(ECONN|ETIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ConnectionClosed|ConnectionRefused|FailedToOpenSocket)/

export function isTransientStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || (status >= 500 && status !== 501 && status !== 505)
}

/**
 * Classifies an error as worth retrying. Timeouts, dropped connections,
 * truncated bodies, 408/425/429 and most 5xx responses are transient.
 * Everything else, including other 4xx statuses, blocked destinations and
 * checksum failures, is permanent. Classification of low-level network
 * errors is heuristic.
 */
export function isTransientError(error: unknown): boolean {
	if (error instanceof HttpStatusError) return isTransientStatus(error.status)
	if (error instanceof IncompleteResponseError) return true
	if (error instanceof DOMException) return error.name === 'TimeoutError'
	if (error instanceof TypeError) return true
	if (error instanceof Error && 'code' in error && typeof error.code === 'string') return NETWORK_ERROR_CODES.test(error.code)
	return false
}

/**
 * Delay before retry number `attempt` (1-based): exponential from
 * `baseDelayMs`, capped at `maxDelayMs`, with symmetric random jitter of up to
 * `jitterRatio`. A server's `Retry-After` raises the delay (capped at 5 minutes).
 */
export function backoffDelayMs(attempt: number, policy: RetryPolicy, random: () => number = Math.random, retryAfterMs: number | null = null): number {
	const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1))
	const jitter = exponential * policy.jitterRatio * (random() * 2 - 1)
	const delay = Math.max(0, Math.round(exponential + jitter))
	return retryAfterMs === null ? delay : Math.max(delay, Math.min(retryAfterMs, MAX_RETRY_AFTER_MS))
}

/**
 * Waits `ms` milliseconds, rejecting with the signal's reason if it aborts.
 */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason)
			return
		}
		const onAbort = (): void => {
			clearTimeout(timer)
			reject(signal.reason)
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		signal.addEventListener('abort', onAbort, { once: true })
	})
}

export interface RetryOptions {
	readonly signal: AbortSignal
	readonly random?: () => number
	readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
	readonly onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

/**
 * Runs `operation` until it succeeds, fails permanently, is aborted, or has
 * been attempted `policy.maxAttempts` times. The last error is rethrown.
 */
export async function withRetry<T>(operation: (attempt: number) => Promise<T>, policy: RetryPolicy, options: RetryOptions): Promise<T> {
	const wait = options.sleep ?? sleep
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await operation(attempt)
		} catch (error) {
			if (options.signal.aborted || !isTransientError(error) || attempt >= policy.maxAttempts) throw error
			const retryAfter = error instanceof HttpStatusError ? error.retryAfterMs : null
			const delay = backoffDelayMs(attempt, policy, options.random, retryAfter)
			options.onRetry?.(attempt, error, delay)
			await wait(delay, options.signal)
		}
	}
}
