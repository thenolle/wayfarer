import { describe, expect, test } from 'bun:test'
import { readTextLimited } from '../../src/downloads/http/headers'

describe('readTextLimited', () => {
	test('returns small bodies whole', async () => {
		expect(await readTextLimited(new Response('hello'), 1000, 1000)).toBe('hello')
	})

	test('stops reading at the byte limit', async () => {
		expect((await readTextLimited(new Response('a'.repeat(10_000)), 100, 1000)).length).toBe(100)
	})

	test('returns what arrived when the server stalls', async () => {
		const stalled = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('hello')) } })
		expect(await readTextLimited(new Response(stalled), 1000, 30)).toBe('hello')
	})
})
