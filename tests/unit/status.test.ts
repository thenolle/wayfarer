import { describe, expect, test } from 'bun:test'
import { checksumStatus, normalizeSha256 } from '../../src/downloads/domain/checksum'
import { InvalidTransitionError } from '../../src/downloads/domain/errors'
import { ACTIVE_STATUSES, DOWNLOAD_STATUSES, assertTransition, canTransition, isFinalStatus } from '../../src/downloads/domain/status'

describe('download state machine', () => {
	test('allows the normal lifecycle', () => {
		expect(canTransition('queued', 'probing')).toBe(true)
		expect(canTransition('probing', 'downloading')).toBe(true)
		expect(canTransition('downloading', 'verifying')).toBe(true)
		expect(canTransition('verifying', 'completed')).toBe(true)
	})

	test('rejects skipping the queue', () => {
		expect(canTransition('queued', 'downloading')).toBe(false)
		expect(() => assertTransition('queued', 'completed')).toThrow(InvalidTransitionError)
	})

	test('completed and cancelled are final', () => {
		expect(isFinalStatus('completed')).toBe(true)
		expect(isFinalStatus('cancelled')).toBe(true)
		for (const status of DOWNLOAD_STATUSES) expect(canTransition('completed', status)).toBe(false)
	})

	test('every active status can be requeued after an interruption', () => {
		for (const status of ACTIVE_STATUSES) expect(canTransition(status, 'queued')).toBe(true)
	})

	test('failed downloads can be retried', () => {
		expect(canTransition('failed', 'queued')).toBe(true)
	})
})

describe('checksum status', () => {
	const digest = 'a'.repeat(64)

	test('reports each verification state', () => {
		expect(checksumStatus({ expectedSha256: null, actualSha256: null }).state).toBe('not-requested')
		expect(checksumStatus({ expectedSha256: digest, actualSha256: null }).state).toBe('pending')
		expect(checksumStatus({ expectedSha256: digest, actualSha256: digest.toUpperCase() }).state).toBe('verified')
		expect(checksumStatus({ expectedSha256: digest, actualSha256: 'b'.repeat(64) }).state).toBe('mismatch')
	})

	test('normalises valid digests and rejects invalid ones', () => {
		expect(normalizeSha256(` ${digest.toUpperCase()} `)).toBe(digest)
		expect(normalizeSha256('abc')).toBeNull()
		expect(normalizeSha256('g'.repeat(64))).toBeNull()
	})
})
