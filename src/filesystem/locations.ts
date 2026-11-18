import { isAbsolute, join, resolve } from 'node:path'
import { PathEscapeError } from './errors'
import { sanitizeFilename } from './filename'
import { resolveWithin } from './paths'

export const DEFAULT_LOCATION_ID = 'default'
const MAX_SUBFOLDER_DEPTH = 4

export interface DownloadLocation {
	readonly id: string
	readonly label: string
	readonly path: string
}

export class LocationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'LocationError'
	}
}

/**
 * Builds the list of places downloads may be saved: the main download
 * directory first (id `default`), then each `Name=/absolute/path` entry.
 *
 * @throws {LocationError} for a malformed, relative or duplicate entry.
 */
export function parseLocations(downloadDirectory: string, entries: readonly string[]): DownloadLocation[] {
	const locations: DownloadLocation[] = [{ id: DEFAULT_LOCATION_ID, label: 'Downloads', path: resolve(downloadDirectory) }]
	for (const entry of entries) {
		const separator = entry.indexOf('=')
		const label = separator === -1 ? '' : entry.slice(0, separator).trim()
		const path = separator === -1 ? '' : entry.slice(separator + 1).trim()
		const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
		if (label === '' || path === '' || id === '') throw new LocationError(`"${entry}" must look like Name=/absolute/path`)
		if (!isAbsolute(path)) throw new LocationError(`The path of "${label}" must be absolute`)
		if (locations.some((location) => location.id === id)) throw new LocationError(`The location name "${label}" is reserved or used twice`)
		locations.push({ id, label, path: resolve(path) })
	}
	return locations
}

/**
 * The directory for a chosen location and optional subfolder. Subfolder names
 * are cleaned like file names, and `..` is refused.
 *
 * @throws {LocationError} for an unknown location or an unsafe subfolder.
 */
export function resolveDirectory(locations: readonly DownloadLocation[], locationId: string, subfolder: string): string {
	const location = locations.find((candidate) => candidate.id === locationId)
	if (location === undefined) throw new LocationError('Choose one of the configured download locations')
	const segments = subfolder.split(/[\\/]+/).map((segment) => segment.trim()).filter((segment) => segment !== '' && segment !== '.')
	if (segments.some((segment) => segment === '..')) throw new LocationError('A folder name cannot contain ..')
	if (segments.length > MAX_SUBFOLDER_DEPTH) throw new LocationError(`Use at most ${MAX_SUBFOLDER_DEPTH} nested folders`)
	if (segments.length === 0) return location.path
	return resolveWithin(location.path, join(...segments.map((segment) => sanitizeFilename(segment))))
}

/**
 * Returns `path` resolved, if it lies inside any configured location.
 *
 * @throws {PathEscapeError} when it lies in none of them.
 */
export function confineToLocations(locations: readonly DownloadLocation[], path: string): string {
	for (const location of locations) {
		try {
			return resolveWithin(location.path, path)
		} catch (error) {
			if (!(error instanceof PathEscapeError)) throw error
		}
	}
	throw new PathEscapeError()
}
