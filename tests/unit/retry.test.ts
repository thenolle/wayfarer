import { describe, expect, test } from 'bun:test'
import type { RetryPolicy } from '../../src/config/config'
import { backoffDelayMs, isTransientError, withRetry } from '../../src/downloads/engine/retry'
import { HttpStatusError, IncompleteResponseError } from '../../src/downloads/http/errors'

const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0.5 }
const noWait = async (): Promise<void> => undefined

describe('backoffDelayMs', () => {
	test('grows exponentially and caps at the maximum', () => {
		const middle = (): number => 0.5
		expect([1, 2, 3, 4, 5].map((attempt) => backoffDelayMs(attempt, policy, middle))).toEqual([100, 200, 400, 800, 1000])
	})

	test('applies jitter within the configured ratio', () => {
		expect(backoffDelayMs(1, policy, () => 0)).toBe(50)
		expect(backoffDelayMs(1, policy, () => 1)).toBe(150)
	})

	test('honours Retry-After when it is longer', () => {
		expect(backoffDelayMs(1, policy, () => 0.5, 5000)).toBe(5000)
		expect(backoffDelayMs(1, policy, () => 0.5, 10)).toBe(100)
	})
})

describe('isTransientError', () => {
	test('classifies statuses and network failures', () => {
		expect(isTransientError(new HttpStatusError(429))).toBe(true)
		expect(isTransientError(new HttpStatusError(503))).toBe(true)
		expect(isTransientError(new HttpStatusError(404))).toBe(false)
		expect(isTransientError(new HttpStatusError(501))).toBe(false)
		expect(isTransientError(new IncompleteResponseError())).toBe(true)
		expect(isTransientError(new DOMException('slow', 'TimeoutError'))).toBe(true)
		expect(isTransientError(new DOMException('stop', 'AbortError'))).toBe(false)
		expect(isTransientError(new TypeError('fetch failed'))).toBe(true)
		expect(isTransientError(new Error('boom'))).toBe(false)
	})
})

describe('withRetry', () => {
	test('retries transient failures until success', async () => {
		let calls = 0
		const delays: number[] = []
		const result = await withRetry(async () => {
			calls += 1
			if (calls < 3) throw new HttpStatusError(503)
			return 'ok'
		}, policy, { signal: new AbortController().signal, random: () => 0.5, sleep: noWait, onRetry: (_a, _e, delay) => delays.push(delay) })
		expect(result).toBe('ok')
		expect(calls).toBe(3)
		expect(delays).toEqual([100, 200])
	})

	test('does not retry permanent failures', async () => {
		let calls = 0
		expect(withRetry(async () => {
			calls += 1
			throw new HttpStatusError(404)
		}, policy, { signal: new AbortController().signal, sleep: noWait })).rejects.toBeInstanceOf(HttpStatusError)
		expect(calls).toBe(1)
	})

	test('stops after the maximum number of attempts', async () => {
		let calls = 0
		expect(withRetry(async () => {
			calls += 1
			throw new HttpStatusError(500)
		}, policy, { signal: new AbortController().signal, sleep: noWait })).rejects.toBeInstanceOf(HttpStatusError)
		expect(calls).toBe(policy.maxAttempts)
	})

	test('does not retry once aborted', async () => {
		const controller = new AbortController()
		let calls = 0
		expect(withRetry(async () => {
			calls += 1
			controller.abort()
			throw new HttpStatusError(503)
		}, policy, { signal: controller.signal, sleep: noWait })).rejects.toBeInstanceOf(HttpStatusError)
		expect(calls).toBe(1)
	})
})
