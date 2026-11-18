import { describe, expect, test } from 'bun:test'
import { parseLiveMessage } from '../../src/shared/live-protocol'
import type { DownloadLive, LiveMessage } from '../../src/shared/live-protocol'
import { LiveHub } from '../../src/websocket/hub'
import type { LiveClient } from '../../src/websocket/hub'

class FakeClient implements LiveClient {
	readonly received: LiveMessage[] = []
	closed: { code: number | undefined; reason: string | undefined } | null = null
	sendResult = 10
	send(message: string): number {
		const parsed = parseLiveMessage(message)
		if (parsed !== null) this.received.push(parsed)
		return this.sendResult
	}
	close(code?: number, reason?: string): void {
		this.closed = { code, reason }
	}
}

function live(id: string, downloadedBytes: number, status: string = 'downloading'): DownloadLive {
	return { id, status, downloadedBytes, totalBytes: 1000, progress: downloadedBytes / 1000, speedBytesPerSecond: 0, etaSeconds: null, retryCount: 0, error: null, segments: [] }
}

describe('LiveHub', () => {
	test('sends a full snapshot to a new client', () => {
		const hub = new LiveHub(() => [live('a', 1), live('b', 2)], { intervalMs: 1_000_000 })
		const client = new FakeClient()
		hub.add(client)
		expect(client.received).toHaveLength(1)
		expect(client.received[0]?.type).toBe('snapshot')
		expect(client.received[0]?.downloads.map((item) => item.id)).toEqual(['a', 'b'])
		hub.stop()
	})

	test('sends only what changed, and says nothing when nothing changed', () => {
		let state = [live('a', 1), live('b', 2)]
		const hub = new LiveHub(() => state, { intervalMs: 1_000_000 })
		const client = new FakeClient()
		hub.add(client)
		hub.tick()
		expect(client.received).toHaveLength(1)
		state = [live('a', 50), live('b', 2)]
		hub.tick()
		const update = client.received[1]
		expect(update?.type).toBe('update')
		expect(update?.downloads.map((item) => item.id)).toEqual(['a'])
		expect(update?.type === 'update' ? update.removed : null).toEqual([])
		hub.stop()
	})

	test('reports new and removed downloads', () => {
		let state = [live('a', 1)]
		const hub = new LiveHub(() => state, { intervalMs: 1_000_000 })
		const client = new FakeClient()
		hub.add(client)
		state = [live('c', 5)]
		hub.tick()
		const update = client.received[1]
		expect(update?.downloads.map((item) => item.id)).toEqual(['c'])
		expect(update?.type === 'update' ? update.removed : null).toEqual(['a'])
		hub.stop()
	})

	test('disconnects clients that cannot keep up, and stops all clients on shutdown', () => {
		let state = [live('a', 1)]
		const hub = new LiveHub(() => state, { intervalMs: 1_000_000 })
		const slow = new FakeClient()
		const healthy = new FakeClient()
		hub.add(slow)
		hub.add(healthy)
		slow.sendResult = 0
		state = [live('a', 2)]
		hub.tick()
		expect(slow.closed?.code).toBe(1011)
		expect(hub.size).toBe(1)
		hub.stop()
		expect(healthy.closed?.code).toBe(1001)
		expect(hub.size).toBe(0)
	})

	test('refuses clients beyond the limit', () => {
		const hub = new LiveHub(() => [], { intervalMs: 1_000_000, maxClients: 1 })
		hub.add(new FakeClient())
		const extra = new FakeClient()
		hub.add(extra)
		expect(hub.full).toBe(true)
		expect(extra.closed?.code).toBe(1013)
		expect(extra.received).toHaveLength(0)
		hub.stop()
	})
})
