/**
 * Decodes one URL path segment into a file name hint, or null when there is
 * nothing usable.
 */
export function segmentName(segment: string | undefined): string | null {
	if (segment === undefined || segment === '') return null
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}