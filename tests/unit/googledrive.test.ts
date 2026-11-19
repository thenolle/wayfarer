import { describe, expect, test } from 'bun:test'
import { GoogleDriveResolver } from '../../src/downloads/resolvers/googledrive'

const ID = '19eYCYiVuJ3CgYwfAeYB2tG_RfdoJPAHZ'
const DOWNLOAD = `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`

describe('GoogleDriveResolver', () => {
	const resolver = new GoogleDriveResolver()

	test('claims file, open, uc and folder links only', () => {
		for (const link of [`https://drive.google.com/file/d/${ID}/view?usp=sharing`, `https://drive.google.com/file/u/0/d/${ID}/view`, `https://drive.google.com/open?id=${ID}`, `https://drive.google.com/uc?export=download&id=${ID}`, `https://docs.google.com/uc?id=${ID}`, 'https://drive.google.com/drive/folders/abc']) {
			expect(resolver.canResolve(new URL(link))).toBe(true)
		}
		for (const link of ['https://drive.google.com/file/d/abc/view', `https://docs.google.com/document/d/${ID}`, `https://example.test/file/d/${ID}`]) {
			expect(resolver.canResolve(new URL(link))).toBe(false)
		}
	})

	test('builds the download link from any supported form', async () => {
		for (const link of [`https://drive.google.com/file/d/${ID}/view`, `https://drive.google.com/open?id=${ID}`, `https://drive.google.com/uc?export=download&id=${ID}`]) {
			expect((await resolver.resolve(new URL(link))).url).toBe(DOWNLOAD)
		}
	})

	test('keeps the resource key', async () => {
		const source = await resolver.resolve(new URL(`https://drive.google.com/file/d/${ID}/view?resourcekey=0-abc`))
		expect(new URL(source.url).searchParams.get('resourcekey')).toBe('0-abc')
	})

	test('explains that folders are not supported', async () => {
		await expect(resolver.resolve(new URL('https://drive.google.com/drive/folders/abc'))).rejects.toThrow('folders')
	})
})
