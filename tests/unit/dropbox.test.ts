import { describe, expect, test } from 'bun:test'
import { DropboxResolver } from '../../src/downloads/resolvers/dropbox'

describe('DropboxResolver', () => {
	const resolver = new DropboxResolver()

	test('claims shared file and folder links on Dropbox only', () => {
		expect(resolver.canResolve(new URL('https://www.dropbox.com/scl/fi/abc123/My%20File.zip?rlkey=k&dl=0'))).toBe(true)
		expect(resolver.canResolve(new URL('https://dropbox.com/s/abc123/notes.txt?dl=0'))).toBe(true)
		expect(resolver.canResolve(new URL('https://www.dropbox.com/home'))).toBe(false)
		expect(resolver.canResolve(new URL('https://dl.dropboxusercontent.com/s/abc123/notes.txt'))).toBe(false)
		expect(resolver.canResolve(new URL('https://evil.test/s/abc123/notes.txt'))).toBe(false)
	})

	test('forces a download, keeps the other parameters and names the file', async () => {
		const source = await resolver.resolve(new URL('https://www.dropbox.com/scl/fi/abc123/My%20File.zip?rlkey=k&dl=0&raw=1'))
		const target = new URL(source.url)
		expect(target.searchParams.get('dl')).toBe('1')
		expect(target.searchParams.get('rlkey')).toBe('k')
		expect(target.searchParams.has('raw')).toBe(false)
		expect(source.filenameHint).toBe('My File.zip')
		expect(source.resolver).toBe('dropbox')
	})

	test('names old-style links and gives no name when the link has none', async () => {
		expect((await resolver.resolve(new URL('https://www.dropbox.com/s/abc123/notes.txt?dl=0'))).filenameHint).toBe('notes.txt')
		expect((await resolver.resolve(new URL('https://www.dropbox.com/s/abc123?dl=0'))).filenameHint).toBeNull()
	})

	test('explains that folders are not supported', async () => {
		const folder = new URL('https://www.dropbox.com/scl/fo/abc123/def?rlkey=k')
		expect(resolver.canResolve(folder)).toBe(true)
		await expect(resolver.resolve(folder)).rejects.toThrow('folders')
	})
})
