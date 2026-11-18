import { parseLiveMessage } from '../shared/live-protocol'
import type { DownloadLive } from '../shared/live-protocol'
import { formatBytes, formatEta, formatSpeed, PROGRESS_SCALE, retryLabel, statusLabel } from './format'

const REFRESH_DELAY_MS = 300
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const RUNNING = new Set(['probing', 'downloading', 'verifying'])

let failures = 0
let refreshTimer: number | undefined
let refreshing = false

function setText(root: Element, field: string, value: string): void {
	const element = root.querySelector(`[data-field="${field}"]`)
	if (element !== null && element.textContent !== value) element.textContent = value
}

function rowFor(id: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-download="${CSS.escape(id)}"]`)
}

/**
 * Patches one download's row in place: byte counts, speed, time left, the
 * overall bar and the per-segment bars. Returns true when the page structure no
 * longer matches the server, because the row is missing or its status changed.
 * A status change can move the row to another tab and changes which buttons
 * apply, so the list is then reloaded from the server.
 */
function applyUpdate(update: DownloadLive): boolean {
	const row = rowFor(update.id)
	if (row === null) return true
	const running = RUNNING.has(update.status)
	const statusChanged = row.dataset['status'] !== update.status
	setText(row, 'downloaded', formatBytes(update.downloadedBytes))
	setText(row, 'total', update.totalBytes === null ? 'unknown size' : formatBytes(update.totalBytes))
	setText(row, 'speed', running ? formatSpeed(update.speedBytesPerSecond) : '—')
	setText(row, 'eta', running ? formatEta(update.etaSeconds) : '—')
	const bar = row.querySelector<HTMLProgressElement>('progress[data-field="progress"]')
	if (bar !== null) {
		if (update.progress === null) bar.removeAttribute('value')
		else bar.value = Math.round(update.progress * PROGRESS_SCALE)
	}
	const retries = row.querySelector<HTMLElement>('[data-field="retries"]')
	if (retries !== null) {
		retries.hidden = update.retryCount === 0
		retries.textContent = retryLabel(update.retryCount)
	}
	for (const segment of update.segments) {
		const segmentBar = row.querySelector<HTMLProgressElement>(`progress[data-segment="${segment.index}"]`)
		if (segmentBar === null) continue
		segmentBar.max = Math.max(1, segment.totalBytes)
		segmentBar.value = segment.downloadedBytes
		segmentBar.dataset['status'] = segment.status
	}
	if (statusChanged) {
		row.dataset['status'] = update.status
		const badge = row.querySelector<HTMLElement>('[data-field="status"]')
		if (badge !== null) {
			badge.dataset['status'] = update.status
			badge.textContent = statusLabel(update.status)
		}
	}
	return statusChanged
}

function scheduleRefresh(): void {
	if (refreshTimer !== undefined) return
	refreshTimer = window.setTimeout(() => {
		refreshTimer = undefined
		void refresh()
	}, REFRESH_DELAY_MS)
}

/**
 * Replaces the tab bar and the download list with fresh server-rendered HTML.
 * If the session ended, the page reloads and the server sends the sign-in page.
 */
async function refresh(): Promise<void> {
	if (refreshing) {
		scheduleRefresh()
		return
	}
	refreshing = true
	try {
		const response = await fetch(location.href, { headers: { accept: 'text/html' }, credentials: 'same-origin', cache: 'no-store' })
		if (!response.ok || response.redirected) {
			location.reload()
			return
		}
		const fresh = new DOMParser().parseFromString(await response.text(), 'text/html')
		for (const id of ['filters', 'downloads']) {
			const next = fresh.getElementById(id)
			const current = document.getElementById(id)
			if (next !== null && current !== null) current.replaceWith(next)
		}
	} catch {
		return
	} finally {
		refreshing = false
	}
}

function setConnection(state: 'connected' | 'disconnected'): void {
	document.documentElement.dataset['live'] = state
}

function connect(): void {
	const url = new URL('/ws', location.href)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	const socket = new WebSocket(url)
	socket.addEventListener('open', () => {
		failures = 0
		setConnection('connected')
	})
	socket.addEventListener('message', (event) => {
		const message = parseLiveMessage(String(event.data))
		if (message === null) return
		let needsRefresh = false
		for (const download of message.downloads) {
			if (applyUpdate(download)) needsRefresh = true
		}
		if (message.type === 'snapshot') {
			const known = new Set(message.downloads.map((download) => download.id))
			for (const row of document.querySelectorAll<HTMLElement>('[data-download]')) {
				const id = row.dataset['download']
				if (id !== undefined && !known.has(id)) needsRefresh = true
			}
		} else if (message.removed.some((id) => rowFor(id) !== null)) {
			needsRefresh = true
		}
		if (needsRefresh) scheduleRefresh()
	})
	socket.addEventListener('close', () => {
		setConnection('disconnected')
		const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** failures)
		failures += 1
		window.setTimeout(connect, delay)
	})
}

/**
 * Starts live updates on pages that show downloads. Reconnects with a growing
 * delay if the connection drops. The dashboard works without this: forms and
 * links are plain HTML.
 */
export function startLive(): void {
	if (document.querySelector('[data-live-root]') === null) return
	connect()
}
