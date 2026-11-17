import { describe, expect, test } from 'bun:test'
import { BandwidthLimiter } from '../../src/downloads/scheduler/bandwidth-limiter'

const signal = new AbortController().signal

function fakeTime() {
  let now = 0
  const sleeps: number[] = []
  return {
    sleeps,
    clock: () => now,
    sleep: async (ms: number): Promise<void> => {
      sleeps.push(ms)
      now += ms
    }
  }
}

describe('BandwidthLimiter', () => {
  test('allows one second of burst, then paces to the limit', async () => {
    const time = fakeTime()
    const limiter = new BandwidthLimiter(1000, time)
    await limiter.acquire(1000, signal)
    expect(time.sleeps).toEqual([])
    await limiter.acquire(500, signal)
    await limiter.acquire(500, signal)
    expect(time.sleeps).toEqual([500, 500])
  })

  test('one bucket is shared by every caller', async () => {
    const time = fakeTime()
    const limiter = new BandwidthLimiter(1000, time)
    await Promise.all([limiter.acquire(1000, signal), limiter.acquire(1000, signal)])
    expect(time.sleeps).toEqual([1000])
  })

  test('a limit of zero never waits', async () => {
    const time = fakeTime()
    const limiter = new BandwidthLimiter(0, time)
    await limiter.acquire(10_000_000, signal)
    expect(time.sleeps).toEqual([])
  })

  test('a chunk larger than the bucket borrows against future tokens', async () => {
    const time = fakeTime()
    const limiter = new BandwidthLimiter(1000, time)
    await limiter.acquire(3000, signal)
    expect(time.sleeps).toEqual([2000])
  })

  test('an aborted wait returns its tokens', async () => {
    const limiter = new BandwidthLimiter(1000, {
      clock: () => 0,
      sleep: async () => {
        throw new Error('aborted')
      }
    })
    expect(limiter.acquire(2000, signal)).rejects.toThrow('aborted')
    await limiter.acquire(1000, signal)
  })

  test('raising the limit from unlimited starts with a full bucket', async () => {
    const time = fakeTime()
    const limiter = new BandwidthLimiter(0, time)
    limiter.setLimit(1000)
    await limiter.acquire(1000, signal)
    expect(time.sleeps).toEqual([])
    expect(limiter.bytesPerSecond).toBe(1000)
  })

  test('rejects invalid limits', () => {
    expect(() => new BandwidthLimiter(-1)).toThrow(RangeError)
    expect(() => new BandwidthLimiter(1.5)).toThrow(RangeError)
  })

  test('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    expect(new BandwidthLimiter(1000).acquire(1, controller.signal)).rejects.toThrow('stopped')
  })
})
