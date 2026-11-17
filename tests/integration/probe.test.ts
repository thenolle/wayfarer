import { afterEach, describe, expect, test } from 'bun:test'
import { probeSource } from '../../src/downloads/engine/probe'
import { BlockedDestinationError, HttpStatusError } from '../../src/downloads/http/errors'
import { createGuardedFetch } from '../../src/downloads/http/guarded-fetch'
import type { ResolvedSource, ResolverContext } from '../../src/downloads/resolvers/types'
import { NetworkPolicy } from '../../src/security/network-policy'
import { makeBody, startOrigin } from '../helpers/origin'
import type { TestOrigin } from '../helpers/origin'

let origin: TestOrigin | null = null

afterEach(async () => {
	await origin?.stop()
	origin = null
})

function setup(overrides: Parameters<typeof startOrigin>[0] = {}): { origin: TestOrigin; context: ResolverContext } {
	const started = startOrigin(overrides)
	origin = started
	const policy = new NetworkPolicy(['127.0.0.1'])
	const fetch = createGuardedFetch({ policy, headerTimeoutMs: 5000 })
	return { origin: started, context: { fetch, signal: new AbortController().signal } }
}

function sourceFor(url: string): ResolvedSource {
	return { resolver: 'direct', url, headers: {}, filenameHint: null }
}

describe('probeSource', () => {
	test('reports size, range support, validators and filename', async () => {
		const { origin, context } = setup({ body: makeBody(5000), disposition: "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf" })
		const probe = await probeSource(sourceFor(`${origin.url}/file`), context)
		expect(probe.totalBytes).toBe(5000)
		expect(probe.acceptsRanges).toBe(true)
		expect(probe.etag).toBe('"v1"')
		expect(probe.lastModified).toBe('Wed, 21 Oct 2026 07:28:00 GMT')
		expect(probe.filename).toBe('résumé.pdf')
		expect(origin.requests.map((request) => request.method)).toEqual(['HEAD', 'GET'])
		expect(origin.requests[1]?.range).toBe('bytes=0-0')
	})

	test('falls back to the ranged GET when HEAD is not supported', async () => {
		const { origin, context } = setup({ body: makeBody(3000), head: false })
		const probe = await probeSource(sourceFor(`${origin.url}/file`), context)
		expect(probe.totalBytes).toBe(3000)
		expect(probe.acceptsRanges).toBe(true)
	})

	test('does not trust Accept-Ranges when the server ignores Range', async () => {
		const { origin, context } = setup({ body: makeBody(2000), ranges: 'ignore' })
		const probe = await probeSource(sourceFor(`${origin.url}/file`), context)
		expect(probe.acceptsRanges).toBe(false)
		expect(probe.totalBytes).toBe(2000)
	})

	test('rejects a Content-Range that does not match the request', async () => {
		const { origin, context } = setup({ body: makeBody(2000), ranges: 'bad-content-range' })
		const probe = await probeSource(sourceFor(`${origin.url}/file`), context)
		expect(probe.acceptsRanges).toBe(false)
	})

	test('follows redirects and names the file from the final URL', async () => {
		const { origin, context } = setup({ body: makeBody(100) })
		const probe = await probeSource(sourceFor(`${origin.url}/redirect`), context)
		expect(probe.finalUrl).toBe(`${origin.url}/file`)
		expect(probe.filename).toBe('file')
	})

	test('refuses redirects to private addresses', async () => {
		const { origin, context } = setup()
		expect(probeSource(sourceFor(`${origin.url}/redirect-private`), context)).rejects.toBeInstanceOf(BlockedDestinationError)
	})

	test('refuses private destinations by default', async () => {
		const started = startOrigin()
		origin = started
		const fetch = createGuardedFetch({ policy: new NetworkPolicy([]), headerTimeoutMs: 5000 })
		expect(probeSource(sourceFor(`${started.url}/file`), { fetch, signal: new AbortController().signal })).rejects.toBeInstanceOf(BlockedDestinationError)
		expect(started.requests).toHaveLength(0)
	})

	test('surfaces HTTP errors', async () => {
		const { origin, context } = setup()
		expect(probeSource(sourceFor(`${origin.url}/missing`), context)).rejects.toMatchObject({ status: 404 })
		expect(probeSource(sourceFor(`${origin.url}/missing`), context)).rejects.toBeInstanceOf(HttpStatusError)
	})
})
