import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { LocationInUseError, LocationStore } from '../../src/filesystem/location-store'
import { LocationError, parseLocations } from '../../src/filesystem/locations'

class MemoryStore {
	readonly values = new Map<string, string>()
	get(key: string): string | null { return this.values.get(key) ?? null }
	set(key: string, value: string): void { this.values.set(key, value) }
}

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'wayfarer-locations-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

function create(used = { count: 0 }, store = new MemoryStore()) {
	const fixed = parseLocations(join(root, 'main'), [`Config=${join(root, 'config')}`])
	return { used, store, fixed, locations: new LocationStore(fixed, store, () => used.count) }
}

describe('LocationStore', () => {
	test('adds a location, creates its folder and keeps it after a restart', async () => {
		const { locations, store, fixed, used } = create()
		const added = await locations.add('Games', join(root, 'games'))
		expect((await stat(added.path)).isDirectory()).toBe(true)
		expect(locations.list().map((location) => [location.label, location.managed])).toEqual([['Downloads', 'default'], ['Config', 'config'], ['Games', 'user']])
		expect(new LocationStore(fixed, store, () => used.count).current().map((location) => location.id)).toContain('games')
	})

	test('rejects relative paths, drive roots and duplicates', async () => {
		const { locations } = create()
		await locations.add('Games', join(root, 'games'))
		expect(locations.add('Other', 'relative/path')).rejects.toThrow('absolute')
		expect(locations.add('Root', parse(root).root)).rejects.toThrow('root')
		expect(locations.add('games', join(root, 'other'))).rejects.toThrow('already exists')
		expect(locations.add('Other', join(root, 'games'))).rejects.toThrow('already uses')
	})

	test('gives similar names distinct ids', async () => {
		const { locations } = create()
		const first = await locations.add('Movies', join(root, 'a'))
		const second = await locations.add('Movies!', join(root, 'b'))
		expect([first.id, second.id]).toEqual(['movies', 'movies-2'])
	})

	test('renames without changing the id and moves only when unused', async () => {
		const { locations, used } = create()
		const added = await locations.add('Games', join(root, 'games'))
		expect((await locations.update(added.id, { label: 'PC games' })).id).toBe(added.id)
		used.count = 2
		expect(locations.update(added.id, { path: join(root, 'moved') })).rejects.toBeInstanceOf(LocationInUseError)
		used.count = 0
		expect((await locations.update(added.id, { path: join(root, 'moved') })).path).toBe(join(root, 'moved'))
	})

	test('refuses to remove a location in use or one from the configuration', async () => {
		const { locations, used } = create()
		const added = await locations.add('Games', join(root, 'games'))
		used.count = 1
		expect(() => locations.remove(added.id)).toThrow(LocationInUseError)
		used.count = 0
		locations.remove(added.id)
		expect(locations.current().some((location) => location.id === added.id)).toBe(false)
		expect(() => locations.remove('config')).toThrow(LocationError)
		expect(() => locations.remove('default')).toThrow('configuration')
	})

	test('ignores corrupt stored data', () => {
		const store = new MemoryStore()
		store.set('download_locations', '{"nope":true}')
		expect(create(undefined, store).locations.current()).toHaveLength(2)
	})
})
