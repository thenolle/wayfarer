import { describe, expect, test } from 'bun:test'
import { LoginThrottle, SessionStore, takeFlash } from '../../src/http/web/session'

function clock(start: number = 0) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('SessionStore', () => {
  test('creates unguessable, distinct ids and CSRF tokens', () => {
    const store = new SessionStore()
    const a = store.create(false)
    const b = store.create(false)
    expect(a.id).toMatch(/^[0-9a-f]{64}$/)
    expect(a.id).not.toBe(b.id)
    expect(a.csrfToken).not.toBe(a.id)
    expect(a.csrfToken).not.toBe(b.csrfToken)
  })

  test('finds sessions until they expire', () => {
    const time = clock()
    const store = new SessionStore({ ttlMs: 1000, clock: time.now })
    const session = store.create(true)
    expect(store.get(session.id)).toBe(session)
    time.advance(1000)
    expect(store.get(session.id)).toBeNull()
    expect(store.get(undefined)).toBeNull()
  })

  test('drops the oldest session when full', () => {
    const store = new SessionStore({ maxSessions: 2 })
    const first = store.create(false)
    const second = store.create(false)
    const third = store.create(false)
    expect(store.get(first.id)).toBeNull()
    expect(store.get(second.id)).toBe(second)
    expect(store.get(third.id)).toBe(third)
    expect(store.size).toBe(2)
  })

  test('destroys sessions and delivers a message once', () => {
    const store = new SessionStore()
    const session = store.create(true)
    session.flash = { kind: 'success', message: 'Done' }
    expect(takeFlash(session)).toEqual({ kind: 'success', message: 'Done' })
    expect(takeFlash(session)).toBeNull()
    store.destroy(session.id)
    expect(store.get(session.id)).toBeNull()
  })
})

describe('LoginThrottle', () => {
  test('blocks after repeated failures and recovers after the window', () => {
    const time = clock()
    const throttle = new LoginThrottle(3, 1000, time.now)
    expect(throttle.blocked).toBe(false)
    throttle.recordFailure()
    throttle.recordFailure()
    expect(throttle.blocked).toBe(false)
    throttle.recordFailure()
    expect(throttle.blocked).toBe(true)
    time.advance(1001)
    expect(throttle.blocked).toBe(false)
  })

  test('reset clears failures', () => {
    const throttle = new LoginThrottle(1, 1000)
    throttle.recordFailure()
    expect(throttle.blocked).toBe(true)
    throttle.reset()
    expect(throttle.blocked).toBe(false)
  })
})
