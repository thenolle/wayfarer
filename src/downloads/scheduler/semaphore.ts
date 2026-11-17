interface Waiter {
  readonly signal: AbortSignal
  readonly resolve: (release: () => void) => void
  readonly onAbort: () => void
}

/**
 * A counting semaphore with first-in, first-out waiters and abortable waits.
 * `acquire` resolves with a release function that is safe to call twice.
 */
export class Semaphore {
  private available: number
  private readonly waiters: Waiter[] = []

  constructor(permits: number) {
    if (!Number.isInteger(permits) || permits < 1) throw new RangeError('A semaphore needs at least one permit')
    this.available = permits
  }

  get waiting(): number {
    return this.waiters.length
  }

  /**
   * Waits for a permit. Rejects with the signal's reason if it aborts first,
   * in which case no permit is taken.
   */
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason)
    if (this.available > 0) {
      this.available -= 1
      return Promise.resolve(this.createRelease())
    }
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        const index = this.waiters.indexOf(waiter)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(signal.reason)
      }
      const waiter: Waiter = { signal, resolve, onAbort }
      signal.addEventListener('abort', onAbort, { once: true })
      this.waiters.push(waiter)
    })
  }

  private createRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.handOver()
    }
  }

  private handOver(): void {
    const next = this.waiters.shift()
    if (next === undefined) {
      this.available += 1
      return
    }
    next.signal.removeEventListener('abort', next.onAbort)
    next.resolve(this.createRelease())
  }
}
