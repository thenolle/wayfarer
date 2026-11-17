import type { SegmentRange, SegmentRecord } from '../domain/records'

export const MIN_SEGMENT_BYTES = 1024 * 1024

/**
 * Splits `totalBytes` into at most `maxSegments` contiguous, non-overlapping
 * ranges of near-equal size. No segment is smaller than `minSegmentBytes`
 * unless the whole file is smaller, in which case one segment is returned.
 *
 * @throws {RangeError} when an argument is not a valid size or count.
 */
export function planSegments(totalBytes: number, maxSegments: number, minSegmentBytes: number = MIN_SEGMENT_BYTES): SegmentRange[] {
	if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new RangeError('totalBytes must be a non-negative integer')
	if (!Number.isSafeInteger(maxSegments) || maxSegments < 1) throw new RangeError('maxSegments must be a positive integer')
	if (!Number.isSafeInteger(minSegmentBytes) || minSegmentBytes < 1) throw new RangeError('minSegmentBytes must be a positive integer')
	if (totalBytes === 0) return []
	const count = Math.max(1, Math.min(maxSegments, Math.floor(totalBytes / minSegmentBytes)))
	const baseLength = Math.floor(totalBytes / count)
	const remainder = totalBytes % count
	const ranges: SegmentRange[] = []
	let start = 0
	for (let index = 0; index < count; index += 1) {
		const length = baseLength + (index < remainder ? 1 : 0)
		const end = start + length - 1
		ranges.push({ index, startOffset: start, endOffset: end })
		start = end + 1
	}
	return ranges
}

export function segmentLength(range: SegmentRange): number {
	return range.endOffset - range.startOffset + 1
}

/**
 * Number of bytes of the segment that are durably on disk.
 */
export function durableBytes(segment: SegmentRecord): number {
	return segment.durableOffset - segment.startOffset
}

export function isSegmentComplete(segment: SegmentRecord): boolean {
	return segment.durableOffset === segment.endOffset + 1
}

/**
 * Returns true when the segments, ordered by index, start at byte 0, touch
 * without gaps or overlaps and end at the last byte of the file.
 */
export function coversExactly(segments: readonly SegmentRange[], totalBytes: number): boolean {
	if (segments.length === 0) return totalBytes === 0
	const ordered = [...segments].sort((a, b) => a.index - b.index)
	let expectedStart = 0
	for (const segment of ordered) {
		if (segment.startOffset !== expectedStart || segment.endOffset < segment.startOffset) return false
		expectedStart = segment.endOffset + 1
	}
	return expectedStart === totalBytes
}
