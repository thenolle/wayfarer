import { describe, expect, test } from 'bun:test'
import { InvalidDownloadError } from '../../src/downloads/domain/validation'
import { ShuttingDownError } from '../../src/downloads/intake'
import type { AddDownloadInput } from '../../src/downloads/intake'
import { describeImportResult, exportDownloads, importDownloads, MAX_IMPORT_ENTRIES, parseImport } from '../../src/downloads/transfer'
import type { ImportEntry } from '../../src/downloads/transfer'

const NOW = 1_700_000_000_000

const records = [
	{ url: 'https://example.test/a.zip?t=1', filename: 'a.zip', priority: 5, expectedSha256: 'ab'.repeat(32), status: 'completed' as const, destination: '/srv/downloads/a.zip' },
	{ url: 'https://example.test/b.zip', filename: 'b.zip', priority: 0, expectedSha256: null, status: 'queued' as const, destination: '/srv/downloads/b.zip' }
]

const entry = (url: string, extra: Partial<ImportEntry> = {}): ImportEntry => ({ url, filename: null, priority: null, expectedSha256: null, ...extra })

function fakeIntake(fail: Record<string, unknown> = {}) {
	const inputs: AddDownloadInput[] = []
	const intake = {
		add: async (input: AddDownloadInput) => {
			inputs.push(input)
			const error = fail[input.url]
			if (error !== undefined) throw error
			return {}
		}
	}
	return { inputs, intake }
}

describe('exportDownloads', () => {
	test('lists links, names, priorities and checksums but no paths', () => {
		const document = exportDownloads(records, NOW)
		expect(document.version).toBe(1)
		expect(document.exportedAt).toBe('2023-11-14T22:13:20.000Z')
		expect(document.downloads[0]).toEqual({ url: 'https://example.test/a.zip?t=1', filename: 'a.zip', priority: 5, expectedSha256: 'ab'.repeat(32), status: 'completed' })
		expect(JSON.stringify(document)).not.toContain('/srv/downloads')
	})

	test('can be read back by parseImport', () => {
		const entries = parseImport(JSON.parse(JSON.stringify(exportDownloads(records, NOW))))
		expect(entries).toEqual([
			{ url: 'https://example.test/a.zip?t=1', filename: 'a.zip', priority: 5, expectedSha256: 'ab'.repeat(32) },
			{ url: 'https://example.test/b.zip', filename: 'b.zip', priority: 0, expectedSha256: null }
		])
	})
})

describe('parseImport', () => {
	test('accepts the raw API response, a bare list and plain links', () => {
		expect(parseImport({ data: { downloads: ['https://example.test/x'] } })).toEqual([entry('https://example.test/x')])
		expect(parseImport(['https://example.test/x', { url: ' https://example.test/y ', priority: 3, filename: ' n.bin ', ignored: true }])).toEqual([
			entry('https://example.test/x'),
			entry('https://example.test/y', { priority: 3, filename: 'n.bin' })
		])
	})

	test('rejects wrong shapes, versions and sizes', () => {
		for (const input of [[], {}, 'x', 5, null, { version: 2, downloads: ['https://example.test/x'] }, [{}], [{ url: 5 }]]) {
			expect(() => parseImport(input)).toThrow(InvalidDownloadError)
		}
		expect(() => parseImport(Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, () => 'https://example.test/x'))).toThrow(InvalidDownloadError)
		expect(parseImport(Array.from({ length: MAX_IMPORT_ENTRIES }, () => 'https://example.test/x'))).toHaveLength(MAX_IMPORT_ENTRIES)
	})
})

describe('importDownloads', () => {
	test('passes the fields on and leaves out what is not set', async () => {
		const { inputs, intake } = fakeIntake()
		const result = await importDownloads(intake, [entry('https://example.test/a'), entry('https://example.test/b', { filename: 'b.bin', priority: 2, expectedSha256: 'cd'.repeat(32) })])
		expect(result).toEqual({ added: 2, skipped: [] })
		expect(inputs[0]).toEqual({ url: 'https://example.test/a' })
		expect(inputs[1]).toEqual({ url: 'https://example.test/b', filename: 'b.bin', priority: 2, expectedSha256: 'cd'.repeat(32) })
	})

	test('only allows duplicates when asked to', async () => {
		const plain = fakeIntake()
		await importDownloads(plain.intake, [entry('https://example.test/a')])
		expect(plain.inputs[0]?.allowDuplicate).toBeUndefined()
		const allowed = fakeIntake()
		await importDownloads(allowed.intake, [entry('https://example.test/a')], { allowDuplicate: true })
		expect(allowed.inputs[0]?.allowDuplicate).toBe(true)
	})

	test('skips rejected links and reports why', async () => {
		const { intake } = fakeIntake({ 'https://example.test/bad': new InvalidDownloadError('The URL is not valid') })
		const result = await importDownloads(intake, [entry('https://example.test/ok'), entry('https://example.test/bad')])
		expect(result).toEqual({ added: 1, skipped: [{ index: 1, message: 'The URL is not valid' }] })
	})

	test('hides unexpected errors behind a generic message and logs them', async () => {
		const { intake } = fakeIntake({ 'https://example.test/boom': new Error('database exploded at /srv/secret') })
		const logs: string[] = []
		const result = await importDownloads(intake, [entry('https://example.test/boom')], { log: (message) => { logs.push(message) } })
		expect(result.skipped).toEqual([{ index: 0, message: 'The link could not be added' }])
		expect(logs).toHaveLength(1)
	})

	test('stops when the service is shutting down', async () => {
		const { inputs, intake } = fakeIntake({ 'https://example.test/a': new ShuttingDownError() })
		await expect(importDownloads(intake, [entry('https://example.test/a'), entry('https://example.test/b')])).rejects.toBeInstanceOf(ShuttingDownError)
		expect(inputs).toHaveLength(1)
	})
})

describe('describeImportResult', () => {
	test('words the outcome', () => {
		expect(describeImportResult({ added: 1, skipped: [] })).toBe('Imported 1 download')
		expect(describeImportResult({ added: 3, skipped: [{ index: 0, message: 'x' }] })).toBe('Imported 3 downloads; 1 skipped')
	})
})
