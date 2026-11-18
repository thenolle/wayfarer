import { describe, expect, test } from 'bun:test'
import { ResolverError } from '../../src/downloads/http/errors'
import { assertNoChallenge } from '../../src/downloads/http/headers'

describe('assertNoChallenge', () => {
	test('refuses Cloudflare challenge pages with an explanation', () => {
		const response = new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } })
		expect(() => assertNoChallenge(response, 'Example')).toThrow(ResolverError)
		expect(() => assertNoChallenge(new Response('', { status: 403, headers: { 'cf-mitigated': 'Challenge' } }), 'Example')).toThrow('Cloudflare challenge')
	})

	test('leaves other responses to the normal status handling', () => {
		expect(() => assertNoChallenge(new Response('', { status: 403 }), 'Example')).not.toThrow()
		expect(() => assertNoChallenge(new Response('ok'), 'Example')).not.toThrow()
	})
})
