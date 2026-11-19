import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { isAbsolute, parse, relative, resolve } from 'node:path'
import { DEFAULT_LOCATION_ID, LocationError } from './locations'
import type { DownloadLocation } from './locations'

const KEY = 'download_locations'
const MAX_USER_LOCATIONS = 32
const MAX_LABEL_LENGTH = 40

export interface ManagedLocation extends DownloadLocation {
	readonly managed: 'default' | 'config' | 'user'
}

export interface KeyValueStore {
	get(key: string): string | null
	set(key: string, value: string): void
}

export class LocationInUseError extends LocationError {
	constructor(message: string) {
		super(message)
		this.name = 'LocationInUseError'
	}
}

export function isInside(directory: string, path: string): boolean {
	const difference = relative(directory, path)
	return difference !== '' && !difference.startsWith('..') && !isAbsolute(difference)
}

/**
 * The places downloads may be saved: the main directory and the entries of
 * `WAYFARER_LOCATIONS` (fixed) plus locations added at runtime, which are
 * stored in the settings table. A location that holds downloads cannot be
 * removed or moved, because finished files must stay inside a known location.
 */
export class LocationStore {
	private user: DownloadLocation[]

	constructor(private readonly fixed: readonly DownloadLocation[], private readonly store: KeyValueStore, private readonly countDownloadsIn: (directory: string) => number) {
		this.user = this.load()
	}

	current(): readonly DownloadLocation[] {
		return [...this.fixed, ...this.user]
	}

	list(): ManagedLocation[] {
		return [
			...this.fixed.map((location): ManagedLocation => ({ ...location, managed: location.id === DEFAULT_LOCATION_ID ? 'default' : 'config' })),
			...this.user.map((location): ManagedLocation => ({ ...location, managed: 'user' }))
		]
	}

	downloadsIn(location: DownloadLocation): number {
		return this.countDownloadsIn(location.path)
	}

	async add(label: string, path: string): Promise<DownloadLocation> {
		if (this.user.length >= MAX_USER_LOCATIONS) throw new LocationError(`You can add at most ${MAX_USER_LOCATIONS} locations`)
		const location = await this.build(label, path, null)
		this.user.push(location)
		this.save()
		return location
	}

	async update(id: string, changes: { readonly label?: string; readonly path?: string }): Promise<DownloadLocation> {
		const index = this.user.findIndex((location) => location.id === id)
		const existing = this.user[index]
		if (existing === undefined) throw this.unknown(id, 'changed')
		const requested = changes.path?.trim() ?? ''
		const path = requested === '' ? existing.path : resolve(requested)
		if (path !== existing.path) this.assertUnused(existing, 'moved')
		const updated = await this.build(changes.label ?? existing.label, path, existing)
		this.user[index] = updated
		this.save()
		return updated
	}

	remove(id: string): void {
		const existing = this.user.find((location) => location.id === id)
		if (existing === undefined) throw this.unknown(id, 'removed')
		this.assertUnused(existing, 'removed')
		this.user = this.user.filter((location) => location.id !== id)
		this.save()
	}

	private unknown(id: string, action: string): LocationError {
		return new LocationError(this.fixed.some((location) => location.id === id) ? `This location comes from the server configuration and cannot be ${action} here` : 'That location does not exist')
	}

	private assertUnused(location: DownloadLocation, action: string): void {
		const count = this.countDownloadsIn(location.path)
		if (count > 0) throw new LocationInUseError(`"${location.label}" holds ${count} download${count === 1 ? '' : 's'} and cannot be ${action}. Remove those downloads first.`)
	}

	private async build(rawLabel: string, rawPath: string, existing: DownloadLocation | null): Promise<DownloadLocation> {
		const label = rawLabel.trim()
		const path = rawPath.trim()
		if (label === '' || label.length > MAX_LABEL_LENGTH) throw new LocationError(`The name must be 1 to ${MAX_LABEL_LENGTH} characters`)
		if (!isAbsolute(path)) throw new LocationError('The path must be absolute, for example /srv/games or D:\\Games')
		const resolved = resolve(path)
		if (parse(resolved).root === resolved) throw new LocationError('Choose a folder, not the root of a drive')
		const others = this.current().filter((location) => location.id !== existing?.id)
		if (others.some((location) => location.label.toLowerCase() === label.toLowerCase())) throw new LocationError(`A location named "${label}" already exists`)
		if (others.some((location) => location.path === resolved)) throw new LocationError('Another location already uses that folder')
		if (existing === null || existing.path !== resolved) {
			try {
				await mkdir(resolved, { recursive: true })
				await access(resolved, constants.W_OK)
			} catch {
				throw new LocationError('That folder cannot be created or written to')
			}
		}
		return { id: existing?.id ?? this.uniqueId(label), label, path: resolved }
	}

	private uniqueId(label: string): string {
		const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'location'
		const taken = new Set(this.current().map((location) => location.id))
		let id = base
		for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
		return id
	}

	private load(): DownloadLocation[] {
		const raw = this.store.get(KEY)
		if (raw === null) return []
		try {
			const data = JSON.parse(raw) as unknown
			if (!Array.isArray(data)) return []
			return data.flatMap((item): DownloadLocation[] => {
				const entry = item as Partial<DownloadLocation> | null
				const valid = typeof entry?.id === 'string' && typeof entry.label === 'string' && typeof entry.path === 'string' && isAbsolute(entry.path)
				return valid && !this.fixed.some((location) => location.id === entry.id) ? [{ id: entry.id as string, label: entry.label as string, path: resolve(entry.path as string) }] : []
			})
		} catch {
			return []
		}
	}

	private save(): void {
		this.store.set(KEY, JSON.stringify(this.user))
	}
}
