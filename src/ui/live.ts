import { parseLiveMessage } from '../shared/live-protocol'
import type { DownloadLive } from '../shared/live-protocol'
import { formatBytes, formatEta, formatPercent, formatSpeed, PROGRESS_SCALE, retryLabel } from './format'

const REFRESH_DELAY_MS = 300
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const RUNNING = new Set(['probing', 'downloading', 'verifying'])
const REFRESHED = ['sidebar', 'stats', 'downloads']

const speeds = new Map<string, number>()
const activeIds = new Set<string>()
let failures = 0
let refreshTimer: number | undefined
let refreshing = false

function setText(root: Element, field: string, value: string): void {
	const element = root.querySelector(`[data-field="${field}"]`)
	if (element !== null && element.textContent !== value) element.textContent = value
}

function setProgress(bar: Element | null, value: number, max: number): void {
	if (!(bar instanceof HTMLElement)) return
	const safeMax = Math.max(1, max)
	const current = Math.min(safeMax, Math.max(0, value))
	bar.setAttribute('aria-valuenow', String(current))
	bar.setAttribute('aria-valuemax', String(safeMax))
	const indicator = bar.firstElementChild
	if (indicator instanceof HTMLElement) indicator.style.transform = `translateX(-${Math.round((100 - (current / safeMax) * 100) * 100) / 100}%)`
}

function rowFor(id: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-download="${CSS.escape(id)}"]`)
}

function track(update: DownloadLive): void {
	const running = RUNNING.has(update.status)
	speeds.set(update.id, running ? update.speedBytesPerSecond : 0)
	if (running) activeIds.add(update.id)
	else activeIds.delete(update.id)
}

function renderStats(): void {
	let total = 0
	for (const speed of speeds.values()) total += speed
	const speedText = formatSpeed(total)
	for (const element of document.querySelectorAll('[data-field="total-speed"]')) {
		if (element.textContent !== speedText) element.textContent = speedText
	}
	for (const element of document.querySelectorAll('[data-field="active-count"]')) element.textContent = String(activeIds.size)
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
	setText(row, 'percent', formatPercent(update.progress))
	setProgress(row.querySelector('[data-field="progress"]'), Math.round((update.progress ?? 0) * PROGRESS_SCALE), PROGRESS_SCALE)
	const retries = row.querySelector<HTMLElement>('[data-field="retries"]')
	if (retries !== null) {
		retries.hidden = update.retryCount === 0
		retries.textContent = retryLabel(update.retryCount)
	}
	for (const segment of update.segments) {
		const bar = row.querySelector<HTMLElement>(`[data-segment="${segment.index}"]`)
		if (bar === null) continue
		bar.dataset['status'] = segment.status
		setProgress(bar, segment.downloadedBytes, segment.totalBytes)
	}
	if (statusChanged) row.dataset['status'] = update.status
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
		for (const id of REFRESHED) {
			const next = fresh.getElementById(id)
			const current = document.getElementById(id)
			if (next !== null && current !== null) current.replaceWith(next)
		}
		renderStats()
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
    if (message.type === 'snapshot') {
      speeds.clear()
      activeIds.clear()
    } else {
      for (const id of message.removed) {
        speeds.delete(id)
        activeIds.delete(id)
      }
    }
    let needsRefresh = false
    for (const download of message.downloads) {
      track(download)
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
    renderStats()
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
