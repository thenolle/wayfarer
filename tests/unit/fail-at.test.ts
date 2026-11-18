import { describe, expect, test } from 'bun:test'
import { failAt, HttpStatusError, ResolverError } from '../../src/downloads/http/errors'

describe('failAt', () => {
	test('names the step and keeps the status and retry delay', () => {
		let caught: unknown = null
		try { failAt('Landing page', new HttpStatusError(429, 5000)) } catch (error) { caught = error }
		expect(caught).toBeInstanceOf(HttpStatusError)
		const error = caught as HttpStatusError
		expect(error.message).toBe('Landing page: The server responded with HTTP 429')
		expect(error.status).toBe(429)
		expect(error.retryAfterMs).toBe(5000)
	})

	test('passes other errors through untouched', () => {
		const original = new ResolverError('no link')
		expect(() => failAt('Landing page', original)).toThrow(original)
	})
})
