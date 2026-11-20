export class BencodeError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'BencodeError'
	}
}

export type Bencode = number | Uint8Array | Bencode[] | Map<string, Bencode>

export type ValueSpans = Map<string, readonly [number, number]>

export interface Decoded {
	readonly value: Bencode
	readonly end: number
}

const MAX_DEPTH = 32
const BYTE_I = 0x69
const BYTE_L = 0x6c
const BYTE_D = 0x64
const BYTE_E = 0x65
const BYTE_COLON = 0x3a
const BYTE_ZERO = 0x30
const BYTE_NINE = 0x39

function ascii(bytes: Uint8Array, start: number, end: number): string {
	let text = ''
	for (let index = start; index < end; index += 1) text += String.fromCharCode(bytes[index] ?? 0)
	return text
}

function readInteger(bytes: Uint8Array, position: number): Decoded {
	let end = position + 1
	while (bytes[end] !== BYTE_E) {
		if (end >= bytes.length) throw new BencodeError('An integer is not terminated')
		end += 1
	}
	const text = ascii(bytes, position + 1, end)
	if (!/^-?\d+$/.test(text)) throw new BencodeError('An integer is malformed')
	const value = Number(text)
	if (!Number.isSafeInteger(value)) throw new BencodeError('An integer is too large')
	return { value, end: end + 1 }
}

function readString(bytes: Uint8Array, position: number): Decoded {
	let colon = position
	while (bytes[colon] !== BYTE_COLON) {
		const byte = bytes[colon]
		if (byte === undefined || byte < BYTE_ZERO || byte > BYTE_NINE) throw new BencodeError('A string length is malformed')
		colon += 1
	}
	const length = Number(ascii(bytes, position, colon))
	const start = colon + 1
	if (!Number.isSafeInteger(length) || start + length > bytes.length) throw new BencodeError('A string is longer than the data')
	return { value: bytes.subarray(start, start + length), end: start + length }
}

function readList(bytes: Uint8Array, position: number, depth: number): Decoded {
	const items: Bencode[] = []
	let cursor = position + 1
	while (bytes[cursor] !== BYTE_E) {
		if (cursor >= bytes.length) throw new BencodeError('A list is not terminated')
		const item = read(bytes, cursor, depth + 1, undefined)
		items.push(item.value)
		cursor = item.end
	}
	return { value: items, end: cursor + 1 }
}

function readDictionary(bytes: Uint8Array, position: number, depth: number, spans: ValueSpans | undefined): Decoded {
	const entries = new Map<string, Bencode>()
	let cursor = position + 1
	while (bytes[cursor] !== BYTE_E) {
		if (cursor >= bytes.length) throw new BencodeError('A dictionary is not terminated')
		const key = read(bytes, cursor, depth + 1, undefined)
		if (!(key.value instanceof Uint8Array)) throw new BencodeError('A dictionary key is not a string')
		const name = ascii(key.value, 0, key.value.length)
		const item = read(bytes, key.end, depth + 1, undefined)
		if (spans !== undefined && depth === 0) spans.set(name, [key.end, item.end])
		entries.set(name, item.value)
		cursor = item.end
	}
	return { value: entries, end: cursor + 1 }
}

function read(bytes: Uint8Array, position: number, depth: number, spans: ValueSpans | undefined): Decoded {
	if (depth > MAX_DEPTH) throw new BencodeError('The data is nested too deeply')
	const byte = bytes[position]
	if (byte === undefined) throw new BencodeError('The data ends too early')
	if (byte === BYTE_I) return readInteger(bytes, position)
	if (byte === BYTE_L) return readList(bytes, position, depth)
	if (byte === BYTE_D) return readDictionary(bytes, position, depth, spans)
	if (byte >= BYTE_ZERO && byte <= BYTE_NINE) return readString(bytes, position)
	throw new BencodeError(`Unexpected data at byte ${position}`)
}

/**
 * Decodes one bencoded value from the start of `bytes`.
 *
 * When `spans` is given, the byte range of every top-level dictionary value is
 * recorded under its key. A torrent's info hash is the SHA-1 of the exact bytes
 * of its `info` value, so those ranges must be kept.
 *
 * @throws {BencodeError} when the data is malformed.
 */
export function decodeBencode(bytes: Uint8Array, spans?: ValueSpans): Decoded {
	return read(bytes, 0, 0, spans)
}