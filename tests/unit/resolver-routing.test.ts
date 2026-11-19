import { describe, expect, test } from 'bun:test'
import { createDefaultResolvers } from '../../src/downloads/resolvers/registry'

describe('resolver routing', () => {
	const registry = createDefaultResolvers()
	const nameOf = (link: string): string => registry.find(new URL(link)).name

	test('sends each host to its resolver', () => {
		expect(nameOf('https://github.com/o/r/blob/main/a.txt')).toBe('github')
		expect(nameOf('https://github.com/o/r/releases/download/v1/a.zip')).toBe('direct')
		expect(nameOf('https://drive.google.com/file/d/19eYCYiVuJ3CgYwfAeYB2tG_RfdoJPAHZ/view')).toBe('google-drive')
		expect(nameOf('https://1drv.ms/u/s!AbCdEf')).toBe('onedrive')
		expect(nameOf('https://www.dropbox.com/s/abc/f.zip?dl=0')).toBe('dropbox')
		expect(nameOf('https://example.com/a.zip')).toBe('direct')
	})
})
