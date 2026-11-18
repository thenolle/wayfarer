import { describe, expect, test } from 'bun:test'
import { BrowserOnlyResolver, DATANODES } from '../../src/downloads/resolvers/browser-only'
import type { ResolverContext } from '../../src/downloads/resolvers/types'

describe('BrowserOnlyResolver', () => {
	const resolver = new BrowserOnlyResolver(DATANODES)

	test('claims file pages only', () => {
		expect(resolver.canResolve(new URL('https://datanodes.to/lg27gia8ir5x'))).toBe(true)
		expect(resolver.canResolve(new URL('https://www.datanodes.to/lg27gia8ir5x/file.rar'))).toBe(true)
		expect(resolver.canResolve(new URL('https://datanodes.to/download'))).toBe(false)
		expect(resolver.canResolve(new URL('https://datanodes.to/pages/faq'))).toBe(false)
		expect(resolver.canResolve(new URL('https://example.test/lg27gia8ir5x'))).toBe(false)
	})

	test('explains that a browser is needed', async () => {
		const context = {} as ResolverContext
		expect(resolver.resolve(new URL('https://datanodes.to/lg27gia8ir5x'), context)).rejects.toThrow('CAPTCHA')
	})
})
