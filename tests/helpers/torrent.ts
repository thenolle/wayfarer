export type Encodable = number | string | Uint8Array | Encodable[] | { readonly [key: string]: Encodable }

export function encode(value: Encodable): Uint8Array {
	if (typeof value === 'number') return new TextEncoder().encode(`i${value}e`)
	if (typeof value === 'string') return encode(new TextEncoder().encode(value))
	if (value instanceof Uint8Array) return new Uint8Array(Buffer.concat([Buffer.from(`${value.length}:`), value]))
	if (Array.isArray(value)) return new Uint8Array(Buffer.concat([Buffer.from('l'), ...value.map(encode), Buffer.from('e')]))
	const keys = Object.keys(value).sort()
	return new Uint8Array(Buffer.concat([Buffer.from('d'), ...keys.flatMap((key) => [encode(key), encode(value[key] ?? 0)]), Buffer.from('e')]))
}

export interface BuiltTorrent {
	readonly bytes: Uint8Array
	readonly infoHash: string
}

export interface TorrentOptions {
	readonly name?: string
	readonly length?: number
	readonly files?: readonly { readonly length: number; readonly path: readonly string[] }[]
	readonly announce?: string
	readonly withoutPieces?: boolean
}

/**
 * Builds a small valid v1 `.torrent` file and the info hash it must produce.
 */
export function buildTorrent(options: TorrentOptions = {}): BuiltTorrent {
	const info: Record<string, Encodable> = { name: options.name ?? 'sample.bin', 'piece length': 16_384 }
	if (options.withoutPieces !== true) info['pieces'] = new Uint8Array(20)
	if (options.files === undefined) info['length'] = options.length ?? 1000
	else info['files'] = options.files.map((file) => ({ length: file.length, path: [...file.path] }))
	const root: Record<string, Encodable> = { info }
	if (options.announce !== undefined) root['announce'] = options.announce
	return { bytes: encode(root), infoHash: new Bun.CryptoHasher('sha1').update(encode(info)).digest('hex') }
}
