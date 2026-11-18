import { describe, expect, test } from 'bun:test'
import { fileKindOf, hostOf } from '../../src/ui/display'

describe('fileKindOf', () => {
	test('sorts files by extension, ignoring case', () => {
		expect(fileKindOf('backup.tar.gz')).toBe('archive')
		expect(fileKindOf('Movie.MKV')).toBe('video')
		expect(fileKindOf('song.flac')).toBe('audio')
		expect(fileKindOf('setup.exe')).toBe('package')
		expect(fileKindOf('notes.txt')).toBe('document')
	})

	test('falls back to a plain file', () => {
		expect(fileKindOf('README')).toBe('file')
		expect(fileKindOf('data.unknownext')).toBe('file')
	})
})

describe('hostOf', () => {
	test('returns the host without www, or nothing for bad input', () => {
		expect(hostOf('https://www.example.test/a/b?c=d')).toBe('example.test')
		expect(hostOf('not a url')).toBe('')
	})
})
