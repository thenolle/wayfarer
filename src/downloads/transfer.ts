import type { DownloadRecord } from './domain/records'
import type { DownloadStatus } from './domain/status'
import { InvalidDownloadError } from './domain/validation'
import { ShuttingDownError } from './intake'
import type { AddDownloadInput } from './intake'

export const TRANSFER_VERSION = 1
export const MAX_IMPORT_ENTRIES = 500
export const MAX_IMPORT_BYTES = 2_000_000

export interface ExportedDownload {
	readonly url: string
	readonly filename: string
	readonly priority: number
	readonly expectedSha256: string | null
	/** For people reading the file; ignored on import. */
	readonly status: DownloadStatus
}

export interface TransferDocument {
	readonly version: typeof TRANSFER_VERSION
	readonly exportedAt: string
	readonly downloads: ExportedDownload[]
}

export interface ImportEntry {
	readonly url: string
	readonly filename: string | null
	readonly priority: number | null
	readonly expectedSha256: string | null
}

export interface ImportResult {
	readonly added: number
	readonly skipped: { readonly index: number; readonly message: string }[]
}

export interface ImportOptions {
	readonly allowDuplicate?: boolean
	readonly log?: (message: string, error: unknown) => void
}

/**
 * Builds the export file. It holds links, names, priorities and checksums, and
 * never file system paths.
 */
export function exportDownloads(records: readonly Pick<DownloadRecord, 'url' | 'filename' | 'priority' | 'expectedSha256' | 'status'>[], now: number): TransferDocument {
	return {
		version: TRANSFER_VERSION,
		exportedAt: new Date(now).toISOString(),
		downloads: records.map((record) => ({ url: record.url, filename: record.filename, priority: record.priority, expectedSha256: record.expectedSha256, status: record.status }))
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(item: unknown, index: number): ImportEntry {
	if (typeof item === 'string') return { url: item.trim(), filename: null, priority: null, expectedSha256: null }
	if (!isRecord(item) || typeof item['url'] !== 'string') throw new InvalidDownloadError(`Entry ${index + 1} needs a "url"`)
	const filename = item['filename']
	const priority = item['priority']
	const checksum = item['expectedSha256']
	return {
		url: item['url'].trim(),
		filename: typeof filename === 'string' && filename.trim() !== '' ? filename.trim() : null,
		priority: typeof priority === 'number' ? priority : null,
		expectedSha256: typeof checksum === 'string' && checksum.trim() !== '' ? checksum.trim() : null
	}
}

/**
 * Reads an export file, the raw API response (`{ "data": ... }`), a bare list,
 * or a list of link strings.
 *
 * @throws {InvalidDownloadError} when the shape is wrong or the list is too long.
 */
export function parseImport(input: unknown): ImportEntry[] {
	let root: unknown = input
	if (isRecord(root) && isRecord(root['data'])) root = root['data']
	if (isRecord(root)) {
		const version = root['version']
		if (version !== undefined && version !== TRANSFER_VERSION) throw new InvalidDownloadError(`Unsupported file version ${String(version)}`)
		root = root['downloads']
	}
	if (!Array.isArray(root)) throw new InvalidDownloadError('Expected a list of downloads')
	if (root.length === 0) throw new InvalidDownloadError('The list is empty')
	if (root.length > MAX_IMPORT_ENTRIES) throw new InvalidDownloadError(`Import at most ${MAX_IMPORT_ENTRIES} links at a time`)
	return root.map((item: unknown, index: number) => parseEntry(item, index))
}

/**
 * Adds every entry through the normal intake, so validation, duplicate
 * detection and destination rules apply. A rejected entry is skipped and
 * reported; a service that is shutting down stops the import.
 */
export async function importDownloads(intake: { add(input: AddDownloadInput): Promise<unknown> }, entries: readonly ImportEntry[], options: ImportOptions = {}): Promise<ImportResult> {
	const skipped: { index: number; message: string }[] = []
	let added = 0
	for (const [index, entry] of entries.entries()) {
		const input: AddDownloadInput = {
			url: entry.url,
			...(entry.filename === null ? {} : { filename: entry.filename }),
			...(entry.priority === null ? {} : { priority: entry.priority }),
			...(entry.expectedSha256 === null ? {} : { expectedSha256: entry.expectedSha256 }),
			...(options.allowDuplicate === true ? { allowDuplicate: true } : {})
		}
		try {
			await intake.add(input)
			added += 1
		} catch (error) {
			if (error instanceof ShuttingDownError) throw error
			if (error instanceof InvalidDownloadError) {
				skipped.push({ index, message: error.message })
				continue
			}
			;(options.log ?? ((message: string, cause: unknown) => console.error(`[wayfarer] ${message}`, cause)))('an imported link could not be added', error)
			skipped.push({ index, message: 'The link could not be added' })
		}
	}
	return { added, skipped }
}

export function describeImportResult(result: ImportResult): string {
	const count = `${result.added} ${result.added === 1 ? 'download' : 'downloads'}`
	return result.skipped.length === 0 ? `Imported ${count}` : `Imported ${count}; ${result.skipped.length} skipped`
}
