import { describe, expect, test } from 'bun:test'
import { contentDisposition, parseRange } from '../../src/http/api/files'

describe('parseRange', () => {
	test.each([
		['bytes=0-9', { kind: 'partial', start: 0, end: 9 }],
		['bytes=90-', { kind: 'partial', start: 90, end: 99 }],
		['bytes=90-5000', { kind: 'partial', start: 90, end: 99 }],
		['bytes=-10', { kind: 'partial', start: 90, end: 99 }],
		['bytes=-500', { kind: 'partial', start: 0, end: 99 }],
		['bytes=100-', { kind: 'unsatisfiable' }],
		['bytes=-0', { kind: 'unsatisfiable' }],
		['bytes=5-1', { kind: 'full' }],
		['bytes=0-4,10-14', { kind: 'full' }],
		['items=0-1', { kind: 'full' }],
		['bytes=-', { kind: 'full' }]
	] as const)('%s', (header, expected) => {
		expect(parseRange(header, 100)).toEqual(expected)
	})

	test('has no range without a header and cannot satisfy ranges of an empty file', () => {
		expect(parseRange(null, 100)).toEqual({ kind: 'full' })
		expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' })
	})
})

describe('contentDisposition', () => {
	test('encodes plain names', () => {
		expect(contentDisposition('a b.txt')).toBe(`attachment; filename="a b.txt"; filename*=UTF-8''a%20b.txt`)
	})

	test('keeps an ASCII fallback for non-ASCII names', () => {
		expect(contentDisposition('résumé.pdf')).toBe(
			`attachment; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`
		)
	})

	test('cannot be broken out of with quotes or quote-like characters', () => {
		const header = contentDisposition(`a"b'c.txt`)
		expect(header).toContain('filename="a_b\'c.txt"')
		expect(header).toContain(`filename*=UTF-8''a%22b%27c.txt`)
	})
})
