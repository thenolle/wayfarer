import { describe, expect, test } from 'bun:test'
import { checksumLabel, formatBytes, formatEta, formatPercent, formatSpeed, retryLabel, statusLabel } from '../../src/ui/format'

describe('formatting', () => {
  test('formats byte counts with binary units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.50 KiB')
    expect(formatBytes(1024 * 1024)).toBe('1.00 MiB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MiB')
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })

  test('formats speed, time left and percentages', () => {
    expect(formatSpeed(0)).toBe('—')
    expect(formatSpeed(2048)).toBe('2.00 KiB/s')
    expect(formatEta(null)).toBe('—')
    expect(formatEta(45)).toBe('45s')
    expect(formatEta(125)).toBe('2m 5s')
    expect(formatEta(3700)).toBe('1h 1m')
    expect(formatEta(1_000_000)).toBe('over 99h')
    expect(formatPercent(0.456)).toBe('45%')
    expect(formatPercent(null)).toBe('—')
  })

  test('labels statuses, retries and checksums', () => {
    expect(statusLabel('downloading')).toBe('Downloading')
    expect(statusLabel('mystery')).toBe('mystery')
    expect(retryLabel(1)).toBe('Retried 1 time')
    expect(retryLabel(3)).toBe('Retried 3 times')
    expect(checksumLabel({ state: 'not-requested' })).toBeNull()
    expect(checksumLabel({ state: 'verified', sha256: 'a' })).toBe('SHA-256 verified')
  })
})
