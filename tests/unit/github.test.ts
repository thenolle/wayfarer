import { describe, expect, test } from 'bun:test'
import { GitHubResolver } from '../../src/downloads/resolvers/github'

describe('GitHubResolver', () => {
	const resolver = new GitHubResolver()

	test('claims file pages only', () => {
		expect(resolver.canResolve(new URL('https://github.com/o/r/blob/main/a.txt'))).toBe(true)
		expect(resolver.canResolve(new URL('https://github.com/o/r/releases/download/v1/a.zip'))).toBe(false)
		expect(resolver.canResolve(new URL('https://github.com/o/r'))).toBe(false)
		expect(resolver.canResolve(new URL('https://github.com.evil.test/o/r/blob/main/a.txt'))).toBe(false)
	})

	test('uses the raw link, keeps slashed refs and names the file', async () => {
		const source = await resolver.resolve(new URL('https://github.com/o/r/blob/feature/x/dir/My%20File.txt?plain=1'))
		expect(source.url).toBe('https://github.com/o/r/raw/feature/x/dir/My%20File.txt')
		expect(source.filenameHint).toBe('My File.txt')
	})
})
