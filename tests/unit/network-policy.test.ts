import { describe, expect, test } from 'bun:test'
import { BlockedDestinationError } from '../../src/downloads/http/errors'
import { isBlockedAddress } from '../../src/security/ip'
import { NetworkPolicy } from '../../src/security/network-policy'

describe('isBlockedAddress', () => {
	test.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'224.0.0.1',
		'255.255.255.255',
		'::',
		'::1',
		'fc00::1',
		'fd12:3456::1',
		'fe80::1',
		'ff02::1',
		'::ffff:127.0.0.1',
		'::ffff:10.0.0.1',
		'::ffff:7f00:1',
		'64:ff9b::7f00:1',
		'2002:7f00:1::1',
		'2001:db8::1',
		'not-an-ip'
	])('blocks %s', (address) => {
		expect(isBlockedAddress(address)).toBe(true)
	})

	test.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (address) => { expect(isBlockedAddress(address)).toBe(false) })
})

describe('NetworkPolicy', () => {
	const publicResolver = async (): Promise<readonly string[]> => ['93.184.216.34']

	test('allows public hosts', async () => {
		await new NetworkPolicy([], publicResolver).assertAllowed(new URL('https://example.test/file'))
	})

	test('rejects hosts that resolve to private addresses, including any mixed answer', async () => {
		const policy = new NetworkPolicy([], async () => ['93.184.216.34', '10.0.0.8'])
		expect(policy.assertAllowed(new URL('https://rebind.test/'))).rejects.toBeInstanceOf(BlockedDestinationError)
	})

	test('rejects private IP literals, including IPv6 and mapped forms', async () => {
		const policy = new NetworkPolicy([], publicResolver)
		for (const target of ['http://127.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/']) expect(policy.assertAllowed(new URL(target))).rejects.toBeInstanceOf(BlockedDestinationError)
	})

	test('rejects other schemes and embedded credentials', async () => {
		const policy = new NetworkPolicy([], publicResolver)
		expect(policy.assertAllowed(new URL('file:///etc/passwd'))).rejects.toBeInstanceOf(BlockedDestinationError)
		expect(policy.assertAllowed(new URL('ftp://example.test/x'))).rejects.toBeInstanceOf(BlockedDestinationError)
		expect(policy.assertAllowed(new URL('http://user:pass@example.test/'))).rejects.toBeInstanceOf(BlockedDestinationError)
	})

	test('allows explicitly trusted addresses, ranges and hostnames', async () => {
		const policy = new NetworkPolicy(['192.168.1.0/24', '127.0.0.1', 'nas.local', '::1'], async (host) => host === 'nas.local' ? ['192.168.50.5'] : ['93.184.216.34'])
		await policy.assertAllowed(new URL('http://192.168.1.77/'))
		await policy.assertAllowed(new URL('http://127.0.0.1:8080/'))
		await policy.assertAllowed(new URL('http://nas.local/'))
		await policy.assertAllowed(new URL('http://[::1]/'))
		expect(policy.assertAllowed(new URL('http://192.168.2.1/'))).rejects.toBeInstanceOf(BlockedDestinationError)
		expect(policy.assertAllowed(new URL('http://10.0.0.1/'))).rejects.toBeInstanceOf(BlockedDestinationError)
	})

	test('rejects invalid allow list entries', () => {
		expect(() => new NetworkPolicy(['10.0.0.0/99/1'])).toThrow()
	})
})
