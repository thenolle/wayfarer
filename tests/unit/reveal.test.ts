import { describe, expect, test } from 'bun:test'
import { revealCommand } from '../../src/filesystem/reveal'

describe('revealCommand', () => {
	test('selects the file or opens its folder, per platform', () => {
		expect(revealCommand('C:\\a\\f.zip', true, 'win32')).toEqual(['explorer.exe', '/select,C:\\a\\f.zip'])
		expect(revealCommand('/home/u/f.zip', true, 'darwin')).toEqual(['open', '-R', '/home/u/f.zip'])
		expect(revealCommand('/home/u/f.zip', false, 'darwin')).toEqual(['open', '/home/u'])
		expect(revealCommand('/home/u/f.zip', true, 'linux')).toEqual(['xdg-open', '/home/u'])
	})
})
