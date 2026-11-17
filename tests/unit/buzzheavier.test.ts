import { describe, expect, test } from 'bun:test'
import { ResolverError } from '../../src/downloads/http/errors'
import type { GuardedFetch, GuardedRequest, GuardedResponse } from '../../src/downloads/http/guarded-fetch'
import { BuzzheavierResolver, findDownloadEndpoint } from '../../src/downloads/resolvers/buzzheavier'
import { createDefaultResolvers } from '../../src/downloads/resolvers/registry'

interface Call {
	readonly url: URL
	readonly request: GuardedRequest
	readonly cookie: string | null
}

function reply(response: Response, url: URL): GuardedResponse {
	return { response, url, abort: () => undefined }
}

function stub(handler: (url: URL) => Response): { fetch: GuardedFetch; calls: Call[] } {
	const calls: Call[] = []
	const fetch: GuardedFetch = async (input, request = {}) => {
		const url = typeof input === 'string' ? new URL(input) : input
		calls.push({ url, request, cookie: request.jar?.header(url) ?? null })
		const response = handler(url)
		request.jar?.store(url, response.headers.getSetCookie())
		return reply(response, url)
	}
	return { fetch, calls }
}

const signal = new AbortController().signal

describe('findDownloadEndpoint', () => {
	const page = new URL('https://buzzheavier.com/abc123')

	test('reads hx-get and href attributes', () => {
		expect(findDownloadEndpoint('<a hx-get="/abc123/download" class="x">Go</a>', page).href).toBe('https://buzzheavier.com/abc123/download')
		expect(findDownloadEndpoint("<a href='https://buzzheavier.com/abc123/download?x=1&amp;y=2'>", page).href).toBe('https://buzzheavier.com/abc123/download?x=1&y=2')
	})

	test('falls back to the page path plus /download', () => {
		expect(findDownloadEndpoint('<p>nothing here</p>', new URL('https://bzzhr.to/xyz/')).href).toBe('https://bzzhr.to/xyz/download')
	})
})

describe('BuzzheavierResolver', () => {
	const resolver = new BuzzheavierResolver()

	test('claims only its own hosts', () => {
		for (const host of ['buzzheavier.com', 'www.buzzheavier.com', 'bzzhr.to', 'bzzhr.co']) expect(resolver.canResolve(new URL(`https://${host}/abc`))).toBe(true)
		expect(resolver.canResolve(new URL('https://example.com/abc'))).toBe(false)
		expect(resolver.canResolve(new URL('https://buzzheavier.com.evil.test/abc'))).toBe(false)
	})

	test('follows the landing page to the HX-Redirect location', async () => {
		const { fetch, calls } = stub((url) => {
			if (url.pathname === '/abc123') return new Response('<a hx-get="/abc123/download">Download</a>', { headers: { 'content-type': 'text/html', 'set-cookie': 'session=xyz; Path=/' } })
			if (url.pathname === '/abc123/download') return new Response(null, { headers: { 'HX-Redirect': 'https://cdn.example.test/files/data.bin?token=1' } })
			return new Response('missing', { status: 404 })
		})
		const source = await resolver.resolve(new URL('https://buzzheavier.com/abc123'), { fetch, signal })
		expect(source.resolver).toBe('buzzheavier')
		expect(source.url).toBe('https://cdn.example.test/files/data.bin?token=1')
		expect(source.headers['Referer']).toBe('https://buzzheavier.com/abc123')
		const step = calls[1]
		expect(step?.cookie).toBe('session=xyz')
		expect(step?.request.headers?.['HX-Request']).toBe('true')
		expect(step?.request.headers?.['Referer']).toBe('https://buzzheavier.com/abc123')
		expect(step?.request.followRedirects).toBe(false)
	})

	test('sends session cookies with the file request on the same host', async () => {
		const { fetch } = stub((url) => {
			if (url.pathname === '/abc123') return new Response('<a hx-get="/abc123/download">', { headers: { 'content-type': 'text/html', 'set-cookie': 'session=xyz; Path=/' } })
			return new Response(null, { headers: { 'HX-Redirect': '/files/data.bin' } })
		})
		const source = await resolver.resolve(new URL('https://buzzheavier.com/abc123'), { fetch, signal })
		expect(source.url).toBe('https://buzzheavier.com/files/data.bin')
		expect(source.headers['Cookie']).toBe('session=xyz')
	})

	test('fails clearly when no download link is offered', async () => {
		const { fetch } = stub((url) => url.pathname === '/abc123' ? new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } }) : new Response('<p>sorry</p>', { headers: { 'content-type': 'text/html' } }))
		expect(resolver.resolve(new URL('https://buzzheavier.com/abc123'), { fetch, signal })).rejects.toBeInstanceOf(ResolverError)
	})
})

describe('createDefaultResolvers', () => {
	test('uses buzzheavier for its hosts and the direct resolver otherwise', () => {
		const registry = createDefaultResolvers()
		expect(registry.find(new URL('https://bzzhr.co/abc')).name).toBe('buzzheavier')
		expect(registry.find(new URL('https://example.test/file.zip')).name).toBe('direct')
	})

	test('rejects unsupported schemes and duplicate names', () => {
		const registry = createDefaultResolvers()
		expect(() => registry.find(new URL('ftp://example.test/file'))).toThrow()
		expect(() => registry.register(new BuzzheavierResolver())).toThrow()
	})
})
