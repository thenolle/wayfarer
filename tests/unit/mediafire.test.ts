import { describe, expect, test } from 'bun:test'
import { findMediafireLink, MediafireResolver } from '../../src/downloads/resolvers/mediafire'

const PAGE = new URL('https://www.mediafire.com/file/abc123/archive.zip/file')
const DIRECT = 'https://download1234.mediafire.com/x/archive.zip'

describe('findMediafireLink', () => {
	test('prefers the decoded scrambled link', () => {
		const scrambled = Buffer.from(DIRECT).toString('base64')
		const html = `<a class="input" href="javascript:void(0)" data-scrambled-url="${scrambled}" id="downloadButton">Download</a>`
		expect(findMediafireLink(html, PAGE)?.href).toBe(DIRECT)
	})

	test('falls back to a plain href, whatever the attribute order', () => {
		const html = `<a id="downloadButton" aria-label="Download file" href="${DIRECT}?a=1&amp;b=2">Download</a>`
		expect(findMediafireLink(html, PAGE)?.href).toBe(`${DIRECT}?a=1&b=2`)
	})

	test('ignores script links and pages without the button', () => {
		expect(findMediafireLink('<a id="downloadButton" href="javascript:void(0)">x</a>', PAGE)).toBeNull()
		expect(findMediafireLink('<a href="https://example.test/data-href">x</a>', PAGE)).toBeNull()
	})
})

describe('MediafireResolver', () => {
	const resolver = new MediafireResolver()

	test('claims file pages only', () => {
		expect(resolver.canResolve(PAGE)).toBe(true)
		expect(resolver.canResolve(new URL('https://mediafire.com/download/abc123'))).toBe(true)
		expect(resolver.canResolve(new URL(DIRECT))).toBe(false)
		expect(resolver.canResolve(new URL('https://www.mediafire.com/folder/abc123/stuff'))).toBe(false)
		expect(resolver.canResolve(new URL('https://evil.test/file/abc123'))).toBe(false)
	})
})
