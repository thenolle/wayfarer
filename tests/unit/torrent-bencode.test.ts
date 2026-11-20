import { describe, expect, test } from 'bun:test'
import { BencodeError, decodeBencode } from '../../src/downloads/torrent/bencode'
import type { ValueSpans } from '../../src/downloads/torrent/bencode'

const text = (value: string): Uint8Array => new TextEncoder().encode(value)

describe('decodeBencode', () => {
	test('reads integers, strings, lists and dictionaries', () => {
		const { value, end } = decodeBencode(text('d1:ai-5e1:bl3:foo3:baree'))
		expect(end).toBe(24)
		expect(value instanceof Map).toBe(true)
		if (!(value instanceof Map)) return
		expect(value.get('a')).toBe(-5)
		const list = value.get('b')
		expect(Array.isArray(list) ? list.map((item) => (item instanceof Uint8Array ? new TextDecoder().decode(item) : '')) : []).toEqual(['foo', 'bar'])
	})

	test('records the byte range of top-level values', () => {
		const source = 'd3:fooi1e4:infod4:name1:xee'
		const spans: ValueSpans = new Map()
		decodeBencode(text(source), spans)
		const start = source.indexOf('d4:name')
		expect(spans.get('info')).toEqual([start, start + 'd4:name1:xe'.length])
	})

	test.each([
		['an unterminated integer', 'i12'],
		['a malformed integer', 'i1.5e'],
		['a string longer than the data', '5:abc'],
		['an unterminated list', 'l'],
		['unknown data', 'x'],
		['empty data', ''],
		['deep nesting', `${'l'.repeat(100)}${'e'.repeat(100)}`]
	])('rejects %s', (_label, source) => {
		expect(() => decodeBencode(text(source))).toThrow(BencodeError)
	})
})
