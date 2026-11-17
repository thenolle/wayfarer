import { describe, expect, test } from 'bun:test'
import { Semaphore } from '../../src/downloads/scheduler/semaphore'

const signal = new AbortController().signal

describe('Semaphore', () => {
  test('limits concurrency and hands permits over in order', async () => {
    const semaphore = new Semaphore(2)
    const first = await semaphore.acquire(signal)
    const second = await semaphore.acquire(signal)
    const order: string[] = []
    const third = semaphore.acquire(signal).then((release) => {
      order.push('third')
      return release
    })
    const fourth = semaphore.acquire(signal).then((release) => {
      order.push('fourth')
      return release
    })
    await Bun.sleep(5)
    expect(semaphore.waiting).toBe(2)
    expect(order).toEqual([])
    first()
    await third
    expect(order).toEqual(['third'])
    second()
    await fourth
    expect(order).toEqual(['third', 'fourth'])
  })

  test('an aborted waiter leaves the queue without taking a permit', async () => {
    const semaphore = new Semaphore(1)
    const holder = await semaphore.acquire(signal)
    const controller = new AbortController()
    const waiting = semaphore.acquire(controller.signal)
    controller.abort(new Error('stop'))
    expect(waiting).rejects.toThrow('stop')
    expect(semaphore.waiting).toBe(0)
    holder()
    const next = await semaphore.acquire(signal)
    next()
  })

  test('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already'))
    expect(new Semaphore(1).acquire(controller.signal)).rejects.toThrow('already')
  })

  test('releasing twice does not create an extra permit', async () => {
    const semaphore = new Semaphore(1)
    const release = await semaphore.acquire(signal)
    release()
    release()
    const holder = await semaphore.acquire(signal)
    const blocked = semaphore.acquire(signal)
    await Bun.sleep(5)
    expect(semaphore.waiting).toBe(1)
    holder()
		const awaitBlocked = await blocked
    awaitBlocked()
  })

  test('requires at least one permit', () => {
    expect(() => new Semaphore(0)).toThrow(RangeError)
  })
})
