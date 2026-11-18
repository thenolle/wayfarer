import { deflateSync } from 'node:zlib'

const TABLE = new Uint32Array(256).map((_value, n) => {
	let c = n
	for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	return c >>> 0
})

function crc32(...parts: Uint8Array[]): number {
	let c = 0xffffffff
	for (const part of parts) for (const byte of part) c = (TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const name = new TextEncoder().encode(type)
	const out = new Uint8Array(12 + data.length)
	const view = new DataView(out.buffer)
	view.setUint32(0, data.length)
	out.set(name, 4)
	out.set(data, 8)
	view.setUint32(8 + data.length, crc32(name, data))
	return out
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
	const stride = width * 4
	const raw = new Uint8Array(height * (stride + 1))
	for (let y = 0; y < height; y += 1) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
	const header = new Uint8Array(13)
	const view = new DataView(header.buffer)
	view.setUint32(0, width)
	view.setUint32(4, height)
	header[8] = 8
	header[9] = 6
	const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]
	const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.length
	}
	return out
}

class Canvas {
	readonly data: Uint8Array

	constructor(readonly width: number, readonly height: number) {
		this.data = new Uint8Array(width * height * 4)
	}

	blend(x: number, y: number, r: number, g: number, b: number, alpha: number): void {
		if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return
		const i = (y * this.width + x) * 4
		const dst = (this.data[i + 3] ?? 0) / 255
		const out = alpha + dst * (1 - alpha)
		const channels = [r, g, b]
		for (let c = 0; c < 3; c += 1) this.data[i + c] = Math.round(((channels[c] ?? 0) * alpha + (this.data[i + c] ?? 0) * dst * (1 - alpha)) / out)
		this.data[i + 3] = Math.round(out * 255)
	}
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const coverage = (distance: number, scale: number): number => Math.max(0, Math.min(1, 0.5 - distance * scale))

function roundRect(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
	const qx = Math.abs(px - cx) - (hw - r)
	const qy = Math.abs(py - cy) - (hh - r)
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function segment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax
	const dy = by - ay
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
	return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function paintIcon(canvas: Canvas, ox: number, oy: number, size: number, maskable: boolean): void {
	const scale = size / 64
	const glyph = maskable ? 0.7 : 1
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const u = (x + 0.5) / scale
			const v = (y + 0.5) / scale
			const tile = maskable ? 1 : coverage(roundRect(u, v, 32, 32, 32, 32, 16), scale)
			if (tile <= 0) continue
			const mix = (u + v) / 128
			canvas.blend(ox + x, oy + y, lerp(198, 143, mix), lerp(58, 35, mix), lerp(120, 82, mix), tile)
			const gu = 32 + (u - 32) / glyph
			const gv = 32 + (v - 32) / glyph
			const distance = Math.min(segment(gu, gv, 32, 14, 32, 38), segment(gu, gv, 22, 28, 32, 38), segment(gu, gv, 42, 28, 32, 38), segment(gu, gv, 18, 46, 46, 46))
			canvas.blend(ox + x, oy + y, 255, 255, 255, coverage(distance - 2.5, scale * glyph) * tile)
		}
	}
}

export function renderIcon(size: number, maskable: boolean): Uint8Array {
	const canvas = new Canvas(size, size)
	paintIcon(canvas, 0, 0, size, maskable)
	return encodePng(size, size, canvas.data)
}

export function renderSocial(): Uint8Array {
	const width = 1200
	const height = 630
	const canvas = new Canvas(width, height)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const t = (x / width) * 0.7 + (y / height) * 0.3
			canvas.blend(x, y, lerp(26, 185, t), lerp(19, 49, t), lerp(22, 104, t), 1)
		}
	}
	paintIcon(canvas, 110, 135, 360, false)
	const bars: readonly (readonly [number, number])[] = [[215, 0.78], [300, 0.46], [385, 0.92]]
	for (const [top, fraction] of bars) {
		for (let y = top - 2; y < top + 34; y += 1) {
			for (let x = 556; x < 1094; x += 1) {
				const track = coverage(roundRect(x + 0.5, y + 0.5, 825, top + 15, 265, 15, 15), 1)
				canvas.blend(x, y, 255, 255, 255, track * 0.18)
				const fillWidth = 530 * fraction
				const fill = coverage(roundRect(x + 0.5, y + 0.5, 560 + fillWidth / 2, top + 15, fillWidth / 2, 15, 15), 1)
				canvas.blend(x, y, 255, 255, 255, fill * 0.92)
			}
		}
	}
	return encodePng(width, height, canvas.data)
}
