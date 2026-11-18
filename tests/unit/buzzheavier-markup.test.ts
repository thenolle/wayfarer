import { describe, expect, test } from 'bun:test'
import { findDownloadEndpoint, findFileName } from '../../src/downloads/resolvers/buzzheavier'

const PAGE = new URL('https://bzzhr.to/upruebcoooan')
const HTML = `
<p class="file-name">Grand &amp; Theft.rar</p>
<a class="download-btn gay-button" hx-get="/upruebcoooan/download?t=abc.def" rel="noopener">Download File</a>
<a class="link-button" hx-get="/upruebcoooan/download?t=abc.def&amp;alt=true">Slow? Try mirror 2</a>`

describe('Buzzheavier page markup', () => {
	test('uses the main signed download link, not the mirror', () => {
		expect(findDownloadEndpoint(HTML, PAGE).href).toBe('https://bzzhr.to/upruebcoooan/download?t=abc.def')
	})

	test('reads the displayed file name', () => {
		expect(findFileName(HTML)).toBe('Grand & Theft.rar')
		expect(findFileName('<p class="other">x</p>')).toBeNull()
	})
})
