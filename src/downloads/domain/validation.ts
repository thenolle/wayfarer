
export const MIN_PRIORITY = -100
export const MAX_PRIORITY = 100

/**
 * Raised when user-supplied download input is invalid. The message is safe to
 * show to the user.
 */
export class InvalidDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDownloadError'
  }
}

export function isValidPriority(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PRIORITY && value <= MAX_PRIORITY
}
