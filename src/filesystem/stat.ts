import { stat } from 'node:fs/promises'
import { isErrnoException } from './errors'

/**
 * The size of a file in bytes, or null when it does not exist.
 */
export async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return null
    throw error
  }
}
