/**
 * The server answered with a non-success HTTP status.
 * `retryAfterMs` carries a parsed `Retry-After` header when one was sent.
 */
export class HttpStatusError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null = null) {
    super(`The server responded with HTTP ${status}`)
    this.name = 'HttpStatusError'
  }
}

/**
 * The destination is not allowed by the network policy.
 */
export class BlockedDestinationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockedDestinationError'
  }
}

export class TooManyRedirectsError extends Error {
  constructor() {
    super('The server redirected too many times')
    this.name = 'TooManyRedirectsError'
  }
}

/**
 * A ranged response did not match the request, so the server cannot be
 * trusted to serve byte ranges correctly.
 */
export class InvalidRangeResponseError extends Error {
  constructor() {
    super('The server returned an invalid range response')
    this.name = 'InvalidRangeResponseError'
  }
}

/**
 * The response body ended before the expected number of bytes arrived.
 */
export class IncompleteResponseError extends Error {
  constructor() {
    super('The connection ended before the full response arrived')
    this.name = 'IncompleteResponseError'
  }
}

/**
 * The remote file changed while it was being downloaded.
 */
export class RemoteChangedError extends Error {
  constructor() {
    super('The remote file changed during the download')
    this.name = 'RemoteChangedError'
  }
}

export class ChecksumMismatchError extends Error {
  constructor(readonly expected: string, readonly actual: string) {
    super('The downloaded file does not match the expected SHA-256 checksum')
    this.name = 'ChecksumMismatchError'
  }
}

/**
 * A resolver could not turn a page URL into a downloadable file.
 */
export class ResolverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResolverError'
  }
}

export class UnsupportedUrlError extends Error {
  constructor(message: string = 'Only http and https URLs are supported') {
    super(message)
    this.name = 'UnsupportedUrlError'
  }
}
