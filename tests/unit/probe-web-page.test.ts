import { describe, expect, test } from 'bun:test'
import { probeSource } from '../../src/downloads/engine/probe'
import { ResolverError } from '../../src/downloads/http/errors'
import type { GuardedFetch } from '../../src/downloads/http/guarded-fetch'
import type { ResolvedSource } from '../../src/downloads/resolvers/types'

function context(headers: Record<string, string>) {
	const fetch: GuardedFetch = async (input) => {
		const url = typeof input === 'string' ? new URL(input) : input
		return { response: new Response('<html></html>', { status: 200, headers }), url, abort: () => undefined }
	}
	return { fetch, signal: new AbortController().signal }
}

const source = (resolver: string): ResolvedSource => ({ resolver, url: 'https://files.example.test/x', headers: {}, filenameHint: null })

describe('probeSource and web pages', () => {
	test('refuses an HTML page from a resolver link', async () => {
		const error = await probeSource(source('google-drive'), context({ 'content-type': 'text/html; charset=utf-8' })).catch((caught: unknown) => caught)
		expect(error).toBeInstanceOf(ResolverError)
		expect((error as Error).message).toContain('web page')
	})

	test('accepts HTML that is sent as an attachment', async () => {
		const result = await probeSource(source('dropbox'), context({ 'content-type': 'text/html', 'content-disposition': 'attachment; filename="page.html"' }))
		expect(result.filename).toBe('page.html')
	})

	test('accepts HTML for plain direct links and binaries for resolvers', async () => {
		await expect(probeSource(source('direct'), context({ 'content-type': 'text/html' }))).resolves.toBeDefined()
		await expect(probeSource(source('pixeldrain'), context({ 'content-type': 'application/octet-stream' }))).resolves.toBeDefined()
	})
})
