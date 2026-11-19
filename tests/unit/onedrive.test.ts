import { describe, expect, test } from 'bun:test'
import { OneDriveResolver } from '../../src/downloads/resolvers/onedrive'

describe('OneDriveResolver', () => {
	const resolver = new OneDriveResolver()

	test('claims personal OneDrive links only', () => {
		expect(resolver.canResolve(new URL('https://1drv.ms/u/s!AbCdEf'))).toBe(true)
		expect(resolver.canResolve(new URL('https://onedrive.live.com/?cid=1&resid=2'))).toBe(true)
		expect(resolver.canResolve(new URL('https://contoso-my.sharepoint.com/:f:/g/x'))).toBe(false)
		expect(resolver.canResolve(new URL('https://evil.test/1drv.ms'))).toBe(false)
	})

	test('encodes the sharing link the way the Shares API expects', async () => {
		const link = 'https://1drv.ms/u/s!AbCdEf?e=x/+y'
		const expected = 'u!' + Buffer.from(new URL(link).href).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
		expect((await resolver.resolve(new URL(link))).url).toBe(`https://api.onedrive.com/v1.0/shares/${expected}/root/content`)
	})
})
