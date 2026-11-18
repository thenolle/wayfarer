import { formatBytes } from './format'

type Preview = { filename: string; totalBytes: number | null; acceptsRanges: boolean; resolver: string }

const PREVIEW_DELAY_MS = 500
let previewTimer: number | undefined
let previewSerial = 0

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function focusField(id: string): void {
	const element = document.getElementById(id)
	if (element instanceof HTMLElement) {
		element.focus()
		element.scrollIntoView({ block: 'center' })
	}
}

function selectables(): HTMLInputElement[] {
	return [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="id"][form="bulk"]')]
}

export function initEnhancements(): void {
	document.documentElement.dataset['js'] = '1'
	document.addEventListener('change', (event) => {
		const target = event.target
		if (target instanceof HTMLInputElement && target.hasAttribute('data-select-all')) {
			for (const box of selectables()) box.checked = target.checked
		}
	})
	document.addEventListener('keydown', (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
		if (event.key === '/') {
			event.preventDefault()
			focusField('search-q')
		} else if (event.key === 'n' || event.key === 'N') {
			event.preventDefault()
			focusField('add-url')
		}
	})
	initPreview()
}

function isPreview(value: unknown): value is Preview {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Record<string, unknown>
	return typeof candidate['filename'] === 'string' && typeof candidate['acceptsRanges'] === 'boolean'
}

function describePreview(preview: Preview): string {
  const size = preview.totalBytes === null || preview.totalBytes === undefined ? 'unknown size' : formatBytes(preview.totalBytes)
  return `${preview.filename} · ${size} · ${preview.acceptsRanges ? 'can resume' : 'cannot resume'}`
}

async function runPreview(): Promise<void> {
	const form = document.querySelector<HTMLFormElement>('form.add-form')
	const urlField = document.getElementById('add-url')
	const nameField = document.getElementById('add-filename')
	const output = document.getElementById('add-preview')
	if (form === null || !(urlField instanceof HTMLTextAreaElement) || !(nameField instanceof HTMLInputElement) || output === null) return
	const links = urlField.value.split(/\s+/).filter((link) => link !== '')
	const link = links[0]
	if (links.length !== 1 || link === undefined) {
		output.hidden = true
		return
	}
	previewSerial += 1
	const serial = previewSerial
	output.hidden = false
	output.dataset['state'] = 'loading'
	output.textContent = 'Checking the link…'
	const csrf = form.querySelector<HTMLInputElement>('input[name="csrf"]')?.value ?? ''
	try {
		const response = await fetch('/actions/preview', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ csrf, url: link })
		})
		const body: unknown = await response.json()
		if (serial !== previewSerial) return
		const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
		if (response.ok && isPreview(data['data'])) {
			const preview = data['data']
			output.dataset['state'] = 'ready'
			output.textContent = describePreview(preview)
			nameField.placeholder = preview.filename
			if (nameField.dataset['edited'] !== '1') nameField.value = preview.filename
		} else {
			output.dataset['state'] = 'error'
			output.textContent = typeof data['error'] === 'string' ? data['error'] : 'This link could not be checked'
		}
	} catch {
		if (serial !== previewSerial) return
		output.dataset['state'] = 'error'
		output.textContent = 'This link could not be checked'
	}
}

function schedulePreview(): void {
	window.clearTimeout(previewTimer)
	previewTimer = window.setTimeout(() => void runPreview(), PREVIEW_DELAY_MS)
}

function initPreview(): void {
	document.addEventListener('input', (event) => {
		const target = event.target
		if (!(target instanceof HTMLElement)) return
		if (target.id === 'add-url') {
			const name = document.getElementById('add-filename')
			if (name instanceof HTMLInputElement) {
				delete name.dataset['edited']
				name.value = ''
			}
			schedulePreview()
		} else if (target.id === 'add-filename' && target instanceof HTMLInputElement) {
			target.dataset['edited'] = target.value === '' ? '' : '1'
		}
	})
	document.addEventListener('click', (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		if (target.closest('[data-preview]') !== null) {
			void runPreview()
			return
		}
		const copy = target.closest<HTMLElement>('[data-copy]')
		if (copy !== null && copy.dataset['copy'] !== undefined) {
			void navigator.clipboard.writeText(copy.dataset['copy']).then(() => {
				copy.dataset['copied'] = '1'
				window.setTimeout(() => delete copy.dataset['copied'], 1500)
			})
		}
	})
}
