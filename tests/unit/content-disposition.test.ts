import { describe, expect, test } from 'bun:test'
import { filenameFromUrl, parseContentDisposition } from '../../src/downloads/http/content-disposition'

describe('parseContentDisposition', () => {
	test('reads quoted and unquoted filenames', () => {
		expect(parseContentDisposition('attachment; filename="report.pdf"')).toBe('report.pdf')
		expect(parseContentDisposition('attachment; filename=report.pdf')).toBe('report.pdf')
	})

	test('keeps semicolons and escaped quotes inside quoted names', () => {
		expect(parseContentDisposition('attachment; filename="a;b.txt"')).toBe('a;b.txt')
		expect(parseContentDisposition('attachment; filename="say \\"hi\\".txt"')).toBe('say "hi".txt')
	})

	test('decodes RFC 5987 UTF-8 and ISO-8859-1 values', () => {
		expect(parseContentDisposition("attachment; filename*=UTF-8''%E2%82%AC%20rates.txt")).toBe('€ rates.txt')
		expect(parseContentDisposition("attachment; filename*=iso-8859-1'en'caf%E9.txt")).toBe('café.txt')
	})

	test('prefers the extended form over the plain form', () => {
		expect(parseContentDisposition('attachment; filename="fallback.txt"; filename*=UTF-8\'\'real%20name.txt')).toBe('real name.txt')
	})

	test('falls back to the plain form when the extended form is invalid', () => {
		expect(parseContentDisposition('attachment; filename="plain.txt"; filename*=UTF-8\'\'%ZZ.txt')).toBe('plain.txt')
		expect(parseContentDisposition("attachment; filename*=EBCDIC''x.txt; filename=\"plain.txt\"")).toBe('plain.txt')
	})

	test('returns null for missing or empty names', () => {
		expect(parseContentDisposition(null)).toBeNull()
		expect(parseContentDisposition('inline')).toBeNull()
		expect(parseContentDisposition('attachment; filename=""')).toBeNull()
	})
})

describe('filenameFromUrl', () => {
	test('uses the decoded last path segment', () => {
		expect(filenameFromUrl(new URL('https://example.test/files/my%20file.zip?token=1'))).toBe('my file.zip')
	})

	test('returns null for the root path', () => {
		expect(filenameFromUrl(new URL('https://example.test/'))).toBeNull()
	})
})
