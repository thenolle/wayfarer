import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { BlockedDestinationError } from '../downloads/http/errors'
import { ipv4InRange, isBlockedAddress, parseIpv4, parseIpv4Cidr, parseIpv6 } from './ip'
import type { Ipv4Range } from './ip'

export type HostResolver = (hostname: string) => Promise<readonly string[]>

const systemResolver: HostResolver = async (hostname) => {
	const entries = await lookup(hostname, { all: true, verbatim: true })
	return entries.map((entry) => entry.address)
}

type AllowRule =
	| { readonly kind: 'host'; readonly host: string }
	| { readonly kind: 'ipv4'; readonly range: Ipv4Range }
	| { readonly kind: 'ipv6'; readonly key: string }

function parseRule(entry: string): AllowRule {
	const text = entry.trim()
	const range = parseIpv4Cidr(text)
	if (range !== null) return { kind: 'ipv4', range }
	const groups = parseIpv6(text)
	if (groups !== null && isIP(text) === 6) return { kind: 'ipv6', key: groups.join(':') }
	if (text === '' || /[/\s]/.test(text)) throw new Error(`Invalid private network entry "${text}"`)
	return { kind: 'host', host: text.toLowerCase() }
}

/**
 * Decides which destinations downloads may contact.
 *
 * By default only public addresses are allowed. Loopback, private,
 * link-local, multicast and reserved ranges are refused for IPv4 and IPv6,
 * including IPv4-mapped IPv6 forms. Trusted private destinations are allowed
 * explicitly through `allowed`, as hostnames, IP addresses or IPv4 CIDR ranges.
 *
 * Hostnames are resolved and every returned address must be allowed. This
 * check runs before each request and each redirect hop. It cannot stop DNS
 * rebinding on its own: the fetch implementation resolves the name again when
 * it connects, so an attacker-controlled DNS server could answer differently
 * the second time. See docs/architecture/resolvers-and-networking.md.
 */
export class NetworkPolicy {
	private readonly rules: readonly AllowRule[]

	constructor(allowed: readonly string[] = [], private readonly resolveHost: HostResolver = systemResolver) {
		this.rules = allowed.map(parseRule)
	}

	/**
	 * @throws {BlockedDestinationError} when the URL may not be contacted.
	 */
	async assertAllowed(url: URL): Promise<void> {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedDestinationError('Only http and https URLs are supported')
		if (url.username !== '' || url.password !== '') throw new BlockedDestinationError('URLs with embedded credentials are not supported')
		const hostname = (url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname).toLowerCase().replace(/\.$/, '')
		if (isIP(hostname) !== 0) {
			this.assertAddress(hostname)
			return
		}
		if (this.rules.some((rule) => rule.kind === 'host' && rule.host === hostname)) return
		const addresses = await this.resolveHost(hostname)
		if (addresses.length === 0) throw new BlockedDestinationError('The host name could not be resolved')
		for (const address of addresses) this.assertAddress(address)
	}

	private assertAddress(address: string): void {
		if (isBlockedAddress(address) && !this.isExplicitlyAllowed(address)) throw new BlockedDestinationError('The destination address is not allowed')
	}

	private isExplicitlyAllowed(address: string): boolean {
		const v4 = parseIpv4(address)
		if (v4 !== null) return this.rules.some((rule) => rule.kind === 'ipv4' && ipv4InRange(v4, rule.range))
		const groups = parseIpv6(address)
		if (groups === null) return false
		const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups
		if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
			const mapped = g6 * 65536 + g7
			return this.rules.some((rule) => rule.kind === 'ipv4' && ipv4InRange(mapped, rule.range))
		}
		const key = groups.join(':')
		return this.rules.some((rule) => rule.kind === 'ipv6' && rule.key === key)
	}
}
