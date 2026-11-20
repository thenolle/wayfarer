import { InvalidDownloadError } from '../domain/validation'
import { BencodeError, decodeBencode } from './bencode'
import type { Bencode, ValueSpans } from './bencode'

export const TORRENT_RESOLVER = 'torrent'
export const MAX_TORRENT_BYTES = 8 * 1024 * 1024

const MAX_TRACKERS = 20
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TRACKER_PROTOCOLS = new Set(['http:', 'https:', 'udp:', 'ws:', 'wss:'])

/**
 * What Wayfarer knows about a torrent before it downloads anything. A magnet
 * link only has the hash, and maybe a name and trackers. A `.torrent` file
 * also has the name, size and file count.
 */
export interface TorrentMetadata {
	readonly infoHash: string
	readonly name: string | null
	readonly totalBytes: number | null
	readonly fileCount: number | null
	readonly trackers: readonly string[]
}

export function isMagnetLink(text: string): boolean {
	return /^magnet:/i.test(text.trim())
}

export function isTorrentUrl(text: string): boolean {
	try {
		const url = new URL(text.trim())
		return (url.protocol === 'http:' || url.protocol === 'https:') && url.pathname.toLowerCase().endsWith('.torrent')
	} catch {
		return false
	}
}

function base32ToHex(text: string): string | null {
	let bits = ''
	for (const character of text.toUpperCase()) {
		const index = BASE32_ALPHABET.indexOf(character)
		if (index < 0) return null
		bits += index.toString(2).padStart(5, '0')
	}
	let hex = ''
	for (let offset = 0; offset + 8 <= bits.length; offset += 8) hex += Number.parseInt(bits.slice(offset, offset + 8), 2).toString(16).padStart(2, '0')
	return hex.length === 40 ? hex : null
}

function validTrackers(candidates: readonly string[]): string[] {
	const trackers: string[] = []
	for (const candidate of candidates) {
		try {
			if (TRACKER_PROTOCOLS.has(new URL(candidate).protocol) && !trackers.includes(candidate)) trackers.push(candidate)
		} catch {
			continue
		}
	}
	return trackers.slice(0, MAX_TRACKERS)
}

/**
 * Reads a magnet link.
 *
 * @throws {InvalidDownloadError} when it is not a BitTorrent v1 magnet link.
 */
export function parseMagnet(text: string): TorrentMetadata {
	let url: URL
	try {
		url = new URL(text.trim())
	} catch {
		throw new InvalidDownloadError('The magnet link is not valid')
	}
	if (url.protocol !== 'magnet:') throw new InvalidDownloadError('The magnet link is not valid')
	const topic = url.searchParams.getAll('xt').find((value) => value.toLowerCase().startsWith('urn:btih:'))
	if (topic === undefined) throw new InvalidDownloadError('The magnet link has no BitTorrent info hash (xt=urn:btih:...)')
	const raw = topic.slice('urn:btih:'.length)
	const infoHash = /^[0-9a-f]{40}$/i.test(raw) ? raw.toLowerCase() : raw.length === 32 ? base32ToHex(raw) : null
	if (infoHash === null) throw new InvalidDownloadError('The info hash in the magnet link is not valid')
	const name = url.searchParams.get('dn')?.trim() ?? ''
	return { infoHash, name: name === '' ? null : name, totalBytes: null, fileCount: null, trackers: validTrackers(url.searchParams.getAll('tr')) }
}

/**
 * The stored form of a torrent link. Trackers are only kept for magnet links
 * the user typed; links made from a `.torrent` file leave them out because
 * private trackers put secrets in them.
 */
export function canonicalMagnet(metadata: TorrentMetadata, withTrackers: boolean): string {
	let link = `magnet:?xt=urn:btih:${metadata.infoHash}`
	if (metadata.name !== null) link += `&dn=${encodeURIComponent(metadata.name)}`
	if (withTrackers) for (const tracker of metadata.trackers) link += `&tr=${encodeURIComponent(tracker)}`
	return link
}

function textOf(value: Bencode | undefined): string | null {
	if (!(value instanceof Uint8Array)) return null
	const text = new TextDecoder().decode(value).trim()
	return text === '' ? null : text
}

function sizeOf(info: Map<string, Bencode>): { totalBytes: number; fileCount: number } | null {
	const length = info.get('length')
	if (typeof length === 'number') return { totalBytes: length, fileCount: 1 }
	const files = info.get('files')
	if (!Array.isArray(files)) return null
	let totalBytes = 0
	for (const file of files) {
		const size = file instanceof Map ? file.get('length') : undefined
		if (typeof size !== 'number') return null
		totalBytes += size
	}
	return { totalBytes, fileCount: files.length }
}

function trackersOf(root: Map<string, Bencode>): string[] {
	const found: string[] = []
	const announce = textOf(root.get('announce'))
	if (announce !== null) found.push(announce)
	const tiers = root.get('announce-list')
	if (Array.isArray(tiers)) {
		for (const tier of tiers) {
			if (!Array.isArray(tier)) continue
			for (const entry of tier) {
				const tracker = textOf(entry)
				if (tracker !== null) found.push(tracker)
			}
		}
	}
	return validTrackers(found)
}

function readTorrent(bytes: Uint8Array): TorrentMetadata {
	const spans: ValueSpans = new Map()
	const root = decodeBencode(bytes, spans).value
	if (!(root instanceof Map)) throw new BencodeError('The file is not a dictionary')
	const info = root.get('info')
	const span = spans.get('info')
	if (!(info instanceof Map) || span === undefined) throw new BencodeError('The file has no info dictionary')
	if (!(info.get('pieces') instanceof Uint8Array)) throw new InvalidDownloadError('This torrent only uses BitTorrent v2, which Wayfarer does not support yet')
	const infoHash = new Bun.CryptoHasher('sha1').update(bytes.subarray(span[0], span[1])).digest('hex')
	const size = sizeOf(info)
	return {
		infoHash,
		name: textOf(info.get('name.utf-8')) ?? textOf(info.get('name')),
		totalBytes: size?.totalBytes ?? null,
		fileCount: size?.fileCount ?? null,
		trackers: trackersOf(root)
	}
}

/**
 * Reads a `.torrent` file.
 *
 * @throws {InvalidDownloadError} when the file is empty, too large or not a v1 torrent.
 */
export function parseTorrentFile(bytes: Uint8Array): TorrentMetadata {
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_TORRENT_BYTES) throw new InvalidDownloadError('That .torrent file is empty or too large')
	try {
		return readTorrent(bytes)
	} catch (error) {
		if (error instanceof BencodeError) throw new InvalidDownloadError('That is not a valid .torrent file')
		throw error
	}
}
