import { describe, expect, test } from 'bun:test'
import { HttpStatusError } from '../../src/downloads/http/errors'
import { PixeldrainResolver } from '../../src/downloads/resolvers/pixeldrain'
import type { ResolverContext } from '../../src/downloads/resolvers/types'

function fakeContext(respond: (url: URL) => Response): { context: ResolverContext; requested: URL[] } {
	const requested: URL[] = []
	const context: ResolverContext = {
		fetch: async (input) => {
			const url = typeof input === 'string' ? new URL(input) : input
			requested.push(url)
			return { response: respond(url), url, abort: () => undefined }
		},
		signal: new AbortController().signal
	}
	return { context, requested }
}

describe('PixeldrainResolver', () => {
	const resolver = new PixeldrainResolver()

	test('claims file and list pages on Pixeldrain only', () => {
		expect(resolver.canResolve(new URL('https://pixeldrain.com/u/AbCd1234'))).toBe(true)
		expect(resolver.canResolve(new URL('https://pixeldrain.com/api/file/AbCd1234'))).toBe(true)
		expect(resolver.canResolve(new URL('https://pixeldrain.com/l/AbCd1234'))).toBe(true)
		expect(resolver.canResolve(new URL('https://pixeldrain.com/'))).toBe(false)
		expect(resolver.canResolve(new URL('https://evil.test/u/AbCd1234'))).toBe(false)
	})

	test('points at the file API and takes the name from the file info', async () => {
		const { context, requested } = fakeContext(() => Response.json({ id: 'AbCd1234', name: 'holiday photos.zip' }))
		const source = await resolver.resolve(new URL('https://pixeldrain.com/u/AbCd1234'), context)
		expect(requested.map((url) => url.href)).toEqual(['https://pixeldrain.com/api/file/AbCd1234/info'])
		expect(source.url).toBe('https://pixeldrain.com/api/file/AbCd1234')
		expect(source.filenameHint).toBe('holiday photos.zip')
	})

	test('keeps the host it was given', async () => {
		const { context } = fakeContext(() => Response.json({ name: 'a.bin' }))
		const source = await resolver.resolve(new URL('https://pixeldrain.net/u/AbCd1234'), context)
		expect(source.url).toBe('https://pixeldrain.net/api/file/AbCd1234')
	})

	test('still resolves when the info has no usable name', async () => {
		const { context } = fakeContext(() => new Response('not json', { status: 200 }))
		expect((await resolver.resolve(new URL('https://pixeldrain.com/u/AbCd1234'), context)).filenameHint).toBeNull()
	})

	test('explains missing files and keeps the status of other failures', async () => {
		const missing = fakeContext(() => new Response('{}', { status: 404 }))
		await expect(resolver.resolve(new URL('https://pixeldrain.com/u/AbCd1234'), missing.context)).rejects.toThrow('could not find')
		const limited = fakeContext(() => new Response('{}', { status: 429, headers: { 'retry-after': '30' } }))
		const failure = await resolver.resolve(new URL('https://pixeldrain.com/u/AbCd1234'), limited.context).catch((error: unknown) => error)
		expect(failure).toBeInstanceOf(HttpStatusError)
		expect((failure as HttpStatusError).status).toBe(429)
		expect((failure as HttpStatusError).retryAfterMs).toBe(30_000)
		expect((failure as HttpStatusError).message).toContain('Pixeldrain file info')
	})

	test('refuses lists without contacting the server', async () => {
		const { context, requested } = fakeContext(() => Response.json({}))
		await expect(resolver.resolve(new URL('https://pixeldrain.com/l/AbCd1234'), context)).rejects.toThrow('lists')
		expect(requested).toHaveLength(0)
	})
})
