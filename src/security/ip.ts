export interface Ipv4Range {
	readonly base: number
	readonly prefix: number
}

/**
 * Parses a dotted IPv4 address into an unsigned 32-bit number.
 */
export function parseIpv4(text: string): number | null {
	const parts = text.split('.')
	if (parts.length !== 4) return null
	let value = 0
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null
		const octet = Number(part)
		if (octet > 255) return null
		value = value * 256 + octet
	}
	return value
}

/**
 * Parses an IPv4 address or `address/prefix` range.
 */
export function parseIpv4Cidr(text: string): Ipv4Range | null {
	const [address, length, ...rest] = text.split('/')
	if (address === undefined || rest.length > 0) return null
	const base = parseIpv4(address)
	if (base === null) return null
	if (length !== undefined && !/^\d{1,2}$/.test(length)) return null
	const prefix = length === undefined ? 32 : Number(length)
	if (prefix > 32) return null
	const size = 2 ** (32 - prefix)
	return { base: Math.floor(base / size) * size, prefix }
}

export function ipv4InRange(address: number, range: Ipv4Range): boolean {
	return address >= range.base && address < range.base + 2 ** (32 - range.prefix)
}

/**
 * Parses an IPv6 address (including `::` compression, an embedded IPv4 tail
 * and a zone suffix) into eight 16-bit groups.
 */
export function parseIpv6(input: string): number[] | null {
	let text = input.split('%')[0] ?? ''
	if (text.includes('.')) {
		const cut = text.lastIndexOf(':')
		const v4 = parseIpv4(text.slice(cut + 1))
		if (v4 === null) return null
		text = `${text.slice(0, cut + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
	}
	const halves = text.split('::')
	if (halves.length > 2) return null
	const parseGroups = (part: string): number[] | null => {
		if (part === '') return []
		const groups: number[] = []
		for (const group of part.split(':')) {
			if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
			groups.push(Number.parseInt(group, 16))
		}
		return groups
	}
	const head = parseGroups(halves[0] ?? '')
	const tail = halves.length === 2 ? parseGroups(halves[1] ?? '') : []
	if (head === null || tail === null) return null
	if (halves.length === 1) return head.length === 8 ? head : null
	const missing = 8 - head.length - tail.length
	if (missing < 1) return null
	return [...head, ...new Array<number>(missing).fill(0), ...tail]
}

const BLOCKED_IPV4_RANGES: readonly Ipv4Range[] = [
	'0.0.0.0/8',
	'10.0.0.0/8',
	'100.64.0.0/10',
	'127.0.0.0/8',
	'169.254.0.0/16',
	'172.16.0.0/12',
	'192.0.0.0/24',
	'192.0.2.0/24',
	'192.88.99.0/24',
	'192.168.0.0/16',
	'198.18.0.0/15',
	'198.51.100.0/24',
	'203.0.113.0/24',
	'224.0.0.0/4',
	'240.0.0.0/4'
].flatMap((cidr) => {
	const range = parseIpv4Cidr(cidr)
	return range === null ? [] : [range]
})

/**
 * True for loopback, private, link-local, carrier-grade NAT, documentation,
 * benchmarking, multicast and reserved IPv4 addresses.
 */
export function isBlockedIpv4(address: number): boolean {
	return BLOCKED_IPV4_RANGES.some((range) => ipv4InRange(address, range))
}

/**
 * True for unspecified, loopback, unique-local, link-local, site-local,
 * multicast, documentation, Teredo and discard IPv6 addresses. Addresses that
 * embed an IPv4 address (IPv4-mapped, NAT64, 6to4) are judged by that address.
 */
export function isBlockedIpv6(groups: readonly number[]): boolean {
	const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups
	const embedded = g6 * 65536 + g7
	if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
		if (g5 === 0xffff) return isBlockedIpv4(embedded)
		if (g5 === 0) return true
	}
	if (g0 === 0x64 && g1 === 0xff9b) return g2 !== 0 || g3 !== 0 || g4 !== 0 || g5 !== 0 ? true : isBlockedIpv4(embedded)
	if (g0 === 0x2002) return isBlockedIpv4(g1 * 65536 + g2)
	if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true
	if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true
	return ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0 || (g0 & 0xff00) === 0xff00)
}

/**
 * True when `address` must not be contacted by default. Text that is not a
 * valid IP address is treated as blocked.
 */
export function isBlockedAddress(address: string): boolean {
	const v4 = parseIpv4(address)
	if (v4 !== null) return isBlockedIpv4(v4)
	const v6 = parseIpv6(address)
	return v6 === null ? true : isBlockedIpv6(v6)
}
