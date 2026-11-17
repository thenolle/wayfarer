/**
 * Verification state of a download's SHA-256 checksum.
 */
export type ChecksumStatus =
	| { readonly state: 'not-requested' }
	| { readonly state: 'pending'; readonly expected: string }
	| { readonly state: 'verified'; readonly sha256: string }
	| { readonly state: 'mismatch'; readonly expected: string; readonly actual: string }

const SHA256_HEX = /^[0-9a-f]{64}$/

/**
 * Returns the lowercase form of a SHA-256 hex digest, or null when `value` is
 * not a valid digest.
 */
export function normalizeSha256(value: string): string | null {
	const normalized = value.trim().toLowerCase()
	return SHA256_HEX.test(normalized) ? normalized : null
}

export function checksumStatus(download: { readonly expectedSha256: string | null, readonly actualSha256: string | null }): ChecksumStatus {
	const { expectedSha256, actualSha256 } = download
	if (expectedSha256 === null) return { state: 'not-requested' }
	if (actualSha256 === null) return { state: 'pending', expected: expectedSha256 }
	if (actualSha256.toLowerCase() === expectedSha256.toLowerCase()) return { state: 'verified', sha256: actualSha256 }
	return { state: 'mismatch', expected: expectedSha256, actual: actualSha256 }
}
