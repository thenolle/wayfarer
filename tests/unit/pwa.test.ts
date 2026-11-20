import { describe, expect, test } from 'bun:test'
import { inflateSync } from 'node:zlib'
import { ICONS, renderIcon, SERVICE_WORKER, webManifest } from '../../src/http/pwa'

function pixel(png: Uint8Array, size: number, x: number, y: number): number[] {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
	const length = view.getUint32(33)
	const rows = inflateSync(png.subarray(41, 41 + length))
	const offset = y * (size * 4 + 1) + 1 + x * 4
	return [rows[offset] ?? -1, rows[offset + 1] ?? -1, rows[offset + 2] ?? -1, rows[offset + 3] ?? -1]
}

describe('webManifest', () => {
	test('describes an installable standalone app', () => {
		const manifest = webManifest()
		expect(manifest['name']).toBe('Wayfarer')
		expect(manifest['display']).toBe('standalone')
		expect(manifest['start_url']).toBe('/')
		expect(manifest['scope']).toBe('/')
	})

	test('only lists icons that are served, including 192, 512 and maskable', () => {
		const icons = webManifest()['icons']
		const entries = Array.isArray(icons) ? icons : []
		const served = new Set(ICONS.map((icon) => icon.path))
		for (const entry of entries) expect(served.has(typeof entry === 'object' && entry !== null && 'src' in entry ? String(entry.src) : '')).toBe(true)
		const sizes = entries.map((entry) => (typeof entry === 'object' && entry !== null && 'sizes' in entry ? String(entry.sizes) : ''))
		expect(sizes).toContain('192x192')
		expect(sizes).toContain('512x512')
		expect(entries.some((entry) => typeof entry === 'object' && entry !== null && 'purpose' in entry && entry.purpose === 'maskable')).toBe(true)
	})
})

describe('renderIcon', () => {
	test('produces a valid PNG of the requested size', () => {
		const png = renderIcon(192, false)
		expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
		expect(view.getUint32(16)).toBe(192)
		expect(view.getUint32(20)).toBe(192)
		expect(Array.from(png.subarray(png.length - 4))).toEqual([0xae, 0x42, 0x60, 0x82])
	})

	test('rounds the corners of normal icons and fills maskable ones', () => {
		expect(pixel(renderIcon(192, false), 192, 0, 0)[3]).toBe(0)
		expect(pixel(renderIcon(192, false), 192, 96, 20)[3]).toBe(255)
		expect(pixel(renderIcon(192, true), 192, 0, 0)).toEqual([0xb9, 0x31, 0x68, 255])
	})

	test('draws the arrow in white on the theme colour', () => {
		const png = renderIcon(192, false)
		expect(pixel(png, 192, 96, 70)).toEqual([255, 255, 255, 255])
		expect(pixel(png, 192, 20, 96)).toEqual([0xb9, 0x31, 0x68, 255])
	})

	test('caches icons per size', () => {
		expect(renderIcon(192, false)).toBe(renderIcon(192, false))
	})
})

describe('SERVICE_WORKER', () => {
	test('takes control and handles fetches', () => {
		expect(SERVICE_WORKER).toContain("addEventListener('fetch'")
		expect(SERVICE_WORKER).toContain('clients.claim()')
	})
})
