import { describe, expect, test } from 'bun:test'
import { MAX_FILENAME_BYTES, sanitizeFilename } from '../../src/filesystem/filename'

describe('sanitizeFilename', () => {
  test('drops directory components and traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('..\\..\\windows\\system32\\evil.dll')).toBe('evil.dll')
    expect(sanitizeFilename('/absolute/path/file.txt')).toBe('file.txt')
  })

  test('replaces control characters and invalid characters', () => {
    expect(sanitizeFilename('a\u0000b.txt')).toBe('a_b.txt')
    expect(sanitizeFilename('what?<is>:this*.txt')).toBe('what__is__this_.txt')
  })

  test('removes trailing dots and spaces', () => {
    expect(sanitizeFilename('report.pdf. . ')).toBe('report.pdf')
  })

  test('prefixes Windows reserved names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON')
    expect(sanitizeFilename('nul.txt')).toBe('_nul.txt')
    expect(sanitizeFilename('com1.log')).toBe('_com1.log')
    expect(sanitizeFilename('console.log')).toBe('console.log')
  })

  test('uses the fallback when nothing usable remains', () => {
    expect(sanitizeFilename('')).toBe('download')
    expect(sanitizeFilename('..')).toBe('download')
    expect(sanitizeFilename('///')).toBe('download')
    expect(sanitizeFilename('...', 'file')).toBe('file')
  })

  test('limits length in bytes and keeps the extension', () => {
    const result = sanitizeFilename(`${'é'.repeat(300)}.zip`)
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(MAX_FILENAME_BYTES)
    expect(result.endsWith('.zip')).toBe(true)
    expect(result).not.toContain('\uFFFD')
  })
})
