import { describe, expect, test } from 'bun:test'
import { MIN_SEGMENT_BYTES, coversExactly, planSegments, segmentLength } from '../../src/downloads/segments/plan'

describe('planSegments', () => {
  test('covers the file exactly without overlap', () => {
    for (const total of [1, 1000, MIN_SEGMENT_BYTES, 8 * MIN_SEGMENT_BYTES + 5, 100_000_007]) {
      const ranges = planSegments(total, 8)
      expect(coversExactly(ranges, total)).toBe(true)
      expect(ranges.reduce((sum, range) => sum + segmentLength(range), 0)).toBe(total)
    }
  })

  test('uses one segment for small files', () => {
    expect(planSegments(500, 8)).toEqual([{ index: 0, startOffset: 0, endOffset: 499 }])
  })

  test('never exceeds the maximum number of segments', () => {
    expect(planSegments(1000 * MIN_SEGMENT_BYTES, 8)).toHaveLength(8)
  })

  test('returns no segments for an empty file', () => {
    expect(planSegments(0, 8)).toEqual([])
  })

  test('rejects invalid arguments', () => {
    expect(() => planSegments(-1, 8)).toThrow(RangeError)
    expect(() => planSegments(10, 0)).toThrow(RangeError)
  })

  test('detects gaps and overlaps', () => {
    expect(coversExactly([{ index: 0, startOffset: 0, endOffset: 4 }, { index: 1, startOffset: 6, endOffset: 9 }], 10)).toBe(false)
    expect(coversExactly([{ index: 0, startOffset: 0, endOffset: 5 }, { index: 1, startOffset: 5, endOffset: 9 }], 10)).toBe(false)
  })
})
