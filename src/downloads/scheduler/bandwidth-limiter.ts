import { sleep } from '../engine/retry'

export interface LimiterOptions {
  readonly clock?: () => number
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

/**
 * A token-bucket limiter shared by every segment of every download, so the
 * limit applies to total throughput rather than to each connection.
 *
 * The bucket holds one second of tokens. `acquire` takes tokens for a chunk
 * before it is written; when the bucket runs dry the caller waits until its
 * share has been refilled. A chunk larger than the bucket borrows against
 * future tokens, so very small limits still work. A limit of 0 disables
 * limiting.
 *
 * Callers that are aborted while waiting give their tokens back, so a paused
 * or cancelled download does not consume bandwidth it never used. Changing
 * the limit takes effect immediately for new requests; waits already in
 * progress finish at the previous rate.
 */
export class BandwidthLimiter {
  private limit = 0
  private tokens = 0
  private lastRefill: number
  private readonly clock: () => number
  private readonly wait: (ms: number, signal: AbortSignal) => Promise<void>

  constructor(bytesPerSecond: number, options: LimiterOptions = {}) {
    this.clock = options.clock ?? Date.now
    this.wait = options.sleep ?? sleep
    this.lastRefill = this.clock()
    this.setLimit(bytesPerSecond)
  }

  get bytesPerSecond(): number {
    return this.limit
  }

  /**
   * @throws {RangeError} unless `bytesPerSecond` is a non-negative integer.
   */
  setLimit(bytesPerSecond: number): void {
    if (!Number.isSafeInteger(bytesPerSecond) || bytesPerSecond < 0) throw new RangeError('The bandwidth limit must be a non-negative integer')
    this.refill()
    const wasUnlimited = this.limit === 0
    this.limit = bytesPerSecond
    this.tokens = wasUnlimited ? bytesPerSecond : Math.min(this.tokens, bytesPerSecond)
  }

  /**
   * Waits until `bytes` may be sent.
   *
   * @throws the signal's reason if it aborts first; the tokens are returned.
   */
  async acquire(bytes: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (this.limit === 0 || bytes <= 0) return
    this.refill()
    this.tokens -= bytes
    if (this.tokens >= 0) return
    const waitMs = Math.ceil((-this.tokens * 1000) / this.limit)
    try {
      await this.wait(waitMs, signal)
    } catch (error) {
      this.tokens += bytes
      throw error
    }
  }

  private refill(): void {
    const now = this.clock()
    if (this.limit > 0) {
      const earned = ((now - this.lastRefill) * this.limit) / 1000
      this.tokens = Math.min(this.limit, this.tokens + earned)
    }
    this.lastRefill = now
  }
}
