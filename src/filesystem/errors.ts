/**
 * Narrows an unknown thrown value to a Node-style system error.
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

/**
 * Raised when finalising a download would replace an existing file.
 */
export class DestinationExistsError extends Error {
  constructor() {
    super('A file already exists at the destination')
    this.name = 'DestinationExistsError'
  }
}

/**
 * Raised when a resolved path would fall outside its allowed root directory.
 */
export class PathEscapeError extends Error {
  constructor() {
    super('The path is outside the allowed directory')
    this.name = 'PathEscapeError'
  }
}
