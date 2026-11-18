import { describe, expect, test } from 'bun:test'
import { join, resolve } from 'node:path'
import { PathEscapeError } from '../../src/filesystem/errors'
import { confineToLocations, DEFAULT_LOCATION_ID, LocationError, parseLocations, resolveDirectory } from '../../src/filesystem/locations'

const main = resolve('/wayfarer-test/main')
const games = resolve('/wayfarer-test/games')
const locations = parseLocations(main, [`Games=${games}`])

describe('parseLocations', () => {
	test('puts the main directory first and slugs the names', () => {
		expect(locations.map((location) => location.id)).toEqual([DEFAULT_LOCATION_ID, 'games'])
		expect(locations[1]?.path).toBe(games)
	})

	test('rejects malformed, relative and duplicate entries', () => {
		expect(() => parseLocations(main, ['Games'])).toThrow(LocationError)
		expect(() => parseLocations(main, ['Games=relative/path'])).toThrow(LocationError)
		expect(() => parseLocations(main, [`A=${games}`, `a=${games}`])).toThrow(LocationError)
		expect(() => parseLocations(main, [`Default=${games}`])).toThrow(LocationError)
	})
})

describe('resolveDirectory', () => {
	test('uses the location root or a nested subfolder', () => {
		expect(resolveDirectory(locations, 'games', '')).toBe(games)
		expect(resolveDirectory(locations, 'games', 'pc\\rpg/')).toBe(join(games, 'pc', 'rpg'))
	})

	test('refuses unknown locations, traversal and deep nesting', () => {
		expect(() => resolveDirectory(locations, 'nope', '')).toThrow(LocationError)
		expect(() => resolveDirectory(locations, 'games', '../outside')).toThrow(LocationError)
		expect(() => resolveDirectory(locations, 'games', 'a/b/c/d/e')).toThrow(LocationError)
	})
})

describe('confineToLocations', () => {
	test('accepts files in any location and rejects others', () => {
		expect(confineToLocations(locations, join(games, 'x.zip'))).toBe(join(games, 'x.zip'))
		expect(() => confineToLocations(locations, resolve('/elsewhere/x.zip'))).toThrow(PathEscapeError)
	})
})
