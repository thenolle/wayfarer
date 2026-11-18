import { describe, expect, test } from 'bun:test'
import { search } from '../src/search'
import type { SearchEntry } from '../src/types'

const entries: SearchEntry[] = [
	{ path: 'a', title: 'Docker', section: 'Deployment', description: 'Run with Docker Compose', headings: ['Volumes'], text: 'Mount a volume for downloads' },
	{ path: 'b', title: 'Configuration', section: 'Start', description: 'Environment variables', headings: ['Storage'], text: 'Set the download directory' }
]

describe('search', () => {
	test('ranks title matches first', () => {
		expect(search(entries, 'docker')[0]?.entry.path).toBe('a')
	})

	test('requires every word to match somewhere', () => {
		expect(search(entries, 'docker storage')).toEqual([])
	})

	test('returns nothing for an empty query and builds a snippet around the match', () => {
		expect(search(entries, '   ')).toEqual([])
		expect(search(entries, 'directory')[0]?.snippet).toContain('directory')
	})
})
