/**
 * Reads the next chunk from `reader`, giving up if nothing arrives within
 * `idleMs`. On a stall it calls `abort` to cancel the underlying request and
 * rejects with a `TimeoutError`.
 */
export async function readWithIdleTimeout<T>(reader: ReadableStreamDefaultReader<T>, idleMs: number, abort: () => void): Promise<Awaited<ReturnType<typeof reader.read>>> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const stalled = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			abort()
			reject(new DOMException('The connection stalled', 'TimeoutError'))
		}, idleMs)
	})
	try { return await Promise.race([reader.read(), stalled]) } finally { clearTimeout(timer) }
}
