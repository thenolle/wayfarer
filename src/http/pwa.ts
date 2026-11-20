import { deflateSync } from 'node:zlib'

export const THEME_COLOR = '#b93168'
export const BACKGROUND_COLOR = '#1a1316'

export interface IconSpec {
	readonly path: string
	readonly size: number
	readonly maskable: boolean
}

export const ICONS: readonly IconSpec[] = [
	{ path: '/icon-192.png', size: 192, maskable: false },
	{ path: '/icon-256.png', size: 256, maskable: false },
	{ path: '/icon-512.png', size: 512, maskable: false },
	{ path: '/icon-maskable-512.png', size: 512, maskable: true }
]

export const SERVICE_WORKER = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => undefined)
`

/**
 * The web app manifest that lets browsers install the dashboard as an app.
 */
export function webManifest(): Record<string, unknown> {
	return {
		id: '/',
		name: 'Wayfarer',
		short_name: 'Wayfarer',
		description: 'A persistent background download manager.',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		display_override: ['standalone', 'minimal-ui'],
		background_color: BACKGROUND_COLOR,
		theme_color: THEME_COLOR,
		categories: ['utilities'],
		icons: [
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		]
	}
}

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const SAMPLES = 3

const CRC_TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n += 1) {
		let value = n
		for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
		table[n] = value >>> 0
	}
	return table
})()

function crc32(bytes: Uint8Array): number {
	let value = 0xffffffff
	for (const byte of bytes) value = (CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8)
	return (value ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length)
	const view = new DataView(out.buffer)
	view.setUint32(0, data.length)
	for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index)
	out.set(data, 8)
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
	return out
}

function insideRoundedSquare(x: number, y: number, radius: number): boolean {
	const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0)
	const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0)
	return dx * dx + dy * dy <= radius * radius
}

function insideGlyph(u: number, v: number, scale: number): boolean {
	const x = (u - 0.5) / scale + 0.5
	const y = (v - 0.5) / scale + 0.5
	const shaft = Math.abs(x - 0.5) <= 0.07 && y >= 0.2 && y <= 0.5
	const head = y >= 0.46 && y <= 0.68 && Math.abs(x - 0.5) <= ((0.68 - y) / 0.22) * 0.2
	const tray = y >= 0.76 && y <= 0.82 && x >= 0.25 && x <= 0.75
	return shaft || head || tray
}

const cache = new Map<string, Uint8Array>()

/**
 * Draws the app icon, a white download arrow on the theme colour, as a PNG.
 * Maskable icons fill the whole square and keep the arrow inside the safe zone.
 * Results are cached per size.
 */
export function renderIcon(size: number, maskable: boolean): Uint8Array {
	const key = `${size}:${maskable}`
	const cached = cache.get(key)
	if (cached !== undefined) return cached
	const radius = maskable ? 0 : 0.22
	const scale = maskable ? 0.62 : 0.8
	const stride = size * 4 + 1
	const rows = new Uint8Array(stride * size)
	for (let py = 0; py < size; py += 1) {
		for (let px = 0; px < size; px += 1) {
			let shape = 0
			let glyph = 0
			for (let sy = 0; sy < SAMPLES; sy += 1) {
				for (let sx = 0; sx < SAMPLES; sx += 1) {
					const u = (px + (sx + 0.5) / SAMPLES) / size
					const v = (py + (sy + 0.5) / SAMPLES) / size
					if (!maskable && !insideRoundedSquare(u, v, radius)) continue
					shape += 1
					if (insideGlyph(u, v, scale)) glyph += 1
				}
			}
			const mix = shape === 0 ? 0 : glyph / shape
			const offset = py * stride + 1 + px * 4
			rows[offset] = Math.round(0xb9 + (255 - 0xb9) * mix)
			rows[offset + 1] = Math.round(0x31 + (255 - 0x31) * mix)
			rows[offset + 2] = Math.round(0x68 + (255 - 0x68) * mix)
			rows[offset + 3] = Math.round((shape / (SAMPLES * SAMPLES)) * 255)
		}
	}
	const header = new Uint8Array(13)
	const view = new DataView(header.buffer)
	view.setUint32(0, size)
	view.setUint32(4, size)
	header[8] = 8
	header[9] = 6
	const png = new Uint8Array(Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array(0))]))
	cache.set(key, png)
	return png
}
